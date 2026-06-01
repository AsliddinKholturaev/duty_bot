class PrismaUserMonthlyDutyStatRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByMonthKey(monthKey) {
    return this.prisma.userMonthlyDutyStat.findMany({
      where: { monthKey: String(monthKey) },
      orderBy: [{ badDutyCount: "desc" }, { userId: "asc" }],
    });
  }

  async incrementBadDuty(userId, monthKey) {
    return this.prisma.userMonthlyDutyStat.upsert({
      where: {
        userId_monthKey: {
          userId: Number(userId),
          monthKey: String(monthKey),
        },
      },
      update: {
        badDutyCount: { increment: 1 },
        lastIncrementedAt: new Date(),
      },
      create: {
        userId: Number(userId),
        monthKey: String(monthKey),
        badDutyCount: 1,
        lastIncrementedAt: new Date(),
      },
    });
  }

  async findOffenders(monthKey, threshold) {
    return this.prisma.userMonthlyDutyStat.findMany({
      where: {
        monthKey: String(monthKey),
        badDutyCount: { gte: Number(threshold) },
      },
      orderBy: [{ badDutyCount: "desc" }, { userId: "asc" }],
      include: { user: true },
    });
  }
}

module.exports = { PrismaUserMonthlyDutyStatRepository };
