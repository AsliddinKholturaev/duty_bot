class PrismaRoomRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findAllActive() {
    return this.prisma.room.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
    });
  }

  async findByCode(code) {
    return this.prisma.room.findUnique({
      where: { code: String(code).toLowerCase() },
    });
  }

  async create(input) {
    return this.prisma.room.create({
      data: {
        code: String(input.code).toLowerCase(),
        name: input.name,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateByCode(code, input) {
    return this.prisma.room.update({
      where: { code: String(code).toLowerCase() },
      data: {
        name: input.name,
        isActive: input.isActive,
      },
    });
  }
}

module.exports = { PrismaRoomRepository };
