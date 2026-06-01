class PrismaPaymentSettingsRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findDefault() {
    return this.prisma.paymentSettings.findUnique({
      where: { singletonKey: "default" },
    });
  }

  async upsertDefault(input) {
    return this.prisma.paymentSettings.upsert({
      where: { singletonKey: "default" },
      update: {
        isActive: input.isActive,
        reminderDayOfMonth: input.reminderDayOfMonth,
        collectionDayOfMonth: input.collectionDayOfMonth,
        paymentMode: input.paymentMode,
        cardHolderName: input.cardHolderName,
        cardNumberMasked: input.cardNumberMasked,
        cashInstruction: input.cashInstruction,
        note: input.note,
        defaultPerPersonAmount: input.defaultPerPersonAmount,
        amountCurrency: input.amountCurrency,
        lastConfirmedAmountMonth: input.lastConfirmedAmountMonth,
      },
      create: {
        singletonKey: "default",
        isActive: input.isActive ?? true,
        reminderDayOfMonth: input.reminderDayOfMonth ?? 13,
        collectionDayOfMonth: input.collectionDayOfMonth ?? 15,
        paymentMode: input.paymentMode ?? "CARD_OR_CASH",
        cardHolderName: input.cardHolderName ?? null,
        cardNumberMasked: input.cardNumberMasked ?? null,
        cashInstruction: input.cashInstruction ?? null,
        note: input.note ?? null,
        defaultPerPersonAmount: input.defaultPerPersonAmount ?? null,
        amountCurrency: input.amountCurrency ?? "USD",
        lastConfirmedAmountMonth: input.lastConfirmedAmountMonth ?? null,
      },
    });
  }
}

module.exports = { PrismaPaymentSettingsRepository };
