class KitchenRepository {
  async findKitchenDuty() {
    throw new Error("Not implemented");
  }

  async createKitchenDuty(_input) {
    throw new Error("Not implemented");
  }

  async updateKitchenDuty(_input) {
    throw new Error("Not implemented");
  }

  async deleteKitchenDuty() {
    throw new Error("Not implemented");
  }

  async listQueue() {
    throw new Error("Not implemented");
  }

  async addQueueMember(_userId, _options) {
    throw new Error("Not implemented");
  }

  async removeQueueMember(_userId) {
    throw new Error("Not implemented");
  }

  async moveQueueMember(_userId, _newPosition) {
    throw new Error("Not implemented");
  }

  async getCurrentAssignee() {
    throw new Error("Not implemented");
  }

  async setCurrentAssigneeByUserId(_userId, _options) {
    throw new Error("Not implemented");
  }

  async rotateToNextAssignee(_options) {
    throw new Error("Not implemented");
  }
}

module.exports = { KitchenRepository };
