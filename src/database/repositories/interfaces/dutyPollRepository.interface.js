class DutyPollRepository {
  async findByTelegramPollId(_telegramPollId) {
    throw new Error("Not implemented");
  }

  async findUnresolvedDue(_at) {
    throw new Error("Not implemented");
  }

  async create(_input) {
    throw new Error("Not implemented");
  }

  async updateById(_id, _input) {
    throw new Error("Not implemented");
  }
}

module.exports = { DutyPollRepository };
