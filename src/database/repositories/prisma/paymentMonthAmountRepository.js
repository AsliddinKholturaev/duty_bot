class PrismaPaymentMonthAmountRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByMonthKey(monthKey) {
    return this.prisma.paymentMonthAmount.findUnique({
      where: { monthKey: String(monthKey) },
    });
  }

  async findLatest() {
    return this.prisma.paymentMonthAmount.findFirst({
      orderBy: [{ setAt: "desc" }, { id: "desc" }],
    });
  }

  async upsertByMonthKey(monthKey, input) {
    return this.prisma.paymentMonthAmount.upsert({
      where: { monthKey: String(monthKey) },
      update: {
        perPersonAmount: input.perPersonAmount,
        currency: input.currency,
        source: input.source,
        setByUserId: input.setByUserId ?? null,
        setAt: input.setAt,
        note: input.note,
      },
      create: {
        monthKey: String(monthKey),
        perPersonAmount: input.perPersonAmount,
        currency: input.currency,
        source: input.source,
        setByUserId: input.setByUserId ?? null,
        setAt: input.setAt ?? new Date(),
        note: input.note ?? null,
      },
    });
  }
}

module.exports = { PrismaPaymentMonthAmountRepository };
