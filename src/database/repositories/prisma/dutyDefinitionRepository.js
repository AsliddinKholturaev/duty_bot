class PrismaDutyDefinitionRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findAll() {
    return this.prisma.dutyDefinition.findMany({
      orderBy: [{ code: "asc" }],
    });
  }

  async findByCode(code) {
    return this.prisma.dutyDefinition.findUnique({
      where: { code: String(code) },
    });
  }

  async findActive() {
    return this.prisma.dutyDefinition.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
    });
  }

  async create(input) {
    return this.prisma.dutyDefinition.create({
      data: {
        code: String(input.code),
        builtinType: input.builtinType ?? null,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        isActive: input.isActive ?? true,
        assignmentMode: input.assignmentMode,
        rotationIntervalHours: input.rotationIntervalHours ?? null,
        rotationIntervalDays: input.rotationIntervalDays ?? null,
        scheduleCron: input.scheduleCron ?? null,
        requiresPoll: input.requiresPoll ?? false,
        pollLeadHours: input.pollLeadHours ?? null,
        pollDurationMinutes: input.pollDurationMinutes ?? null,
        tieKeepsCurrent: input.tieKeepsCurrent ?? true,
        failureKeepsCurrent: input.failureKeepsCurrent ?? true,
        metadata: input.metadata ?? null,
      },
    });
  }

  async updateById(id, input) {
    return this.prisma.dutyDefinition.update({
      where: { id: Number(id) },
      data: {
        code: input.code,
        builtinType: input.builtinType,
        name: input.name,
        description: input.description,
        category: input.category,
        isActive: input.isActive,
        assignmentMode: input.assignmentMode,
        rotationIntervalHours: input.rotationIntervalHours,
        rotationIntervalDays: input.rotationIntervalDays,
        scheduleCron: input.scheduleCron,
        requiresPoll: input.requiresPoll,
        pollLeadHours: input.pollLeadHours,
        pollDurationMinutes: input.pollDurationMinutes,
        tieKeepsCurrent: input.tieKeepsCurrent,
        failureKeepsCurrent: input.failureKeepsCurrent,
        metadata: input.metadata,
      },
    });
  }
}

module.exports = { PrismaDutyDefinitionRepository };
