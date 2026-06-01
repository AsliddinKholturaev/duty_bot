const BATHROOM_DUTY_CODE_CANDIDATES = [
  "BATHROOM_TOILET",
  "bathroom",
  "bathroom_toilet",
];
const BATHROOM_ROTATION_DAYS = 14;

class BathroomDutyService {
  constructor({
    genericDutyService,
    dutyPollService,
    dutyDefinitionRepository,
    dutyRuntimeStateRepository,
    dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository,
    userRepository,
    now = () => new Date(),
  }) {
    if (!genericDutyService) {
      throw new Error("BathroomDutyService requires genericDutyService");
    }

    if (!dutyPollService) {
      throw new Error("BathroomDutyService requires dutyPollService");
    }

    if (!dutyDefinitionRepository) {
      throw new Error("BathroomDutyService requires dutyDefinitionRepository");
    }

    if (!dutyRuntimeStateRepository) {
      throw new Error(
        "BathroomDutyService requires dutyRuntimeStateRepository",
      );
    }

    if (!dutyAssignmentGroupRepository) {
      throw new Error(
        "BathroomDutyService requires dutyAssignmentGroupRepository",
      );
    }

    if (!dutyAssignmentGroupMemberRepository) {
      throw new Error(
        "BathroomDutyService requires dutyAssignmentGroupMemberRepository",
      );
    }

    if (!userRepository) {
      throw new Error("BathroomDutyService requires userRepository");
    }

    this.genericDutyService = genericDutyService;
    this.dutyPollService = dutyPollService;
    this.dutyDefinitionRepository = dutyDefinitionRepository;
    this.dutyRuntimeStateRepository = dutyRuntimeStateRepository;
    this.dutyAssignmentGroupRepository = dutyAssignmentGroupRepository;
    this.dutyAssignmentGroupMemberRepository =
      dutyAssignmentGroupMemberRepository;
    this.userRepository = userRepository;
    this.now = now;
  }

  async getCurrentPair() {
    const definition = await this._getBathroomDefinition();
    const snapshot = await this.genericDutyService.getDutySnapshot(
      definition.code,
    );

    return {
      dutyDefinition: snapshot.dutyDefinition,
      runtimeState: snapshot.runtimeState,
      currentPair: snapshot.currentAssignment,
      nextRotationAt: snapshot.nextRotationAt,
    };
  }

  async listPairs() {
    const definition = await this._getBathroomDefinition();
    const groups = await this._getSortedActiveGroups(definition.id);

    const hydratedGroups = await Promise.all(
      groups.map((group) => this._hydrateGroupWithUsers(group)),
    );

    return {
      dutyDefinition: definition,
      groups: hydratedGroups,
    };
  }

  async upsertPair({
    userId1,
    userId2,
    groupId,
    position,
    name,
    isActive = true,
  }) {
    this._validatePairUserIds(userId1, userId2);

    const definition = await this._getBathroomDefinition();
    await this._ensureUsersExist([userId1, userId2]);

    const groups = await this._getSortedActiveGroups(definition.id);

    let targetGroup;

    if (groupId) {
      const existing = groups.find((group) => group.id === groupId);

      if (!existing) {
        throw new Error(`Bathroom group not found for id=${groupId}`);
      }

      targetGroup = await this.dutyAssignmentGroupRepository.updateById(
        existing.id,
        {
          name: name || existing.name,
          position: existing.position,
          isActive,
        },
      );
    } else {
      const desiredPosition = this._resolveDesiredPosition(groups, position);
      await this._shiftGroupPositionsForInsert(groups, desiredPosition);

      targetGroup = await this.dutyAssignmentGroupRepository.create({
        dutyDefinitionId: definition.id,
        name: name || `Bathroom Pair ${desiredPosition}`,
        position: desiredPosition,
        isActive,
      });
    }

    await this._syncGroupMembers(targetGroup.id, [userId1, userId2]);
    await this._normalizeGroupPositions(definition.id);
    await this._ensurePairRuntimeState(definition.id);

    return this._hydrateGroupWithUsers(targetGroup);
  }

  async removePair(groupId) {
    if (!groupId) {
      throw new Error("removePair requires groupId");
    }

    const definition = await this._getBathroomDefinition();
    const groups = await this._getSortedActiveGroups(definition.id);
    const target = groups.find((group) => group.id === groupId);

    if (!target) {
      return { removed: false };
    }

    await this.dutyAssignmentGroupRepository.updateById(groupId, {
      isActive: false,
    });

    await this._normalizeGroupPositions(definition.id);

    return { removed: true, groupId };
  }

  async rotatePairIfDue({ force = false, at } = {}) {
    const definition = await this._getBathroomDefinition();

    return this.genericDutyService.rotateDutyIfDue({
      dutyCode: definition.code,
      force,
      at,
    });
  }

  async createApprovalPoll({ chatId, question } = {}) {
    if (!chatId) {
      throw new Error("createApprovalPoll requires chatId");
    }

    const definition = await this._getBathroomDefinition();
    const snapshot = await this.genericDutyService.getDutySnapshot(
      definition.code,
    );

    const defaultQuestion =
      question || this._buildBathroomPollQuestion(snapshot.currentAssignment);

    return this.dutyPollService.createPoll({
      dutyCode: definition.code,
      chatId,
      question: defaultQuestion,
      options: ["Yes", "No"],
    });
  }

  async resolveApprovalPollByTelegramPollId(telegramPollId, options = {}) {
    return this.dutyPollService.resolvePollByTelegramPollId(
      telegramPollId,
      options,
    );
  }

  async _getBathroomDefinition() {
    for (const code of BATHROOM_DUTY_CODE_CANDIDATES) {
      const definition = await this.dutyDefinitionRepository.findByCode(code);

      if (definition) {
        this._validateBathroomDefinition(definition);
        return definition;
      }
    }

    throw new Error("Bathroom duty definition not found");
  }

  _validateBathroomDefinition(definition) {
    if (!definition.isActive) {
      throw new Error("Bathroom duty definition is inactive");
    }

    if (definition.assignmentMode !== "PAIR") {
      throw new Error("Bathroom duty assignmentMode must be PAIR");
    }

    if (!definition.requiresPoll) {
      throw new Error("Bathroom duty requiresPoll must be true");
    }

    const configuredDays = Number(definition.rotationIntervalDays);

    if (
      definition.rotationIntervalDays == null ||
      configuredDays !== BATHROOM_ROTATION_DAYS
    ) {
      throw new Error(
        `Bathroom rotationIntervalDays must be ${BATHROOM_ROTATION_DAYS}`,
      );
    }
  }

  async _getSortedActiveGroups(dutyDefinitionId) {
    const groups =
      await this.dutyAssignmentGroupRepository.findByDutyDefinitionId(
        dutyDefinitionId,
      );

    return (groups || [])
      .filter((group) => group.isActive !== false)
      .sort((a, b) => a.position - b.position);
  }

  async _hydrateGroupWithUsers(group) {
    const members =
      await this.dutyAssignmentGroupMemberRepository.findByGroupId(group.id);

    const users = await Promise.all(
      (members || []).map((member) =>
        this.userRepository.findById(member.userId),
      ),
    );

    return {
      ...group,
      members: (members || []).map((member, index) => ({
        ...member,
        user: users[index] || null,
      })),
    };
  }

  _resolveDesiredPosition(groups, requestedPosition) {
    if (!Number.isInteger(requestedPosition) || requestedPosition < 1) {
      return groups.length + 1;
    }

    return Math.min(requestedPosition, groups.length + 1);
  }

  async _shiftGroupPositionsForInsert(groups, desiredPosition) {
    const reverse = [...groups]
      .filter((group) => group.position >= desiredPosition)
      .sort((a, b) => b.position - a.position);

    for (const group of reverse) {
      await this.dutyAssignmentGroupRepository.updateById(group.id, {
        position: group.position + 1,
      });
    }
  }

  async _normalizeGroupPositions(dutyDefinitionId) {
    const groups = await this._getSortedActiveGroups(dutyDefinitionId);

    for (let index = 0; index < groups.length; index += 1) {
      const expected = index + 1;

      if (groups[index].position !== expected) {
        await this.dutyAssignmentGroupRepository.updateById(groups[index].id, {
          position: expected,
        });
      }
    }
  }

  async _syncGroupMembers(groupId, userIds) {
    const existing =
      await this.dutyAssignmentGroupMemberRepository.findByGroupId(groupId);
    const existingUserIds = new Set(
      (existing || []).map((item) => item.userId),
    );
    const targetUserIds = new Set(userIds);

    for (const item of existing || []) {
      if (!targetUserIds.has(item.userId)) {
        await this.dutyAssignmentGroupMemberRepository.removeMember(
          groupId,
          item.userId,
        );
      }
    }

    for (const userId of userIds) {
      if (!existingUserIds.has(userId)) {
        await this.dutyAssignmentGroupMemberRepository.addMember({
          groupId,
          userId,
        });
      }
    }
  }

  async _ensureUsersExist(userIds) {
    for (const userId of userIds) {
      const user = await this.userRepository.findById(userId);

      if (!user || user.isActive === false) {
        throw new Error(`Active user not found for id=${userId}`);
      }
    }
  }

  _validatePairUserIds(userId1, userId2) {
    if (!userId1 || !userId2) {
      throw new Error("Both pair user IDs are required");
    }

    if (userId1 === userId2) {
      throw new Error("Bathroom pair must contain two distinct users");
    }
  }

  async _ensurePairRuntimeState(dutyDefinitionId) {
    const runtime =
      await this.dutyRuntimeStateRepository.findByDutyDefinitionId(
        dutyDefinitionId,
      );

    if (runtime) {
      return runtime;
    }

    const groups = await this._getSortedActiveGroups(dutyDefinitionId);

    if (!groups.length) {
      return null;
    }

    const now = this.now();

    return this.dutyRuntimeStateRepository.create({
      dutyDefinitionId,
      currentQueuePosition: null,
      currentGroupPosition: groups[0].position,
      currentStartedAt: now,
      nextRotationAt: new Date(
        now.getTime() + BATHROOM_ROTATION_DAYS * 24 * 60 * 60 * 1000,
      ),
      status: "ACTIVE",
    });
  }

  _buildBathroomPollQuestion(currentAssignment) {
    const assignees = (currentAssignment?.assignees || []).filter(Boolean);

    if (!assignees.length) {
      return "Hozirgi hammom navbatchilari barcha tozalash ishlarini bajardimi?";
    }

    const names = assignees
      .map((assignee) => {
        if (assignee.username) {
          return `@${assignee.username}`;
        }

        if (assignee.firstName || assignee.lastName) {
          return `${assignee.firstName || ""} ${assignee.lastName || ""}`.trim();
        }

        return assignee.id != null ? `user:${assignee.id}` : "Noma'lum";
      })
      .join(" va ");

    return `${names} hammom va hojatxonani tozaladimi?`;
  }
}

function createBathroomDutyService(dependencies) {
  return new BathroomDutyService(dependencies);
}

module.exports = {
  BathroomDutyService,
  createBathroomDutyService,
  BATHROOM_ROTATION_DAYS,
};
