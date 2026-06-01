const DEFAULT_DUTY_RUNTIME_STATUS = "ACTIVE";

class GenericDutyService {
  constructor({
    dutyDefinitionRepository,
    dutyRuntimeStateRepository,
    dutyAssignmentQueueRepository,
    dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository,
    roomRepository,
    roomMemberRepository,
    userRepository,
    now = () => new Date(),
  }) {
    if (!dutyDefinitionRepository) {
      throw new Error("GenericDutyService requires dutyDefinitionRepository");
    }

    if (!dutyRuntimeStateRepository) {
      throw new Error("GenericDutyService requires dutyRuntimeStateRepository");
    }

    if (!dutyAssignmentQueueRepository) {
      throw new Error(
        "GenericDutyService requires dutyAssignmentQueueRepository",
      );
    }

    if (!dutyAssignmentGroupRepository) {
      throw new Error(
        "GenericDutyService requires dutyAssignmentGroupRepository",
      );
    }

    if (!dutyAssignmentGroupMemberRepository) {
      throw new Error(
        "GenericDutyService requires dutyAssignmentGroupMemberRepository",
      );
    }

    if (!roomRepository) {
      throw new Error("GenericDutyService requires roomRepository");
    }

    if (!roomMemberRepository) {
      throw new Error("GenericDutyService requires roomMemberRepository");
    }

    if (!userRepository) {
      throw new Error("GenericDutyService requires userRepository");
    }

    this.dutyDefinitionRepository = dutyDefinitionRepository;
    this.dutyRuntimeStateRepository = dutyRuntimeStateRepository;
    this.dutyAssignmentQueueRepository = dutyAssignmentQueueRepository;
    this.dutyAssignmentGroupRepository = dutyAssignmentGroupRepository;
    this.dutyAssignmentGroupMemberRepository =
      dutyAssignmentGroupMemberRepository;
    this.roomRepository = roomRepository;
    this.roomMemberRepository = roomMemberRepository;
    this.userRepository = userRepository;
    this.now = now;
  }

  async getDutySnapshot(dutyCode) {
    const definition = await this._getDutyDefinition(dutyCode);
    const context = await this._loadAssignmentContext(definition);
    const runtimeState = await this._ensureRuntimeState(definition, context);
    const currentAssignment = await this._resolveCurrentAssignment(
      definition,
      runtimeState,
      context,
    );

    return {
      dutyDefinition: definition,
      runtimeState,
      assignmentMode: definition.assignmentMode,
      currentAssignment,
      nextRotationAt: runtimeState ? runtimeState.nextRotationAt : null,
    };
  }

  async getCurrentAssignment(dutyCode) {
    const snapshot = await this.getDutySnapshot(dutyCode);

    return snapshot.currentAssignment;
  }

  async rotateDutyIfDue({ dutyCode, force = false, at } = {}) {
    if (!dutyCode) {
      throw new Error("rotateDutyIfDue requires dutyCode");
    }

    const evaluatedAt = at ? this._toDate(at) : this.now();
    const definition = await this._getDutyDefinition(dutyCode);
    const context = await this._loadAssignmentContext(definition);
    const runtimeState = await this._ensureRuntimeState(
      definition,
      context,
      evaluatedAt,
    );

    if (!runtimeState) {
      return {
        rotated: false,
        reason: "NO_RUNTIME_STATE",
        dutyDefinition: definition,
      };
    }

    if (definition.assignmentMode === "ROOM") {
      return {
        rotated: false,
        reason: "ROOM_MODE_NON_ROTATIONAL",
        dutyDefinition: definition,
        runtimeState,
        currentAssignment: await this._resolveCurrentAssignment(
          definition,
          runtimeState,
          context,
        ),
      };
    }

    const due =
      force || evaluatedAt >= this._toDate(runtimeState.nextRotationAt);

    if (!due) {
      return {
        rotated: false,
        reason: "NOT_DUE",
        dutyDefinition: definition,
        runtimeState,
        currentAssignment: await this._resolveCurrentAssignment(
          definition,
          runtimeState,
          context,
        ),
      };
    }

    const rotationResult = await this._computeNextRotation(
      definition,
      runtimeState,
      context,
    );

    if (!rotationResult.canRotate) {
      return {
        rotated: false,
        reason: rotationResult.reason,
        dutyDefinition: definition,
        runtimeState,
        currentAssignment: rotationResult.currentAssignment,
      };
    }

    const nextRotationAt = this.calculateNextRotationAt(
      definition,
      evaluatedAt,
    );

    const updatePayload = {
      currentQueuePosition:
        rotationResult.nextQueuePosition === undefined
          ? runtimeState.currentQueuePosition
          : rotationResult.nextQueuePosition,
      currentGroupPosition:
        rotationResult.nextGroupPosition === undefined
          ? runtimeState.currentGroupPosition
          : rotationResult.nextGroupPosition,
      currentStartedAt: evaluatedAt,
      nextRotationAt,
      status: DEFAULT_DUTY_RUNTIME_STATUS,
    };

    await this.dutyRuntimeStateRepository.updateByDutyDefinitionId(
      definition.id,
      updatePayload,
    );

    const updatedRuntimeState =
      await this.dutyRuntimeStateRepository.findByDutyDefinitionId(
        definition.id,
      );

    return {
      rotated: true,
      reason: force ? "FORCED" : "DUE",
      dutyDefinition: definition,
      previousAssignment: rotationResult.currentAssignment,
      currentAssignment: rotationResult.nextAssignment,
      runtimeState: updatedRuntimeState,
    };
  }

  calculateNextRotationAt(dutyDefinition, fromDate = this.now()) {
    const base = this._toDate(fromDate);

    if (dutyDefinition.rotationIntervalHours != null) {
      return new Date(
        base.getTime() +
          Number(dutyDefinition.rotationIntervalHours) * 60 * 60 * 1000,
      );
    }

    if (dutyDefinition.rotationIntervalDays != null) {
      return new Date(
        base.getTime() +
          Number(dutyDefinition.rotationIntervalDays) * 24 * 60 * 60 * 1000,
      );
    }

    throw new Error(
      `Duty ${dutyDefinition.code} does not define rotationIntervalHours or rotationIntervalDays`,
    );
  }

  async _getDutyDefinition(dutyCode) {
    const definition = await this.dutyDefinitionRepository.findByCode(dutyCode);

    if (!definition) {
      throw new Error(`Duty definition not found for code=${dutyCode}`);
    }

    if (!definition.isActive) {
      throw new Error(`Duty definition is inactive for code=${dutyCode}`);
    }

    if (!definition.assignmentMode) {
      throw new Error(
        `Duty definition is missing assignmentMode for code=${dutyCode}`,
      );
    }

    return definition;
  }

  async _loadAssignmentContext(definition) {
    switch (definition.assignmentMode) {
      case "SINGLE":
        return this._loadSingleAssignmentContext(definition.id);
      case "PAIR":
        return this._loadPairAssignmentContext(definition.id);
      case "ROOM":
        return this._loadRoomAssignmentContext();
      default:
        throw new Error(
          `Unsupported assignmentMode=${definition.assignmentMode}`,
        );
    }
  }

  async _loadSingleAssignmentContext(dutyDefinitionId) {
    const queue =
      await this.dutyAssignmentQueueRepository.findByDutyDefinitionId(
        dutyDefinitionId,
      );
    const activeQueue = (queue || [])
      .filter((item) => item.isActive !== false)
      .sort((a, b) => a.position - b.position);

    return {
      queue: activeQueue,
    };
  }

  async _loadPairAssignmentContext(dutyDefinitionId) {
    const groups =
      await this.dutyAssignmentGroupRepository.findByDutyDefinitionId(
        dutyDefinitionId,
      );
    const activeGroups = (groups || [])
      .filter((group) => group.isActive !== false)
      .sort((a, b) => a.position - b.position);

    const groupsWithMembers = await Promise.all(
      activeGroups.map(async (group) => {
        const members =
          await this.dutyAssignmentGroupMemberRepository.findByGroupId(
            group.id,
          );
        const memberUsers = await Promise.all(
          (members || []).map((member) =>
            this.userRepository.findById(member.userId),
          ),
        );

        return {
          ...group,
          members: (members || []).map((member, index) => ({
            ...member,
            user: memberUsers[index] || null,
          })),
        };
      }),
    );

    return {
      groups: groupsWithMembers,
    };
  }

  async _loadRoomAssignmentContext() {
    const rooms = await this.roomRepository.findAllActive();

    const roomsWithOwners = await Promise.all(
      (rooms || []).map(async (room) => {
        const memberships = await this.roomMemberRepository.findByRoomId(
          room.id,
        );
        const owners = (memberships || []).filter(
          (membership) => membership.isOwner !== false,
        );
        const users = await Promise.all(
          owners.map((owner) => this.userRepository.findById(owner.userId)),
        );

        return {
          ...room,
          owners: owners.map((owner, index) => ({
            ...owner,
            user: users[index] || null,
          })),
        };
      }),
    );

    return {
      rooms: roomsWithOwners,
    };
  }

  async _ensureRuntimeState(definition, context, now = this.now()) {
    let runtimeState =
      await this.dutyRuntimeStateRepository.findByDutyDefinitionId(
        definition.id,
      );

    if (runtimeState) {
      return runtimeState;
    }

    if (definition.assignmentMode === "ROOM") {
      return this.dutyRuntimeStateRepository.create({
        dutyDefinitionId: definition.id,
        currentQueuePosition: null,
        currentGroupPosition: null,
        currentStartedAt: now,
        nextRotationAt:
          definition.rotationIntervalHours || definition.rotationIntervalDays
            ? this.calculateNextRotationAt(definition, now)
            : now,
        status: DEFAULT_DUTY_RUNTIME_STATUS,
      });
    }

    if (definition.assignmentMode === "SINGLE" && context.queue.length > 0) {
      runtimeState = await this.dutyRuntimeStateRepository.create({
        dutyDefinitionId: definition.id,
        currentQueuePosition: context.queue[0].position,
        currentGroupPosition: null,
        currentStartedAt: now,
        nextRotationAt: this.calculateNextRotationAt(definition, now),
        status: DEFAULT_DUTY_RUNTIME_STATUS,
      });

      return runtimeState;
    }

    if (definition.assignmentMode === "PAIR" && context.groups.length > 0) {
      runtimeState = await this.dutyRuntimeStateRepository.create({
        dutyDefinitionId: definition.id,
        currentQueuePosition: null,
        currentGroupPosition: context.groups[0].position,
        currentStartedAt: now,
        nextRotationAt: this.calculateNextRotationAt(definition, now),
        status: DEFAULT_DUTY_RUNTIME_STATUS,
      });

      return runtimeState;
    }

    return null;
  }

  async _resolveCurrentAssignment(definition, runtimeState, context) {
    if (definition.assignmentMode === "ROOM") {
      return {
        mode: "ROOM",
        rooms: context.rooms,
      };
    }

    if (!runtimeState) {
      return null;
    }

    if (definition.assignmentMode === "SINGLE") {
      const queueItem =
        context.queue.find(
          (item) => item.position === runtimeState.currentQueuePosition,
        ) ||
        context.queue[0] ||
        null;

      if (!queueItem) {
        return null;
      }

      const assignee = await this.userRepository.findById(queueItem.userId);

      return {
        mode: "SINGLE",
        queueItem,
        assignees: assignee ? [assignee] : [],
      };
    }

    if (definition.assignmentMode === "PAIR") {
      const group =
        context.groups.find(
          (item) => item.position === runtimeState.currentGroupPosition,
        ) ||
        context.groups[0] ||
        null;

      if (!group) {
        return null;
      }

      return {
        mode: "PAIR",
        group,
        assignees: group.members.map((member) => member.user).filter(Boolean),
      };
    }

    return null;
  }

  async _computeNextRotation(definition, runtimeState, context) {
    const currentAssignment = await this._resolveCurrentAssignment(
      definition,
      runtimeState,
      context,
    );

    if (definition.assignmentMode === "SINGLE") {
      if (!context.queue.length) {
        return {
          canRotate: false,
          reason: "QUEUE_EMPTY",
          currentAssignment,
        };
      }

      const currentIndex = this._findIndexByPosition(
        context.queue,
        runtimeState.currentQueuePosition,
      );
      const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (safeCurrentIndex + 1) % context.queue.length;
      const nextQueueItem = context.queue[nextIndex];
      const nextAssignee = await this.userRepository.findById(
        nextQueueItem.userId,
      );

      return {
        canRotate: true,
        nextQueuePosition: nextQueueItem.position,
        currentAssignment,
        nextAssignment: {
          mode: "SINGLE",
          queueItem: nextQueueItem,
          assignees: nextAssignee ? [nextAssignee] : [],
        },
      };
    }

    if (definition.assignmentMode === "PAIR") {
      if (!context.groups.length) {
        return {
          canRotate: false,
          reason: "GROUPS_EMPTY",
          currentAssignment,
        };
      }

      const currentIndex = this._findIndexByPosition(
        context.groups,
        runtimeState.currentGroupPosition,
      );
      const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (safeCurrentIndex + 1) % context.groups.length;
      const nextGroup = context.groups[nextIndex];

      return {
        canRotate: true,
        nextGroupPosition: nextGroup.position,
        currentAssignment,
        nextAssignment: {
          mode: "PAIR",
          group: nextGroup,
          assignees: nextGroup.members
            .map((member) => member.user)
            .filter(Boolean),
        },
      };
    }

    return {
      canRotate: false,
      reason: "UNSUPPORTED_ASSIGNMENT_MODE",
      currentAssignment,
    };
  }

  _findIndexByPosition(items, position) {
    return items.findIndex((item) => item.position === position);
  }

  _toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }
}

function createGenericDutyService(dependencies) {
  return new GenericDutyService(dependencies);
}

module.exports = {
  GenericDutyService,
  createGenericDutyService,
};
