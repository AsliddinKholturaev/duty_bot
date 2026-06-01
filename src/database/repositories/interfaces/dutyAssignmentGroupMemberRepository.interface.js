class DutyAssignmentGroupMemberRepository {
  async findByGroupId(_groupId) {
    throw new Error("Not implemented");
  }

  async addMember(_input) {
    throw new Error("Not implemented");
  }

  async removeMember(_groupId, _userId) {
    throw new Error("Not implemented");
  }
}

module.exports = { DutyAssignmentGroupMemberRepository };
