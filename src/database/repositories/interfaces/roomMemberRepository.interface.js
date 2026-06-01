class RoomMemberRepository {
  async findByRoomId(_roomId) {
    throw new Error("Not implemented");
  }

  async findByUserId(_userId) {
    throw new Error("Not implemented");
  }

  async upsertMembership(_roomId, _userId, _input) {
    throw new Error("Not implemented");
  }

  async removeByUserId(_userId) {
    throw new Error("Not implemented");
  }
}

module.exports = { RoomMemberRepository };
