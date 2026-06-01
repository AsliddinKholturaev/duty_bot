class DutyRuntimeStateRepository {
  async findByDutyDefinitionId(_dutyDefinitionId) {
    throw new Error("Not implemented");
  }

  async findDueRotations(_at) {
    throw new Error("Not implemented");
  }

  async create(_input) {
    throw new Error("Not implemented");
  }

  async updateByDutyDefinitionId(_dutyDefinitionId, _input) {
    throw new Error("Not implemented");
  }
}

module.exports = { DutyRuntimeStateRepository };
