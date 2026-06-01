const ROOM_CLEANING_DUTY_CODE_CANDIDATES = [
  "ROOM_CLEANING",
  "room_cleaning",
  "room_reminder",
];

class RoomService {
  constructor({
    roomRepository,
    roomMemberRepository,
    userRepository,
    dutyDefinitionRepository,
    dutyTaskRepository,
    notifier,
    now = () => new Date(),
  }) {
    if (!roomRepository) {
      throw new Error("RoomService requires roomRepository");
    }

    if (!roomMemberRepository) {
      throw new Error("RoomService requires roomMemberRepository");
    }

    if (!userRepository) {
      throw new Error("RoomService requires userRepository");
    }

    this.roomRepository = roomRepository;
    this.roomMemberRepository = roomMemberRepository;
    this.userRepository = userRepository;
    this.dutyDefinitionRepository = dutyDefinitionRepository;
    this.dutyTaskRepository = dutyTaskRepository;
    this.notifier = notifier;
    this.now = now;
  }

  async createRoom({ code, name }) {
    const normalizedCode = this._normalizeRoomCode(code);
    const normalizedName = this._normalizeRequiredText(name, "name");

    const existing = await this.roomRepository.findByCode(normalizedCode);

    if (existing && existing.isActive !== false) {
      throw new Error(`Room already exists for code=${normalizedCode}`);
    }

    if (existing && existing.isActive === false) {
      return this.roomRepository.updateByCode(normalizedCode, {
        name: normalizedName,
        isActive: true,
      });
    }

    return this.roomRepository.create({
      code: normalizedCode,
      name: normalizedName,
      isActive: true,
    });
  }

  async deleteRoom(roomCode) {
    const room = await this._getActiveRoomByCode(roomCode);

    const deleted = await this.roomRepository.updateByCode(room.code, {
      isActive: false,
    });

    return {
      room: deleted,
      deleted: true,
      deletedAt: this.now(),
    };
  }

  async moveUser({ userId, roomCode, isOwner = true }) {
    if (!userId) {
      throw new Error("moveUser requires userId");
    }

    const room = await this._getActiveRoomByCode(roomCode);
    const user = await this.userRepository.findById(userId);

    if (!user || user.isActive === false) {
      throw new Error(`Active user not found for id=${userId}`);
    }

    await this.roomMemberRepository.removeByUserId(userId);

    const membership = await this.roomMemberRepository.upsertMembership(
      room.id,
      userId,
      {
        isOwner: Boolean(isOwner),
      },
    );

    return {
      room,
      user,
      membership,
    };
  }

  async listOwners(roomCode) {
    if (roomCode) {
      const room = await this._getActiveRoomByCode(roomCode);
      const owners = await this._getRoomOwners(room.id);

      return {
        rooms: [
          {
            ...room,
            owners,
          },
        ],
      };
    }

    const rooms = await this.roomRepository.findAllActive();
    const results = [];

    for (const room of rooms || []) {
      const owners = await this._getRoomOwners(room.id);
      results.push({
        ...room,
        owners,
      });
    }

    return {
      rooms: results,
    };
  }

  async sendWeeklyReminders({
    chatId,
    date = this.now(),
    notifier = this.notifier,
    includeTasks = true,
  } = {}) {
    if (!chatId) {
      throw new Error("sendWeeklyReminders requires chatId");
    }

    if (!notifier || typeof notifier.sendMessage !== "function") {
      throw new Error(
        "sendWeeklyReminders requires notifier with sendMessage(chatId, text)",
      );
    }

    const targetDate = this._toDate(date);

    if (!this._isWeekend(targetDate)) {
      return {
        sent: false,
        reason: "NOT_WEEKEND",
        reminders: [],
      };
    }

    const ownersByRoom = await this.listOwners();
    const tasks = includeTasks ? await this._getRoomCleaningTasks() : [];
    const reminders = ownersByRoom.rooms
      .filter((room) => room.owners.length > 0)
      .map((room) => ({
        room,
        text: this._buildRoomReminderMessage(room, tasks),
      }));

    for (const reminder of reminders) {
      await notifier.sendMessage(chatId, reminder.text);
    }

    return {
      sent: true,
      reminderCount: reminders.length,
      reminders,
    };
  }

  async _getActiveRoomByCode(roomCode) {
    const normalizedCode = this._normalizeRoomCode(roomCode);
    const room = await this.roomRepository.findByCode(normalizedCode);

    if (!room || room.isActive === false) {
      throw new Error(`Active room not found for code=${normalizedCode}`);
    }

    return room;
  }

  async _getRoomOwners(roomId) {
    const memberships = await this.roomMemberRepository.findByRoomId(roomId);
    const owners = (memberships || []).filter(
      (membership) => membership.isOwner !== false,
    );

    const users = await Promise.all(
      owners.map((owner) => this.userRepository.findById(owner.userId)),
    );

    return owners
      .map((owner, index) => ({
        ...owner,
        user: users[index] || null,
      }))
      .filter((owner) => owner.user && owner.user.isActive !== false);
  }

  async _getRoomCleaningTasks() {
    if (!this.dutyDefinitionRepository || !this.dutyTaskRepository) {
      return [];
    }

    const dutyDefinition = await this._findRoomCleaningDutyDefinition();

    if (!dutyDefinition) {
      return [];
    }

    const tasks = await this.dutyTaskRepository.findByDutyDefinitionId(
      dutyDefinition.id,
    );

    return (tasks || [])
      .filter((task) => task.isActive !== false)
      .sort((a, b) => a.position - b.position);
  }

  async _findRoomCleaningDutyDefinition() {
    for (const code of ROOM_CLEANING_DUTY_CODE_CANDIDATES) {
      const definition = await this.dutyDefinitionRepository.findByCode(code);

      if (definition) {
        return definition;
      }
    }

    return null;
  }

  _buildRoomReminderMessage(room, tasks) {
    const owners = room.owners
      .map((owner) => this._formatUserMention(owner.user))
      .filter(Boolean);

    const ownersText = owners.length > 0 ? owners.join(" ") : "Xona egalari";
    const base = `Xona tozalash eslatmasi: ${ownersText}, iltimos ${room.code} ni tozalang.`;

    if (!tasks || tasks.length === 0) {
      return base;
    }

    const taskList = tasks
      .map((task, index) => `${index + 1}. ${task.taskText}`)
      .join("\n");

    return `${base}\nVazifalar:\n${taskList}`;
  }

  _formatUserMention(user) {
    if (!user) {
      return null;
    }

    if (user.username) {
      return `@${user.username}`;
    }

    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }

    return user.id != null ? `user:${user.id}` : null;
  }

  _isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  _normalizeRoomCode(code) {
    const normalized = this._normalizeRequiredText(code, "code").toLowerCase();

    if (!/^[a-z0-9_-]+$/.test(normalized)) {
      throw new Error(
        "room code must contain only lowercase letters, numbers, underscore, or dash",
      );
    }

    return normalized;
  }

  _normalizeRequiredText(value, field) {
    const normalized = String(value || "").trim();

    if (!normalized) {
      throw new Error(`${field} is required`);
    }

    return normalized;
  }

  _toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }
}

function createRoomService(dependencies) {
  return new RoomService(dependencies);
}

module.exports = {
  RoomService,
  createRoomService,
};
