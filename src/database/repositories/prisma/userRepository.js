class PrismaUserRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findAllActive() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ id: "asc" }],
    });
  }

  async findById(id) {
    if (id == null) {
      return null;
    }

    return this.prisma.user.findUnique({
      where: { id: Number(id) },
    });
  }

  async findByTelegramUserId(telegramUserId) {
    if (telegramUserId == null) {
      return null;
    }

    return this.prisma.user.findUnique({
      where: { telegramUserId: BigInt(telegramUserId) },
    });
  }

  async create(input) {
    if (input == null || input.telegramUserId == null) {
      throw new Error("telegramUserId is required");
    }

    return this.prisma.user.create({
      data: {
        telegramUserId: BigInt(input.telegramUserId),
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateById(id, input) {
    if (id == null) {
      throw new Error("id is required");
    }

    return this.prisma.user.update({
      where: { id: Number(id) },
      data: {
        telegramUserId:
          input.telegramUserId != null
            ? BigInt(input.telegramUserId)
            : undefined,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        isActive: input.isActive,
      },
    });
  }
}

module.exports = { PrismaUserRepository };
