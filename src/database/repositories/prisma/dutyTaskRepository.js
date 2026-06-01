class PrismaDutyTaskRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByDutyDefinitionId(dutyDefinitionId) {
    return this.prisma.dutyTask.findMany({
      where: { dutyDefinitionId: Number(dutyDefinitionId) },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
  }

  async create(input) {
    return this.prisma.$transaction(async (tx) => {
      const dutyDefinitionId = Number(input.dutyDefinitionId);
      const position =
        input.position ??
        (await tx.dutyTask.count({
          where: { dutyDefinitionId },
        })) + 1;

      return tx.dutyTask.create({
        data: {
          dutyDefinitionId,
          taskText: input.taskText,
          position,
          isActive: input.isActive ?? true,
          createdByUserId: input.createdByUserId ?? null,
        },
      });
    });
  }

  async removeById(id) {
    return this.prisma.dutyTask.delete({
      where: { id: Number(id) },
    });
  }

  async clearByDutyDefinitionId(dutyDefinitionId) {
    return this.prisma.dutyTask.deleteMany({
      where: { dutyDefinitionId: Number(dutyDefinitionId) },
    });
  }
}

module.exports = { PrismaDutyTaskRepository };
