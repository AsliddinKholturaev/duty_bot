const MS_IN_HOUR = 60 * 60 * 1000;
const KITCHEN_ROTATION_HOURS = 48;
const KITCHEN_DUTY_CODE_CANDIDATES = [
  "KITCHEN_TRASH",
  "kitchen",
  "kitchen_trash",
];

class KitchenDutyService {
  constructor({
    dutyDefinitionRepository,
    dutyRuntimeStateRepository,
    dutyAssignmentQueueRepository,
    userRepository,
    now = () => new Date(),
  }) {
    if (!dutyDefinitionRepository) {
      throw new Error("KitchenDutyService requires dutyDefinitionRepository");
    }

    if (!dutyRuntimeStateRepository) {
      throw new Error("KitchenDutyService requires dutyRuntimeStateRepository");
    }

    if (!dutyAssignmentQueueRepository) {
      throw new Error(
        "KitchenDutyService requires dutyAssignmentQueueRepository",
      );
    }

    if (!userRepository) {
      throw new Error("KitchenDutyService requires userRepository");
    }

    this.dutyDefinitionRepository = dutyDefinitionRepository;
    this.dutyRuntimeStateRepository = dutyRuntimeStateRepository;
    this.dutyAssignmentQueueRepository = dutyAssignmentQueueRepository;
    this.userRepository = userRepository;
    this.now = now;
  }

  async getCurrentAssignee() {
    const definition = await this._getKitchenDefinition();
    const queue = await this._getSortedKitchenQueue(definition.id);

    if (queue.length === 0) {
      return {
        dutyDefinition: definition,
        assignee: null,
        runtimeState: null,
        nextRotationAt: null,
      };
    }

    const runtimeState = await this._ensureRuntimeState(definition.id, queue);
    const currentQueueItem = this._resolveCurrentQueueItem(
      queue,
      runtimeState.currentQueuePosition,
    );

    const assignee = await this.userRepository.findById(
      currentQueueItem.userId,
    );

    if (!assignee) {
      throw new Error(
        `Kitchen assignee user not found for userId=${currentQueueItem.userId}`,
      );
    }

    return {
      dutyDefinition: definition,
      assignee,
      queueItem: currentQueueItem,
      runtimeState,
      nextRotationAt: runtimeState.nextRotationAt,
    };
  }

  async rotateIfDue({ force = false } = {}) {
    const definition = await this._getKitchenDefinition();
    const queue = await this._getSortedKitchenQueue(definition.id);

    if (queue.length === 0) {
      return {
        rotated: false,
        reason: "QUEUE_EMPTY",
        previousAssignee: null,
        currentAssignee: null,
        nextRotationAt: null,
      };
    }

    const runtimeState = await this._ensureRuntimeState(definition.id, queue);
    const now = this.now();
    const nextRotationAt = this._toDate(runtimeState.nextRotationAt);
    const isDue = force || now >= nextRotationAt;

    const currentQueueItem = this._resolveCurrentQueueItem(
      queue,
      runtimeState.currentQueuePosition,
    );
    const currentAssignee = await this.userRepository.findById(
      currentQueueItem.userId,
    );

    if (!isDue) {
      return {
        rotated: false,
        reason: "NOT_DUE",
        previousAssignee: currentAssignee,
        currentAssignee,
        nextRotationAt,
      };
    }

    const nextQueueItem = this._resolveNextQueueItem(
      queue,
      currentQueueItem.position,
    );
    const updatedRuntimeState = {
      currentQueuePosition: nextQueueItem.position,
      currentStartedAt: now,
      nextRotationAt: this._calculateNextRotationAt(now),
      status: "ACTIVE",
    };

    await this.dutyRuntimeStateRepository.updateByDutyDefinitionId(
      definition.id,
      updatedRuntimeState,
    );

    const nextAssignee = await this.userRepository.findById(
      nextQueueItem.userId,
    );

    if (!nextAssignee) {
      throw new Error(
        `Kitchen next assignee user not found for userId=${nextQueueItem.userId}`,
      );
    }

    return {
      rotated: true,
      reason: force ? "FORCED" : "DUE",
      previousAssignee: currentAssignee,
      currentAssignee: nextAssignee,
      previousQueueItem: currentQueueItem,
      currentQueueItem: nextQueueItem,
      nextRotationAt: updatedRuntimeState.nextRotationAt,
    };
  }

  async getKitchenQueue() {
    const definition = await this._getKitchenDefinition();
    const queue = await this._getSortedKitchenQueue(definition.id);

    if (queue.length === 0) {
      return [];
    }

    const users = await Promise.all(
      queue.map((item) => this.userRepository.findById(item.userId)),
    );

    return queue.map((item, index) => ({
      position: item.position,
      userId: item.userId,
      user: users[index] || null,
      isActive: item.isActive,
    }));
  }

  async _getKitchenDefinition() {
    for (const code of KITCHEN_DUTY_CODE_CANDIDATES) {
      const definition = await this.dutyDefinitionRepository.findByCode(code);

      if (definition) {
        this._validateKitchenDefinition(definition);
        return definition;
      }
    }

    throw new Error("Kitchen duty definition not found");
  }

  _validateKitchenDefinition(definition) {
    if (!definition.isActive) {
      throw new Error("Kitchen duty definition is inactive");
    }

    if (definition.assignmentMode && definition.assignmentMode !== "SINGLE") {
      throw new Error("Kitchen duty assignmentMode must be SINGLE");
    }

    const configuredHours = definition.rotationIntervalHours;

    if (
      configuredHours != null &&
      Number(configuredHours) !== KITCHEN_ROTATION_HOURS
    ) {
      throw new Error(
        `Kitchen rotation interval must be ${KITCHEN_ROTATION_HOURS} hours, received ${configuredHours}`,
      );
    }
  }

  async _getSortedKitchenQueue(dutyDefinitionId) {
    const queue =
      await this.dutyAssignmentQueueRepository.findByDutyDefinitionId(
        dutyDefinitionId,
      );
    const activeQueue = (queue || []).filter((item) => item.isActive !== false);

    return activeQueue.sort((a, b) => a.position - b.position);
  }

  async _ensureRuntimeState(dutyDefinitionId, queue) {
    let runtimeState =
      await this.dutyRuntimeStateRepository.findByDutyDefinitionId(
        dutyDefinitionId,
      );

    if (runtimeState) {
      return runtimeState;
    }

    if (queue.length === 0) {
      throw new Error(
        "Cannot create kitchen runtime state without queue items",
      );
    }

    const now = this.now();
    runtimeState = await this.dutyRuntimeStateRepository.create({
      dutyDefinitionId,
      currentQueuePosition: queue[0].position,
      currentGroupPosition: null,
      currentStartedAt: now,
      nextRotationAt: this._calculateNextRotationAt(now),
      status: "ACTIVE",
    });

    return runtimeState;
  }

  _resolveCurrentQueueItem(queue, currentPosition) {
    if (!queue.length) {
      throw new Error("Cannot resolve current queue item from empty queue");
    }

    const directMatch = queue.find((item) => item.position === currentPosition);

    if (directMatch) {
      return directMatch;
    }

    return queue[0];
  }

  _resolveNextQueueItem(queue, currentPosition) {
    if (!queue.length) {
      throw new Error("Cannot resolve next queue item from empty queue");
    }

    const currentIndex = queue.findIndex(
      (item) => item.position === currentPosition,
    );

    if (currentIndex === -1) {
      return queue[0];
    }

    const nextIndex = (currentIndex + 1) % queue.length;

    return queue[nextIndex];
  }

  _calculateNextRotationAt(baseDate) {
    return new Date(
      this._toDate(baseDate).getTime() + KITCHEN_ROTATION_HOURS * MS_IN_HOUR,
    );
  }

  _toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }
}

function createKitchenDutyService(deps) {
  return new KitchenDutyService(deps);
}

module.exports = {
  KitchenDutyService,
  createKitchenDutyService,
  KITCHEN_ROTATION_HOURS,
};
