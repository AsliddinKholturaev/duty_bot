class PrismaDutyAssignmentQueueRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByDutyDefinitionId(dutyDefinitionId) {
    return this.prisma.dutyAssignmentQueue.findMany({
      where: { dutyDefinitionId: Number(dutyDefinitionId) },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      include: { user: true },
    });
  }

  async addQueueMember(input) {
    return this.prisma.dutyAssignmentQueue.create({
      data: {
        dutyDefinitionId: Number(input.dutyDefinitionId),
        userId: Number(input.userId),
        position: input.position,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updatePosition(id, position) {
    return this.prisma.dutyAssignmentQueue.update({
      where: { id: Number(id) },
      data: { position: Number(position) },
    });
  }

  async removeQueueMember(dutyDefinitionId, userId) {
    return this.prisma.dutyAssignmentQueue.deleteMany({
      where: {
        dutyDefinitionId: Number(dutyDefinitionId),
        userId: Number(userId),
      },
    });
  }
}

module.exports = { PrismaDutyAssignmentQueueRepository };
