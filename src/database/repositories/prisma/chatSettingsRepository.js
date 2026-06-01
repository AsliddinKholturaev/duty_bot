class PrismaChatSettingsRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByTelegramChatId(telegramChatId) {
    return this.prisma.chatSettings.findUnique({
      where: { telegramChatId: BigInt(telegramChatId) },
    });
  }

  async findFirst() {
    return this.prisma.chatSettings.findFirst({
      orderBy: [{ id: "asc" }],
    });
  }

  async upsertByTelegramChatId(telegramChatId, input) {
    return this.prisma.chatSettings.upsert({
      where: { telegramChatId: BigInt(telegramChatId) },
      update: {
        title: input.title,
        timezone: input.timezone,
        language: input.language,
      },
      create: {
        telegramChatId: BigInt(telegramChatId),
        title: input.title ?? null,
        timezone: input.timezone ?? "UTC",
        language: input.language ?? "en",
      },
    });
  }
}

module.exports = { PrismaChatSettingsRepository };
