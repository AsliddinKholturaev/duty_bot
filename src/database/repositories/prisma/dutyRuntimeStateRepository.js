class PrismaDutyRuntimeStateRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByDutyDefinitionId(dutyDefinitionId) {
    return this.prisma.dutyRuntimeState.findUnique({
      where: { dutyDefinitionId: Number(dutyDefinitionId) },
    });
  }

  async findDueRotations(at) {
    const threshold = at instanceof Date ? at : new Date(at);

    return this.prisma.dutyRuntimeState.findMany({
      where: {
        status: "ACTIVE",
        nextRotationAt: { lte: threshold },
      },
      orderBy: [{ nextRotationAt: "asc" }],
    });
  }

  async create(input) {
    return this.prisma.dutyRuntimeState.create({
      data: {
        dutyDefinitionId: Number(input.dutyDefinitionId),
        currentQueuePosition: input.currentQueuePosition ?? null,
        currentGroupPosition: input.currentGroupPosition ?? null,
        currentStartedAt: input.currentStartedAt,
        nextRotationAt: input.nextRotationAt,
        lastReminderAt: input.lastReminderAt ?? null,
        lastPollAt: input.lastPollAt ?? null,
        status: input.status ?? "ACTIVE",
      },
    });
  }

  async updateByDutyDefinitionId(dutyDefinitionId, input) {
    return this.prisma.dutyRuntimeState.update({
      where: { dutyDefinitionId: Number(dutyDefinitionId) },
      data: {
        currentQueuePosition:
          input.currentQueuePosition !== undefined
            ? input.currentQueuePosition
            : undefined,
        currentGroupPosition:
          input.currentGroupPosition !== undefined
            ? input.currentGroupPosition
            : undefined,
        currentStartedAt: input.currentStartedAt,
        nextRotationAt: input.nextRotationAt,
        lastReminderAt: input.lastReminderAt,
        lastPollAt: input.lastPollAt,
        status: input.status,
      },
    });
  }
}

module.exports = { PrismaDutyRuntimeStateRepository };
