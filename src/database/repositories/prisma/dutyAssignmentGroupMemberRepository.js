class PrismaDutyAssignmentGroupMemberRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByGroupId(groupId) {
    return this.prisma.dutyAssignmentGroupMember.findMany({
      where: { groupId: Number(groupId) },
      orderBy: [{ id: "asc" }],
      include: { user: true },
    });
  }

  async addMember(input) {
    return this.prisma.dutyAssignmentGroupMember.create({
      data: {
        groupId: Number(input.groupId),
        userId: Number(input.userId),
      },
    });
  }

  async removeMember(groupId, userId) {
    return this.prisma.dutyAssignmentGroupMember.deleteMany({
      where: {
        groupId: Number(groupId),
        userId: Number(userId),
      },
    });
  }
}

module.exports = { PrismaDutyAssignmentGroupMemberRepository };
