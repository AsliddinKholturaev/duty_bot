class PrismaAdminRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findAll() {
    return this.prisma.admin.findMany({
      include: { user: true },
      orderBy: [{ id: "asc" }],
    });
  }

  async findByUserId(userId) {
    return this.prisma.admin.findUnique({
      where: { userId: Number(userId) },
    });
  }

  async create(input) {
    return this.prisma.admin.create({
      data: { userId: Number(input.userId) },
    });
  }

  async removeByUserId(userId) {
    return this.prisma.admin.deleteMany({
      where: { userId: Number(userId) },
    });
  }
}

module.exports = { PrismaAdminRepository };
