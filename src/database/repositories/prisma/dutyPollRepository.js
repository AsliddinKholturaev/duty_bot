class PrismaDutyPollRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByTelegramPollId(telegramPollId) {
    return this.prisma.dutyPoll.findUnique({
      where: { telegramPollId: String(telegramPollId) },
    });
  }

  async findUnresolvedDue(at) {
    const threshold = at instanceof Date ? at : new Date(at);

    if (!Number.isFinite(threshold.getTime())) {
      return [];
    }

    return this.prisma.dutyPoll.findMany({
      where: {
        decisionApplied: false,
        resolvedAt: null,
        closesAt: { lte: threshold },
      },
      orderBy: [{ closesAt: "asc" }],
    });
  }

  async create(input) {
    return this.prisma.dutyPoll.create({
      data: {
        dutyDefinitionId: Number(input.dutyDefinitionId),
        runtimeStateId: Number(input.runtimeStateId),
        telegramPollId: String(input.telegramPollId),
        telegramMessageId:
          input.telegramMessageId != null
            ? BigInt(input.telegramMessageId)
            : null,
        question: input.question,
        yesVotes: input.yesVotes ?? 0,
        noVotes: input.noVotes ?? 0,
        openedAt: input.openedAt,
        closesAt: input.closesAt,
        resolvedAt: input.resolvedAt ?? null,
        result: input.result ?? null,
        decisionApplied: input.decisionApplied ?? false,
      },
    });
  }

  async updateById(id, input) {
    return this.prisma.dutyPoll.update({
      where: { id: Number(id) },
      data: {
        telegramMessageId:
          input.telegramMessageId !== undefined
            ? input.telegramMessageId != null
              ? BigInt(input.telegramMessageId)
              : null
            : undefined,
        question: input.question,
        yesVotes: input.yesVotes,
        noVotes: input.noVotes,
        openedAt: input.openedAt,
        closesAt: input.closesAt,
        resolvedAt: input.resolvedAt,
        result: input.result,
        decisionApplied: input.decisionApplied,
      },
    });
  }
}

module.exports = { PrismaDutyPollRepository };
