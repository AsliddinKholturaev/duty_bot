const DEFAULT_CURRENCY = "USD";

class PaymentService {
  constructor({
    paymentSettingsRepository,
    paymentMonthAmountRepository,
    userRepository,
    notifier,
    now = () => new Date(),
  }) {
    if (!paymentSettingsRepository) {
      throw new Error("PaymentService requires paymentSettingsRepository");
    }

    if (!paymentMonthAmountRepository) {
      throw new Error("PaymentService requires paymentMonthAmountRepository");
    }

    if (!userRepository) {
      throw new Error("PaymentService requires userRepository");
    }

    this.paymentSettingsRepository = paymentSettingsRepository;
    this.paymentMonthAmountRepository = paymentMonthAmountRepository;
    this.userRepository = userRepository;
    this.notifier = notifier;
    this.now = now;
  }

  async sendDay13Reminder({
    chatId,
    adminChatId,
    monthKey,
    notifier = this.notifier,
  } = {}) {
    if (!chatId) {
      throw new Error("sendDay13Reminder requires chatId");
    }

    this._ensureNotifier(notifier);

    const settings = await this._getSettings();

    if (!settings.isActive) {
      return {
        sent: false,
        reason: "PAYMENT_DISABLED",
      };
    }

    const resolvedMonthKey = monthKey || this._toMonthKey(this.now());
    const adminTargetChatId = adminChatId || chatId;

    const groupReminder =
      "Eslatma: 2 kundan keyin kvartira puli yig'iladi. Iltimos, tayyor bo'ling.";
    const adminPrompt = `Admin harakati kerak: shu oy uchun har bir odam to'laydigan summani yuboring. Masalan: /payment-per 60. (oy ${resolvedMonthKey})`;

    await notifier.sendMessage(chatId, groupReminder);
    await notifier.sendMessage(adminTargetChatId, adminPrompt);

    return {
      sent: true,
      monthKey: resolvedMonthKey,
      groupReminder,
      adminPrompt,
      adminTargetChatId,
    };
  }

  async sendDay15Collection({
    chatId,
    monthKey,
    notifier = this.notifier,
  } = {}) {
    if (!chatId) {
      throw new Error("sendDay15Collection requires chatId");
    }

    this._ensureNotifier(notifier);

    const settings = await this._getSettings();

    if (!settings.isActive) {
      return {
        sent: false,
        reason: "PAYMENT_DISABLED",
      };
    }

    const resolvedMonthKey = monthKey || this._toMonthKey(this.now());
    const amountResult = await this.resolveAmountForMonth({
      monthKey: resolvedMonthKey,
    });
    const users = await this.userRepository.findAllActive();
    const mentions = this._buildUserMentions(users || []);

    const destination = this._buildPaymentDestination(settings);
    const amountText = this._formatAmount(
      amountResult.record.perPersonAmount,
      amountResult.record.currency,
    );

    const message =
      `Bugun to'lov kuni. Har bir kishi uchun ${amountText}. ${mentions} ` +
      `${destination}`;

    await notifier.sendMessage(chatId, message);

    return {
      sent: true,
      monthKey: resolvedMonthKey,
      amountRecord: amountResult.record,
      fallbackApplied: amountResult.fallbackApplied,
      message,
      userCount: (users || []).length,
    };
  }

  async resolveAmountForMonth({ monthKey }) {
    const resolvedMonthKey = monthKey || this._toMonthKey(this.now());
    const existing =
      await this.paymentMonthAmountRepository.findByMonthKey(resolvedMonthKey);

    if (existing) {
      return {
        record: existing,
        fallbackApplied: false,
        fallbackSource: null,
      };
    }

    const settings = await this._getSettings();

    if (settings.defaultPerPersonAmount != null) {
      const record = await this.paymentMonthAmountRepository.upsertByMonthKey(
        resolvedMonthKey,
        {
          perPersonAmount: settings.defaultPerPersonAmount,
          currency: settings.amountCurrency || DEFAULT_CURRENCY,
          source: "FALLBACK",
          setByUserId: null,
          note: "PaymentSettings.defaultPerPersonAmount qiymatidan avtomatik fallback ishlatildi",
        },
      );

      return {
        record,
        fallbackApplied: true,
        fallbackSource: "DEFAULT_SETTINGS_AMOUNT",
      };
    }

    const latest = await this.paymentMonthAmountRepository.findLatest();

    if (latest) {
      const record = await this.paymentMonthAmountRepository.upsertByMonthKey(
        resolvedMonthKey,
        {
          perPersonAmount: latest.perPersonAmount,
          currency: latest.currency || DEFAULT_CURRENCY,
          source: "FALLBACK",
          setByUserId: null,
          note: `Oxirgi ma'lum oy (${latest.monthKey || "noma'lum"}) qiymatidan avtomatik fallback ishlatildi`,
        },
      );

      return {
        record,
        fallbackApplied: true,
        fallbackSource: "LATEST_MONTH_AMOUNT",
      };
    }

    throw new Error(
      `No payment amount available for month ${resolvedMonthKey} and no fallback source is configured`,
    );
  }

  async setMonthAmount({
    amount,
    currency,
    monthKey,
    source = "COMMAND",
    setByUserId = null,
    note = null,
  }) {
    const resolvedMonthKey = monthKey || this._toMonthKey(this.now());
    const normalizedAmount = this._normalizePositiveAmount(amount);
    const normalizedCurrency = this._normalizeCurrency(currency);

    return this.paymentMonthAmountRepository.upsertByMonthKey(
      resolvedMonthKey,
      {
        perPersonAmount: normalizedAmount,
        currency: normalizedCurrency,
        source,
        setByUserId,
        note,
      },
    );
  }

  async getCurrentAmount({ monthKey } = {}) {
    return this.resolveAmountForMonth({ monthKey });
  }

  async _getSettings() {
    const existing = await this.paymentSettingsRepository.findDefault();

    if (existing) {
      return existing;
    }

    return this.paymentSettingsRepository.upsertDefault({
      isActive: true,
      reminderDayOfMonth: 13,
      collectionDayOfMonth: 15,
      paymentMode: "CARD_OR_CASH",
      amountCurrency: DEFAULT_CURRENCY,
    });
  }

  _buildUserMentions(users) {
    const mentions = users
      .map((user) => {
        if (!user) {
          return null;
        }

        if (user.username) {
          return `@${user.username}`;
        }

        if (user.firstName || user.lastName) {
          return `${user.firstName || ""} ${user.lastName || ""}`.trim();
        }

        return user.id != null ? `user:${user.id}` : null;
      })
      .filter(Boolean);

    if (mentions.length === 0) {
      return "hamma";
    }

    return mentions.join(" ");
  }

  _buildPaymentDestination(settings) {
    const mode = settings.paymentMode || "CARD_OR_CASH";
    const cardText = this._buildCardInstruction(settings);
    const cashText = this._buildCashInstruction(settings);

    if (mode === "CARD") {
      return cardText || "Iltimos, sozlangan kartaga o'tkazing.";
    }

    if (mode === "CASH") {
      return cashText || "Iltimos, sozlangan tartibda naqd pul bering.";
    }

    if (cardText && cashText) {
      return `${cardText} yoki ${cashText}`;
    }

    return (
      cardText ||
      cashText ||
      "Iltimos, sozlangan to'lov ma'lumotlari orqali to'lang."
    );
  }

  _buildCardInstruction(settings) {
    if (!settings.cardNumberMasked && !settings.cardHolderName) {
      return null;
    }

    if (settings.cardNumberMasked && settings.cardHolderName) {
      return `iltimos, ${settings.cardNumberMasked} kartasiga o'tkazing (${settings.cardHolderName})`;
    }

    if (settings.cardNumberMasked) {
      return `iltimos, ${settings.cardNumberMasked} kartasiga o'tkazing`;
    }

    return `iltimos, sozlangan karta egasiga o'tkazing: ${settings.cardHolderName}`;
  }

  _buildCashInstruction(settings) {
    if (settings.cashInstruction) {
      return settings.cashInstruction;
    }

    if (settings.note) {
      return settings.note;
    }

    return null;
  }

  _formatAmount(amount, currency) {
    return `${this._normalizePositiveAmount(amount)} ${this._normalizeCurrency(currency)}`;
  }

  _normalizePositiveAmount(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Payment amount must be a positive number");
    }

    return parsed;
  }

  _normalizeCurrency(value) {
    const text = String(value || DEFAULT_CURRENCY)
      .trim()
      .toUpperCase();

    if (!text) {
      return DEFAULT_CURRENCY;
    }

    return text;
  }

  _toMonthKey(dateLike) {
    const date = this._toDate(dateLike);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
  }

  _toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }

  _ensureNotifier(notifier) {
    if (!notifier || typeof notifier.sendMessage !== "function") {
      throw new Error(
        "PaymentService requires notifier with sendMessage(chatId, text)",
      );
    }
  }
}

function createPaymentService(dependencies) {
  return new PaymentService(dependencies);
}

module.exports = {
  PaymentService,
  createPaymentService,
};
