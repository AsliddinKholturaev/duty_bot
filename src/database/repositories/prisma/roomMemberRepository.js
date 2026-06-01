class PrismaRoomMemberRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByRoomId(roomId) {
    return this.prisma.roomMember.findMany({
      where: { roomId: Number(roomId) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { user: true },
    });
  }

  async findByUserId(userId) {
    return this.prisma.roomMember.findMany({
      where: { userId: Number(userId) },
      include: { room: true },
    });
  }

  async upsertMembership(roomId, userId, input) {
    return this.prisma.roomMember.upsert({
      where: {
        roomId_userId: {
          roomId: Number(roomId),
          userId: Number(userId),
        },
      },
      update: {
        isOwner: input.isOwner,
      },
      create: {
        roomId: Number(roomId),
        userId: Number(userId),
        isOwner: input.isOwner ?? true,
      },
    });
  }

  async removeByUserId(userId) {
    return this.prisma.roomMember.deleteMany({
      where: { userId: Number(userId) },
    });
  }
}

module.exports = { PrismaRoomMemberRepository };
