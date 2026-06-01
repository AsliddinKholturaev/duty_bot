class PrismaDutyAssignmentGroupRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByDutyDefinitionId(dutyDefinitionId) {
    return this.prisma.dutyAssignmentGroup.findMany({
      where: { dutyDefinitionId: Number(dutyDefinitionId) },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
  }

  async create(input) {
    return this.prisma.dutyAssignmentGroup.create({
      data: {
        dutyDefinitionId: Number(input.dutyDefinitionId),
        name: input.name,
        position: input.position,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateById(id, input) {
    return this.prisma.dutyAssignmentGroup.update({
      where: { id: Number(id) },
      data: {
        name: input.name,
        position: input.position,
        isActive: input.isActive,
      },
    });
  }

  async deleteById(id) {
    return this.prisma.dutyAssignmentGroup.delete({
      where: { id: Number(id) },
    });
  }
}

module.exports = { PrismaDutyAssignmentGroupRepository };
