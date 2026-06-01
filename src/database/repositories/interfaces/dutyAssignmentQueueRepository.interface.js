class DutyAssignmentQueueRepository {
  async findByDutyDefinitionId(_dutyDefinitionId) {
    throw new Error("Not implemented");
  }

  async addQueueMember(_input) {
    throw new Error("Not implemented");
  }

  async updatePosition(_id, _position) {
    throw new Error("Not implemented");
  }

  async removeQueueMember(_dutyDefinitionId, _userId) {
    throw new Error("Not implemented");
  }
}

module.exports = { DutyAssignmentQueueRepository };
