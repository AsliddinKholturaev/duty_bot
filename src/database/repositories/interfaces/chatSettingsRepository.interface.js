class ChatSettingsRepository {
  async findByTelegramChatId(_telegramChatId) {
    throw new Error("Not implemented");
  }

  async findFirst() {
    throw new Error("Not implemented");
  }

  async upsertByTelegramChatId(_telegramChatId, _input) {
    throw new Error("Not implemented");
  }
}

module.exports = { ChatSettingsRepository };
