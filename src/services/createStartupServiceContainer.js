const { getPrismaClient } = require("../database/client/prismaClient");
const {
  PrismaAdminRepository,
  PrismaChatSettingsRepository,
  PrismaUserRepository,
} = require("../database/repositories/prisma");

function createStartupServiceContainer({ bot, db, save, dutyService }) {
  const prisma = getPrismaClient();
  const userRepository = new PrismaUserRepository(prisma);
  const adminRepository = new PrismaAdminRepository(prisma);
  const chatSettingsRepository = new PrismaChatSettingsRepository(prisma);
  const legacyImport = createLegacyImportState({ db });

  const ensureLegacyImported = async () => {
    if (legacyImport.promise) {
      return legacyImport.promise;
    }

    legacyImport.promise = importLegacyState({
      db,
      chatSettingsRepository,
      userRepository,
      adminRepository,
    }).finally(() => {
      legacyImport.done = true;
    });

    return legacyImport.promise;
  };

  const lifecycleService = createLifecycleService({
    ensureLegacyImported,
    chatSettingsRepository,
    userRepository,
    adminRepository,
    dutyService,
  });
  const userAdminService = createUserAdminService({
    ensureLegacyImported,
    userRepository,
    adminRepository,
  });
  const systemService = createSystemService({
    ensureLegacyImported,
    chatSettingsRepository,
    userRepository,
    adminRepository,
  });
  const dutyDefinitionService = createDutyDefinitionService();

  ensureLegacyImported().catch((error) => {
    console.error("Failed to import legacy db.json state into Postgres", error);
  });

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
    dutyDefinitionService,
    kitchenDutyService: createUnavailableService("kitchenDutyService"),
    lifecycleService,
    paymentService: createUnavailableService("paymentService"),
    roomService: createUnavailableService("roomService"),
    systemService,
    userAdminService,
    bot,
  };
}

function createLifecycleService({
  ensureLegacyImported,
  chatSettingsRepository,
  userRepository,
  adminRepository,
}) {
  return {
    start: async ({ chatId, user } = {}) => {
      if (!chatId) {
        throw new Error("start requires chatId");
      }

      await ensureLegacyImported();

      const existing =
        await chatSettingsRepository.findByTelegramChatId(chatId);

      await chatSettingsRepository.upsertByTelegramChatId(chatId, {
        title: null,
        timezone: existing?.timezone || "UTC",
        language: existing?.language || "uz",
      });

      if (user) {
        const savedUser = await ensureUserRecord(userRepository, user);

        const admins = await adminRepository.findAll();

        if (!admins.length) {
          const currentAdmin = await adminRepository.findByUserId(savedUser.id);

          if (!currentAdmin) {
            await adminRepository.create({ userId: savedUser.id });
          }
        }
      }

      return "✅ Bot ishga tushdi.";
    },
  };
}

function createUserAdminService({
  ensureLegacyImported,
  userRepository,
  adminRepository,
}) {
  return {
    addUser: async ({ message } = {}) => {
      await ensureLegacyImported();

      const user = resolveTargetUser(message);

      if (!user) {
        return (
          "❌ Foydalanuvchini aniqlab bo'lmadi. Quyidagilardan birini ishlating:\n" +
          "1. Foydalanuvchi xabariga reply qilib /adduser yozing\n" +
          "2. Foydalanuvchi /join yuborsin\n" +
          "3. Admin /addid <telegram_user_id> ishlatsin"
        );
      }

      const savedUser = await ensureUserRecord(userRepository, user);

      return `✅ @${formatUserLabel(savedUser)} foydalanuvchilar bazasiga qo'shildi.`;
    },
    removeUser: async ({ telegramUserId } = {}) => {
      if (!telegramUserId) {
        throw new Error("removeUser requires telegramUserId");
      }

      await ensureLegacyImported();

      const user = await userRepository.findByTelegramUserId(telegramUserId);

      if (!user) {
        return "ℹ️ Bu foydalanuvchi bazada topilmadi.";
      }

      await userRepository.updateById(user.id, { isActive: false });
      await adminRepository.removeByUserId(user.id);

      return `🗑 @${formatUserLabel(user)} bazadan o'chirildi.`;
    },
    listAdmins: async () => {
      await ensureLegacyImported();
      const admins = await adminRepository.findAll();
      return formatAdminList(admins);
    },
    addAdmin: async ({ telegramUserId } = {}) => {
      if (!telegramUserId) {
        throw new Error("addAdmin requires telegramUserId");
      }

      await ensureLegacyImported();

      const user = await ensureUserRecord(userRepository, {
        id: telegramUserId,
        username: null,
        firstName: null,
        lastName: null,
      });

      const existing = await adminRepository.findByUserId(user.id);

      if (!existing) {
        await adminRepository.create({ userId: user.id });
      }

      return `✅ Admin qo'shildi: ${telegramUserId}`;
    },
    removeAdmin: async ({ telegramUserId } = {}) => {
      if (!telegramUserId) {
        throw new Error("removeAdmin requires telegramUserId");
      }

      await ensureLegacyImported();

      const user = await userRepository.findByTelegramUserId(telegramUserId);

      if (!user) {
        return `ℹ️ Admin topilmadi: ${telegramUserId}`;
      }

      await adminRepository.removeByUserId(user.id);

      return `🗑 Admin olib tashlandi: ${telegramUserId}`;
    },
    listUsers: async () => {
      await ensureLegacyImported();
      const users = await userRepository.findAllActive();
      return formatUserList(users);
    },
    isAdmin: async (userId) => {
      await ensureLegacyImported();
      const user = await userRepository.findByTelegramUserId(userId);

      if (!user) {
        return false;
      }

      const admin = await adminRepository.findByUserId(user.id);
      return Boolean(admin);
    },
  };
}

function createSystemService({
  ensureLegacyImported,
  chatSettingsRepository,
  userRepository,
  adminRepository,
}) {
  return {
    getStatus: async () => {
      await ensureLegacyImported();

      const chatSettings = await chatSettingsRepository.findFirst();
      const users = await userRepository.findAllActive();
      const admins = await adminRepository.findAll();

      return [
        "Bot holati:",
        `- chatId: ${chatSettings?.telegramChatId || "o'rnatilmagan"}`,
        `- foydalanuvchilar: ${users.length}`,
        `- adminlar: ${admins.length}`,
        `- joriy navbatchi: yo'q`,
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

function createLegacyImportState({ db }) {
  return {
    promise: null,
    legacyDb: db,
  };
}

async function importLegacyState({
  db,
  chatSettingsRepository,
  userRepository,
  adminRepository,
}) {
  const legacyUsers = Array.isArray(db?.data?.users) ? db.data.users : [];
  const legacyAdmins = Array.isArray(db?.data?.admins) ? db.data.admins : [];
  const legacyChatId = db?.data?.chatId;

  if (legacyChatId != null) {
    await chatSettingsRepository.upsertByTelegramChatId(legacyChatId, {
      title: null,
      timezone: "UTC",
      language: "uz",
    });
  }

  for (const legacyUser of legacyUsers) {
    const telegramUserId = resolveTelegramUserId(legacyUser);

    if (telegramUserId == null) {
      continue;
    }

    await ensureUserRecord(userRepository, {
      id: telegramUserId,
      telegramUserId,
      username: legacyUser.username || legacyUser.first_name || null,
      firstName: legacyUser.firstName || legacyUser.first_name || null,
      lastName: legacyUser.lastName || legacyUser.last_name || null,
      isActive: legacyUser.isActive !== false,
    });
  }

  for (const adminId of legacyAdmins) {
    const user = await ensureUserRecord(userRepository, {
      id: adminId,
      telegramUserId: adminId,
      username: null,
      firstName: null,
      lastName: null,
      isActive: true,
    });

    const existing = await adminRepository.findByUserId(user.id);

    if (!existing) {
      await adminRepository.create({ userId: user.id });
    }
  }
}

async function ensureUserRecord(userRepository, user) {
  const telegramUserId = resolveTelegramUserId(user);

  if (telegramUserId == null) {
    throw new Error("telegramUserId is required");
  }

  const existing = await userRepository.findByTelegramUserId(telegramUserId);

  if (existing) {
    return userRepository.updateById(existing.id, {
      telegramUserId,
      username: user.username ?? user.userName ?? existing.username ?? null,
      firstName:
        user.firstName ?? user.first_name ?? existing.firstName ?? null,
      lastName: user.lastName ?? user.last_name ?? existing.lastName ?? null,
      isActive: user.isActive ?? existing.isActive ?? true,
    });
  }

  return userRepository.create({
    telegramUserId,
    username: user.username ?? user.userName ?? null,
    firstName: user.firstName ?? user.first_name ?? null,
    lastName: user.lastName ?? user.last_name ?? null,
    isActive: user.isActive ?? true,
  });
}

function resolveTelegramUserId(user) {
  if (!user) {
    return null;
  }

  if (user.telegramUserId != null) {
    return Number(user.telegramUserId);
  }

  if (user.id != null) {
    return Number(user.id);
  }

  return null;
}

function formatUserLabel(user) {
  return user.username || user.firstName || user.lastName || user.id;
}

function createDutyDefinitionService() {
  const prisma = getPrismaClient();

  return {
    listDuties: async () => {
      const duties = await prisma.dutyDefinition.findMany({
        orderBy: [{ category: "asc" }, { code: "asc" }],
      });

      if (!duties.length) {
        return "Hozircha navbatchilik turlari yo'q.";
      }

      const lines = duties.map((duty, index) => {
        const status = duty.isActive ? "faol" : "faol emas";
        const description = duty.description ? ` — ${duty.description}` : "";
        return `${index + 1}. ${duty.code} | ${duty.name} | ${status}${description}`;
      });

      return `📋 Navbatchilik turlari:\n\n${lines.join("\n")}`;
    },
    getDuty: async ({ code } = {}) => {
      if (!code) {
        throw new Error("getDuty requires code");
      }

      const duty = await prisma.dutyDefinition.findUnique({
        where: { code },
      });

      if (!duty) {
        return `Navbatchilik topilmadi: ${code}`;
      }

      const details = [
        `Kod: ${duty.code}`,
        `Nomi: ${duty.name}`,
        `Holati: ${duty.isActive ? "faol" : "faol emas"}`,
        `Kategoriya: ${duty.category}`,
        `Tavsif: ${duty.description || "yo'q"}`,
      ];

      return details.join("\n");
    },
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

  const text = adminIds
    .map((admin, index) => {
      const user = admin.user || null;
      const label = user
        ? `@${user.username || user.firstName || user.lastName || user.id}`
        : `user:${admin.userId}`;

      return `${index + 1}. ${label} (ID: ${admin.userId})`;
    })
    .join("\n");

  return `📋 Adminlar:\n\n${text}`;
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
