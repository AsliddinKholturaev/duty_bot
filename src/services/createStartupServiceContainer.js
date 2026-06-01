function createStartupServiceContainer({ bot, db, save, dutyService }) {
  const lifecycleService = createLifecycleService({ db, save, dutyService });
  const userAdminService = createUserAdminService({ db, save, dutyService });
  const systemService = createSystemService({ db, dutyService });
  const authService = {
    ensureAdmin: async ({ userId } = {}) => {
      if (!userAdminService.isAdmin) {
        throw new Error("Admin guard service is not available");
      }

      const isAdmin = await userAdminService.isAdmin(userId);

      if (!isAdmin) {
        throw new Error("Admin permission required");
      }

      return true;
    },
  };

  return {
    authService,
    accountabilityService: createUnavailableService("accountabilityService"),
    bathroomDutyService: createUnavailableService("bathroomDutyService"),
    dutyDefinitionService: createUnavailableService("dutyDefinitionService"),
    kitchenDutyService: createUnavailableService("kitchenDutyService"),
    lifecycleService,
    paymentService: createUnavailableService("paymentService"),
    roomService: createUnavailableService("roomService"),
    systemService,
    userAdminService,
    bot,
  };
}

function createLifecycleService({ db, save, dutyService }) {
  return {
    start: async ({ chatId, user } = {}) => {
      if (!chatId) {
        throw new Error("start requires chatId");
      }

      if (!db.data.chatId) {
        db.data.chatId = chatId;

        if (user && !dutyService.isAdmin(user.id)) {
          db.data.admins.push(user.id);
        }

        save();

        return "✅ Bot ishga tushdi. Siz admin bo'ldingiz.";
      }

      return "Bot allaqachon ishga tushirilgan.";
    },
  };
}

function createUserAdminService({ db, save, dutyService }) {
  return {
    addUser: async ({ message } = {}) => {
      const user = resolveTargetUser(message);

      if (!user) {
        return (
          "❌ Foydalanuvchini aniqlab bo'lmadi. Quyidagilardan birini ishlating:\n" +
          "1. Foydalanuvchi xabariga reply qilib /adduser yozing\n" +
          "2. Foydalanuvchi /join yuborsin\n" +
          "3. Admin /addid <telegram_user_id> ishlatsin"
        );
      }

      const result = dutyService.addUserToDuty(user);

      return result.added
        ? `✅ @${result.username} navbatchilar ro'yxatiga qo'shildi.`
        : "ℹ️ Bu foydalanuvchi allaqachon ro'yxatda bor.";
    },
    removeUser: async ({ telegramUserId } = {}) => {
      if (!telegramUserId) {
        throw new Error("removeUser requires telegramUserId");
      }

      const result = dutyService.removeUserFromDuty(telegramUserId);

      if (!result.removed) {
        return "ℹ️ Bu foydalanuvchi navbatchilar ro'yxatida topilmadi.";
      }

      return `🗑 @${result.username} navbatchilar ro'yxatidan o'chirildi.`;
    },
    listAdmins: async () => formatAdminList(db.data.admins || []),
    addAdmin: async ({ telegramUserId } = {}) => {
      if (!telegramUserId) {
        throw new Error("addAdmin requires telegramUserId");
      }

      if (!db.data.admins.includes(telegramUserId)) {
        db.data.admins.push(telegramUserId);
        save();
      }

      return `✅ Admin qo'shildi: ${telegramUserId}`;
    },
    removeAdmin: async ({ telegramUserId } = {}) => {
      if (!telegramUserId) {
        throw new Error("removeAdmin requires telegramUserId");
      }

      const before = db.data.admins.length;
      db.data.admins = db.data.admins.filter((id) => id !== telegramUserId);

      if (db.data.admins.length !== before) {
        save();
      }

      return `🗑 Admin olib tashlandi: ${telegramUserId}`;
    },
    listUsers: async () => formatUserList(db.data.users || []),
    isAdmin: async (userId) => dutyService.isAdmin(userId),
  };
}

function createSystemService({ db, dutyService }) {
  return {
    getStatus: async () => {
      const chatId = db.data.chatId || "o'rnatilmagan";
      const userCount = Array.isArray(db.data.users) ? db.data.users.length : 0;
      const adminCount = Array.isArray(db.data.admins)
        ? db.data.admins.length
        : 0;

      return [
        "Bot holati:",
        `- chatId: ${chatId}`,
        `- foydalanuvchilar: ${userCount}`,
        `- adminlar: ${adminCount}`,
        `- joriy navbatchi: ${
          userCount > 0
            ? db.data.users[db.data.currentIndex || 0]?.username
            : "yo'q"
        }`,
      ].join("\n");
    },
    forceRotate: async () =>
      "Majburiy aylantirish hali startup service container'ga ulanmagan.",
    forcePoll: async () =>
      "Majburiy poll hali startup service container'ga ulanmagan.",
    resolvePoll: async () =>
      "Pollni yakunlash hali startup service container'ga ulanmagan.",
    reload: async () => "Reload hali startup service container'ga ulanmagan.",
  };
}

function createUnavailableService(name) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === Symbol.toStringTag) {
          return name;
        }

        if (prop === "isAdmin") {
          return async () => false;
        }

        return async () =>
          `${name}.${String(prop)} hali startup uchun sozlanmagan.`;
      },
    },
  );
}

function resolveTargetUser(message) {
  if (!message) {
    return null;
  }

  if (message.reply_to_message?.from) {
    return message.reply_to_message.from;
  }

  if (Array.isArray(message.entities)) {
    const mentionEntity = message.entities.find(
      (entity) => entity.type === "text_mention",
    );

    if (mentionEntity?.user) {
      return mentionEntity.user;
    }
  }

  return message.from || null;
}

function formatAdminList(adminIds) {
  if (!adminIds.length) {
    return "Hali adminlar yo'q.";
  }

  return `📋 Adminlar:\n\n${adminIds.map((id) => `- ${id}`).join("\n")}`;
}

function formatUserList(users) {
  if (!users.length) {
    return "Hali navbatchilar ro'yxati bo'sh.";
  }

  const text = users
    .map((user, index) => {
      const mark = index === 0 ? "👉" : " ";
      return `${mark} @${user.username || user.first_name || user.id} (ID: ${user.id})`;
    })
    .join("\n");

  return `📋 Navbatchilar ro'yxati:\n\n${text}`;
}

module.exports = {
  createStartupServiceContainer,
};
