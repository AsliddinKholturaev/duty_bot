class DutyPollService {
  constructor({
    dutyPollRepository,
    dutyDefinitionRepository,
    dutyRuntimeStateRepository,
    userMonthlyDutyStatRepository,
    genericDutyService,
    telegramPollGateway,
    now = () => new Date(),
  }) {
    if (!dutyPollRepository) {
      throw new Error("DutyPollService requires dutyPollRepository");
    }

    if (!dutyDefinitionRepository) {
      throw new Error("DutyPollService requires dutyDefinitionRepository");
    }

    if (!dutyRuntimeStateRepository) {
      throw new Error("DutyPollService requires dutyRuntimeStateRepository");
    }

    if (!userMonthlyDutyStatRepository) {
      throw new Error("DutyPollService requires userMonthlyDutyStatRepository");
    }

    if (!genericDutyService) {
      throw new Error("DutyPollService requires genericDutyService");
    }

    this.dutyPollRepository = dutyPollRepository;
    this.dutyDefinitionRepository = dutyDefinitionRepository;
    this.dutyRuntimeStateRepository = dutyRuntimeStateRepository;
    this.userMonthlyDutyStatRepository = userMonthlyDutyStatRepository;
    this.genericDutyService = genericDutyService;
    this.telegramPollGateway = telegramPollGateway;
    this.now = now;
  }

  async createPoll({ dutyCode, chatId, question, options = ["Yes", "No"] }) {
    if (!dutyCode) {
      throw new Error("createPoll requires dutyCode");
    }

    if (!chatId) {
      throw new Error("createPoll requires chatId");
    }

    const dutyDefinition = await this._getDutyDefinitionByCode(dutyCode);

    if (!dutyDefinition.requiresPoll) {
      throw new Error(`Duty ${dutyCode} does not require poll`);
    }

    const runtimeState = await this._ensureRuntimeState(dutyDefinition);
    const currentAssignment =
      await this.genericDutyService.getCurrentAssignment(dutyCode);

    const pollQuestion =
      question || this._buildPollQuestion(dutyDefinition, currentAssignment);

    const gatewayResponse = await this._createTelegramPoll({
      chatId,
      question: pollQuestion,
      options,
      openPeriodSeconds: this._resolveOpenPeriodSeconds(dutyDefinition),
    });

    const closesAt = this._resolvePollCloseTime(
      dutyDefinition,
      gatewayResponse,
    );
    const savedPoll = await this.dutyPollRepository.create({
      dutyDefinitionId: dutyDefinition.id,
      runtimeStateId: runtimeState.id,
      telegramPollId: gatewayResponse.telegramPollId,
      telegramMessageId: gatewayResponse.telegramMessageId || null,
      question: pollQuestion,
      yesVotes: 0,
      noVotes: 0,
      openedAt: this.now(),
      closesAt,
      result: null,
      decisionApplied: false,
    });

    await this.dutyRuntimeStateRepository.updateByDutyDefinitionId(
      dutyDefinition.id,
      {
        status: "WAITING_VOTE",
        lastPollAt: this.now(),
      },
    );

    return {
      poll: savedPoll,
      dutyDefinition,
      runtimeState,
      currentAssignment,
    };
  }

  async savePollUpdate({ telegramPollId, yesVotes, noVotes }) {
    if (!telegramPollId) {
      throw new Error("savePollUpdate requires telegramPollId");
    }

    const poll =
      await this.dutyPollRepository.findByTelegramPollId(telegramPollId);

    if (!poll) {
      throw new Error(`Poll not found for telegramPollId=${telegramPollId}`);
    }

    return this.dutyPollRepository.updateById(poll.id, {
      yesVotes: this._toSafeInt(yesVotes),
      noVotes: this._toSafeInt(noVotes),
    });
  }

  async resolvePollByTelegramPollId(telegramPollId, { at } = {}) {
    if (!telegramPollId) {
      throw new Error("resolvePollByTelegramPollId requires telegramPollId");
    }

    const poll =
      await this.dutyPollRepository.findByTelegramPollId(telegramPollId);

    if (!poll) {
      throw new Error(`Poll not found for telegramPollId=${telegramPollId}`);
    }

    return this._resolvePollEntity(poll, { at });
  }

  async resolveDuePolls({ at } = {}) {
    const resolveAt = at ? this._toDate(at) : this.now();
    const duePolls = await this.dutyPollRepository.findUnresolvedDue(resolveAt);

    const results = [];

    for (const poll of duePolls || []) {
      const result = await this._resolvePollEntity(poll, { at: resolveAt });
      results.push(result);
    }

    return results;
  }

  async _resolvePollEntity(poll, { at } = {}) {
    if (poll.decisionApplied) {
      return {
        alreadyApplied: true,
        poll,
      };
    }

    const resolveAt = at ? this._toDate(at) : this.now();
    const dutyDefinition = await this._getDutyDefinitionById(
      poll.dutyDefinitionId,
    );

    const decision = this._evaluateDecision({
      yesVotes: poll.yesVotes,
      noVotes: poll.noVotes,
      closesAt: poll.closesAt,
      resolveAt,
    });

    const updatedPoll = await this.dutyPollRepository.updateById(poll.id, {
      resolvedAt: resolveAt,
      result: decision.result,
    });

    if (decision.approved) {
      const rotation = await this.genericDutyService.rotateDutyIfDue({
        dutyCode: dutyDefinition.code,
        force: true,
        at: resolveAt,
      });

      await this.dutyRuntimeStateRepository.updateByDutyDefinitionId(
        dutyDefinition.id,
        {
          status: "ACTIVE",
        },
      );

      const appliedPoll = await this.dutyPollRepository.updateById(poll.id, {
        decisionApplied: true,
      });

      return {
        poll: appliedPoll,
        decision,
        approved: true,
        rotation,
      };
    }

    const snapshot = await this.genericDutyService.getDutySnapshot(
      dutyDefinition.code,
    );

    const extendedNextRotationAt =
      this.genericDutyService.calculateNextRotationAt(
        dutyDefinition,
        resolveAt,
      );

    await this.dutyRuntimeStateRepository.updateByDutyDefinitionId(
      dutyDefinition.id,
      {
        currentStartedAt: resolveAt,
        nextRotationAt: extendedNextRotationAt,
        status: "ACTIVE",
      },
    );

    const retainedAssignees = this._extractAssigneeIds(
      snapshot.currentAssignment,
    );
    const monthKey = this._toMonthKey(resolveAt);

    await Promise.all(
      retainedAssignees.map((userId) =>
        this.userMonthlyDutyStatRepository.incrementBadDuty(userId, monthKey),
      ),
    );

    const appliedPoll = await this.dutyPollRepository.updateById(poll.id, {
      decisionApplied: true,
    });

    return {
      poll: appliedPoll,
      decision,
      approved: false,
      retainedAssigneeUserIds: retainedAssignees,
      nextRotationAt: extendedNextRotationAt,
      outcome: decision.result,
    };
  }

  _evaluateDecision({ yesVotes, noVotes, closesAt, resolveAt }) {
    const yes = this._toSafeInt(yesVotes);
    const no = this._toSafeInt(noVotes);

    if (yes > no) {
      return {
        approved: true,
        rejected: false,
        tied: false,
        result: "APPROVED",
      };
    }

    if (no > yes) {
      return {
        approved: false,
        rejected: true,
        tied: false,
        result: "REJECTED",
      };
    }

    const closed = closesAt
      ? this._toDate(resolveAt) >= this._toDate(closesAt)
      : true;

    if (closed) {
      return {
        approved: false,
        rejected: false,
        tied: true,
        result: "TIED",
      };
    }

    return {
      approved: false,
      rejected: false,
      tied: false,
      result: "EXPIRED",
    };
  }

  _extractAssigneeIds(currentAssignment) {
    if (!currentAssignment || !Array.isArray(currentAssignment.assignees)) {
      return [];
    }

    return currentAssignment.assignees
      .filter((assignee) => assignee && assignee.id != null)
      .map((assignee) => assignee.id);
  }

  async _getDutyDefinitionByCode(code) {
    const definition = await this.dutyDefinitionRepository.findByCode(code);

    if (!definition) {
      throw new Error(`Duty definition not found for code=${code}`);
    }

    return definition;
  }

  async _getDutyDefinitionById(id) {
    const definitions = await this.dutyDefinitionRepository.findAll();
    const found = (definitions || []).find(
      (definition) => definition.id === id,
    );

    if (!found) {
      throw new Error(`Duty definition not found for id=${id}`);
    }

    return found;
  }

  async _ensureRuntimeState(dutyDefinition) {
    const runtime =
      await this.dutyRuntimeStateRepository.findByDutyDefinitionId(
        dutyDefinition.id,
      );

    if (!runtime) {
      throw new Error(
        `Runtime state not found for duty code=${dutyDefinition.code}`,
      );
    }

    return runtime;
  }

  _buildPollQuestion(dutyDefinition, currentAssignment) {
    const assigneeDisplay = this._assigneeDisplay(currentAssignment);

    if (assigneeDisplay) {
      return `${assigneeDisplay} ${dutyDefinition.name} vazifasini bajardimi?`;
    }

    return `${dutyDefinition.name} vazifasi bajarildimi?`;
  }

  _assigneeDisplay(currentAssignment) {
    if (!currentAssignment || !Array.isArray(currentAssignment.assignees)) {
      return "";
    }

    const names = currentAssignment.assignees
      .map((assignee) => {
        if (!assignee) {
          return null;
        }

        if (assignee.username) {
          return `@${assignee.username}`;
        }

        if (assignee.firstName || assignee.lastName) {
          return `${assignee.firstName || ""} ${assignee.lastName || ""}`.trim();
        }

        return assignee.id != null ? `user:${assignee.id}` : null;
      })
      .filter(Boolean);

    return names.join(", ");
  }

  async _createTelegramPoll({ chatId, question, options, openPeriodSeconds }) {
    if (
      !this.telegramPollGateway ||
      !this.telegramPollGateway.createAnonymousPoll
    ) {
      throw new Error(
        "DutyPollService requires telegramPollGateway.createAnonymousPoll for poll creation",
      );
    }

    const response = await this.telegramPollGateway.createAnonymousPoll({
      chatId,
      question,
      options,
      isAnonymous: true,
      openPeriodSeconds,
    });

    if (!response || !response.telegramPollId) {
      throw new Error("Invalid telegram poll gateway response");
    }

    return response;
  }

  _resolveOpenPeriodSeconds(dutyDefinition) {
    const minutes = dutyDefinition.pollDurationMinutes;

    if (minutes == null) {
      return undefined;
    }

    return Number(minutes) * 60;
  }

  _resolvePollCloseTime(dutyDefinition, gatewayResponse) {
    if (gatewayResponse.closesAt) {
      return this._toDate(gatewayResponse.closesAt);
    }

    if (dutyDefinition.pollDurationMinutes != null) {
      return new Date(
        this.now().getTime() +
          Number(dutyDefinition.pollDurationMinutes) * 60 * 1000,
      );
    }

    return this.now();
  }

  _toSafeInt(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.trunc(parsed);
  }

  _toMonthKey(dateLike) {
    const date = this._toDate(dateLike);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
  }

  _toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }
}

function createDutyPollService(dependencies) {
  return new DutyPollService(dependencies);
}

module.exports = {
  DutyPollService,
  createDutyPollService,
};
