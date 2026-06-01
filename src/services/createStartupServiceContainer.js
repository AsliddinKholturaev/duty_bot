const { getPrismaClient } = require("../database/client/prismaClient");
const {
  PrismaAdminRepository,
  PrismaChatSettingsRepository,
  PrismaDutyAssignmentGroupMemberRepository,
  PrismaDutyAssignmentGroupRepository,
  PrismaDutyAssignmentQueueRepository,
  PrismaDutyDefinitionRepository,
  PrismaDutyPollRepository,
  PrismaDutyRuntimeStateRepository,
  PrismaDutyTaskRepository,
  PrismaPaymentMonthAmountRepository,
  PrismaPaymentSettingsRepository,
  PrismaRoomMemberRepository,
  PrismaRoomRepository,
  PrismaUserMonthlyDutyStatRepository,
  PrismaUserRepository,
} = require("../database/repositories/prisma");
const { createBathroomDutyService } = require("./bathroomDutyService");
const { createDutyPollService } = require("./dutyPollService");
const { createGenericDutyService } = require("./genericDutyService");
const { createKitchenDutyService } = require("./kitchenDutyService");
const { createPaymentService } = require("./paymentService");
const { createRoomService } = require("./roomService");

const DUTY_DEFINITION_SEED = [
  {
    code: "KITCHEN_TRASH",
    builtinType: "KITCHEN_TRASH",
    name: "Oshxona va chiqindi",
    description: "Har 48 soatda oshxona va chiqindi navbatchiligi",
    category: "ROTATION",
    assignmentMode: "SINGLE",
    rotationIntervalHours: 48,
    requiresPoll: true,
    pollLeadHours: 2,
    pollDurationMinutes: 120,
  },
  {
    code: "BATHROOM_TOILET",
    builtinType: "BATHROOM_TOILET",
    name: "Hammom va hojatxona",
    description: "Har 2 haftada hammom/hojatxona navbatchiligi",
    category: "ROTATION",
    assignmentMode: "PAIR",
    rotationIntervalDays: 14,
    requiresPoll: true,
    pollLeadHours: 3,
    pollDurationMinutes: 180,
  },
  {
    code: "ROOM_CLEANING",
    builtinType: "ROOM_CLEANING",
    name: "Xona tozalash",
    description: "Shanba va yakshanba kunlari xonalarni tozalash eslatmasi",
    category: "ROOM_REMINDER",
    assignmentMode: "ROOM",
    scheduleCron: "0 10 * * 6,0",
    requiresPoll: false,
  },
  {
    code: "FLAT_PAYMENT",
    builtinType: "FLAT_PAYMENT",
    name: "Kvartira to'lovi",
    description: "13-kun eslatma, 15-kun to'lov yig'ish",
    category: "PAYMENT_REMINDER",
    assignmentMode: "NONE",
    requiresPoll: false,
  },
];

const DUTY_TASK_SEED = {
  KITCHEN_TRASH: ["Oshxonani tozalash", "Chiqindini olib chiqish"],
  BATHROOM_TOILET: ["Hammomni tozalash", "Hojatxonani tozalash"],
  ROOM_CLEANING: ["Polni artish", "Changlarni tozalash"],
};

const DEFAULT_ROOM_CODES = ["room1", "room2", "room3", "room4"];

function createStartupServiceContainer({ bot, db }) {
  const prisma = getPrismaClient();

  const repositories = {
    adminRepository: new PrismaAdminRepository(prisma),
    chatSettingsRepository: new PrismaChatSettingsRepository(prisma),
    dutyAssignmentGroupMemberRepository:
      new PrismaDutyAssignmentGroupMemberRepository(prisma),
    dutyAssignmentGroupRepository: new PrismaDutyAssignmentGroupRepository(
      prisma,
    ),
    dutyAssignmentQueueRepository: new PrismaDutyAssignmentQueueRepository(
      prisma,
    ),
    dutyDefinitionRepository: new PrismaDutyDefinitionRepository(prisma),
    dutyPollRepository: new PrismaDutyPollRepository(prisma),
    dutyRuntimeStateRepository: new PrismaDutyRuntimeStateRepository(prisma),
    dutyTaskRepository: new PrismaDutyTaskRepository(prisma),
    paymentMonthAmountRepository: new PrismaPaymentMonthAmountRepository(
      prisma,
    ),
    paymentSettingsRepository: new PrismaPaymentSettingsRepository(prisma),
    roomMemberRepository: new PrismaRoomMemberRepository(prisma),
    roomRepository: new PrismaRoomRepository(prisma),
    userMonthlyDutyStatRepository: new PrismaUserMonthlyDutyStatRepository(
      prisma,
    ),
    userRepository: new PrismaUserRepository(prisma),
  };

  const notifier = {
    sendMessage: async (chatId, text) => bot.sendMessage(chatId, text),
  };

  const telegramPollGateway = {
    createAnonymousPoll: async ({
      chatId,
      question,
      options,
      openPeriodSeconds,
    }) => {
      const payload = {
        is_anonymous: true,
      };

      if (openPeriodSeconds != null) {
        payload.open_period = Number(openPeriodSeconds);
      }

      const message = await bot.sendPoll(chatId, question, options, payload);

      return {
        telegramPollId: message?.poll?.id,
        telegramMessageId: message?.message_id,
      };
    },
  };

  const domainServices = {
    genericDutyService: createGenericDutyService({
      dutyDefinitionRepository: repositories.dutyDefinitionRepository,
      dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
      dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
      dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
      dutyAssignmentGroupMemberRepository:
        repositories.dutyAssignmentGroupMemberRepository,
      roomRepository: repositories.roomRepository,
      roomMemberRepository: repositories.roomMemberRepository,
      userRepository: repositories.userRepository,
    }),
  };

  domainServices.dutyPollService = createDutyPollService({
    dutyPollRepository: repositories.dutyPollRepository,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    userMonthlyDutyStatRepository: repositories.userMonthlyDutyStatRepository,
    genericDutyService: domainServices.genericDutyService,
    telegramPollGateway,
  });

  domainServices.kitchenDutyService = createKitchenDutyService({
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
    userRepository: repositories.userRepository,
  });

  domainServices.bathroomDutyService = createBathroomDutyService({
    genericDutyService: domainServices.genericDutyService,
    dutyPollService: domainServices.dutyPollService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository:
      repositories.dutyAssignmentGroupMemberRepository,
    userRepository: repositories.userRepository,
  });

  domainServices.roomService = createRoomService({
    roomRepository: repositories.roomRepository,
    roomMemberRepository: repositories.roomMemberRepository,
    userRepository: repositories.userRepository,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
    notifier,
  });

  domainServices.paymentService = createPaymentService({
    paymentSettingsRepository: repositories.paymentSettingsRepository,
    paymentMonthAmountRepository: repositories.paymentMonthAmountRepository,
    userRepository: repositories.userRepository,
    notifier,
  });

  const bootstrapState = {
    promise: null,
  };

  const ensureBootstrapped = async () => {
    if (bootstrapState.promise) {
      return bootstrapState.promise;
    }

    bootstrapState.promise = (async () => {
      await importLegacyState(db, repositories);
      await seedInitialData(repositories);
      await ensureKitchenQueueSeededFromUsers(repositories, db);
    })();

    return bootstrapState.promise;
  };

  ensureBootstrapped().catch((error) => {
    console.error("Startup bootstrap failed", error);
  });

  const lifecycleService = createLifecycleService({
    ensureBootstrapped,
    chatSettingsRepository: repositories.chatSettingsRepository,
    userRepository: repositories.userRepository,
    adminRepository: repositories.adminRepository,
  });

  const userAdminService = createUserAdminService({
    ensureBootstrapped,
    userRepository: repositories.userRepository,
    adminRepository: repositories.adminRepository,
  });

  const dutyDefinitionService = createDutyDefinitionService({
    ensureBootstrapped,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
  });

  const kitchenDutyService = createKitchenCommandFacade({
    ensureBootstrapped,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    userRepository: repositories.userRepository,
    kitchenDutyService: domainServices.kitchenDutyService,
  });

  const bathroomDutyService = createBathroomCommandFacade({
    ensureBootstrapped,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository:
      repositories.dutyAssignmentGroupMemberRepository,
    userRepository: repositories.userRepository,
    bathroomDutyService: domainServices.bathroomDutyService,
  });

  const roomService = createRoomCommandFacade({
    ensureBootstrapped,
    roomService: domainServices.roomService,
    roomMemberRepository: repositories.roomMemberRepository,
  });

  const paymentService = createPaymentCommandFacade({
    ensureBootstrapped,
    prisma,
    paymentService: domainServices.paymentService,
    paymentSettingsRepository: repositories.paymentSettingsRepository,
  });

  const accountabilityService = createAccountabilityService({
    ensureBootstrapped,
    userMonthlyDutyStatRepository: repositories.userMonthlyDutyStatRepository,
  });

  const systemService = createSystemService({
    ensureBootstrapped,
    chatSettingsRepository: repositories.chatSettingsRepository,
    userRepository: repositories.userRepository,
    adminRepository: repositories.adminRepository,
    genericDutyService: domainServices.genericDutyService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyPollService: domainServices.dutyPollService,
    prisma,
  });

  const authService = {
    ensureAdmin: async ({ userId } = {}) => {
      const ok = await userAdminService.isAdmin(userId);

      if (!ok) {
        throw new Error("Admin huquqi talab qilinadi");
      }
    },
  };

  return {
    authService,
    accountabilityService,
    bathroomDutyService,
    dutyDefinitionService,
    kitchenDutyService,
    lifecycleService,
    paymentService,
    roomService,
    systemService,
    userAdminService,
    bot,
  };
}

function createLifecycleService({
  ensureBootstrapped,
  chatSettingsRepository,
  userRepository,
  adminRepository,
}) {
  return {
    start: async ({ chatId, user } = {}) => {
      if (!chatId) {
        throw new Error("chatId talab qilinadi");
      }

      await ensureBootstrapped();

      const existing =
        await chatSettingsRepository.findByTelegramChatId(chatId);
      await chatSettingsRepository.upsertByTelegramChatId(chatId, {
        title: existing?.title ?? null,
        timezone: existing?.timezone ?? "UTC",
        language: existing?.language ?? "uz",
      });

      if (user) {
        const saved = await ensureUserRecord(userRepository, user);
        const admins = await adminRepository.findAll();

        if (!admins.length) {
          await adminRepository.create({ userId: saved.id });
          return "✅ Bot ishga tushdi. Siz birinchi admin bo'ldingiz.";
        }
      }

      return "✅ Bot ishga tushdi.";
    },
  };
}

function createUserAdminService({
  ensureBootstrapped,
  userRepository,
  adminRepository,
}) {
  return {
    addUser: async ({ message } = {}) => {
      await ensureBootstrapped();
      const user = resolveTargetUser(message);

      if (!user) {
        return "❌ Foydalanuvchi topilmadi. Reply orqali /adduser yuboring.";
      }

      const saved = await ensureUserRecord(userRepository, user);
      return `✅ @${formatUserLabel(saved)} bazaga qo'shildi.`;
    },
    removeUser: async ({ telegramUserId } = {}) => {
      await ensureBootstrapped();

      if (!telegramUserId) {
        throw new Error("telegramUserId talab qilinadi");
      }

      const user = await userRepository.findByTelegramUserId(telegramUserId);

      if (!user) {
        return "ℹ️ Bu foydalanuvchi topilmadi.";
      }

      await userRepository.updateById(user.id, { isActive: false });
      await adminRepository.removeByUserId(user.id);

      return `🗑 @${formatUserLabel(user)} faol ro'yxatdan chiqarildi.`;
    },
    listAdmins: async () => {
      await ensureBootstrapped();
      return formatAdminList(await adminRepository.findAll());
    },
    addAdmin: async ({ telegramUserId } = {}) => {
      await ensureBootstrapped();

      if (!telegramUserId) {
        throw new Error("telegramUserId talab qilinadi");
      }

      const user = await ensureUserRecord(userRepository, {
        id: telegramUserId,
      });

      const existing = await adminRepository.findByUserId(user.id);
      if (!existing) {
        await adminRepository.create({ userId: user.id });
      }

      return `✅ Admin qo'shildi: ${telegramUserId}`;
    },
    removeAdmin: async ({ telegramUserId } = {}) => {
      await ensureBootstrapped();

      if (!telegramUserId) {
        throw new Error("telegramUserId talab qilinadi");
      }

      const user = await userRepository.findByTelegramUserId(telegramUserId);
      if (!user) {
        return "ℹ️ Bu ID bo'yicha foydalanuvchi topilmadi.";
      }

      await adminRepository.removeByUserId(user.id);
      return `🗑 Admin olib tashlandi: ${telegramUserId}`;
    },
    listUsers: async () => {
      await ensureBootstrapped();
      return formatUserList(await userRepository.findAllActive());
    },
    isAdmin: async (telegramUserId) => {
      await ensureBootstrapped();

      if (!telegramUserId) {
        return false;
      }

      const user = await userRepository.findByTelegramUserId(telegramUserId);
      if (!user) {
        return false;
      }

      return Boolean(await adminRepository.findByUserId(user.id));
    },
  };
}

function createDutyDefinitionService({
  ensureBootstrapped,
  dutyDefinitionRepository,
  dutyTaskRepository,
}) {
  return {
    listDuties: async () => {
      await ensureBootstrapped();
      const duties = await dutyDefinitionRepository.findAll();

      if (!duties.length) {
        return "Hozircha navbatchilik turlari yo'q.";
      }

      return [
        "📋 Navbatchilik turlari:",
        ...duties.map(
          (d, i) =>
            `${i + 1}. ${d.code} | ${d.name} | ${d.isActive ? "faol" : "faol emas"}`,
        ),
      ].join("\n");
    },
    getDuty: async ({ code } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode(code);

      if (!duty) {
        return `❌ Navbatchilik topilmadi: ${code}`;
      }

      return [
        `Kod: ${duty.code}`,
        `Nomi: ${duty.name}`,
        `Kategoriya: ${duty.category}`,
        `Rejim: ${duty.assignmentMode}`,
        `Holat: ${duty.isActive ? "faol" : "faol emas"}`,
      ].join("\n");
    },
    createDuty: async ({ rawInput } = {}) => {
      await ensureBootstrapped();
      const parsed = parseDutyCreateInput(rawInput);

      const existing = await dutyDefinitionRepository.findByCode(parsed.code);
      if (existing) {
        return `ℹ️ ${parsed.code} allaqachon mavjud.`;
      }

      await dutyDefinitionRepository.create(parsed);
      return `✅ Yangi navbatchilik yaratildi: ${parsed.code}`;
    },
    enableDuty: async ({ code } = {}) => {
      return toggleDutyActive({
        ensureBootstrapped,
        dutyDefinitionRepository,
        code,
        isActive: true,
      });
    },
    disableDuty: async ({ code } = {}) => {
      return toggleDutyActive({
        ensureBootstrapped,
        dutyDefinitionRepository,
        code,
        isActive: false,
      });
    },
    setInterval: async ({ code, intervalInput } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode(code);
      if (!duty) {
        return `❌ Navbatchilik topilmadi: ${code}`;
      }

      const parsed = parseInterval(intervalInput);
      await dutyDefinitionRepository.updateById(duty.id, {
        rotationIntervalHours: parsed.hours,
        rotationIntervalDays: parsed.days,
      });

      return `✅ ${code} uchun interval yangilandi: ${intervalInput}`;
    },
    setPollConfig: async ({ code, leadHours, durationMinutes } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode(code);
      if (!duty) {
        return `❌ Navbatchilik topilmadi: ${code}`;
      }

      await dutyDefinitionRepository.updateById(duty.id, {
        requiresPoll: true,
        pollLeadHours: Number(leadHours),
        pollDurationMinutes: Number(durationMinutes),
      });

      return `✅ ${code} uchun poll sozlamasi yangilandi.`;
    },
    setCron: async ({ code, cron } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode(code);
      if (!duty) {
        return `❌ Navbatchilik topilmadi: ${code}`;
      }

      await dutyDefinitionRepository.updateById(duty.id, {
        scheduleCron: cron,
      });

      return `✅ ${code} uchun cron yangilandi.`;
    },
    addTask: async ({ taskText, dutyTypeEnum, actorUserId } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByType(dutyDefinitionRepository, dutyTypeEnum);
      if (!duty) {
        return `❌ Duty topilmadi: ${dutyTypeEnum}`;
      }

      const createdByUser = await userRepositoryByTelegram(actorUserId);

      await dutyTaskRepository.create({
        dutyDefinitionId: duty.id,
        taskText,
        createdByUserId: createdByUser?.id ?? null,
      });

      return `✅ Vazifa qo'shildi: ${taskText}`;
    },
    removeTask: async ({ taskId } = {}) => {
      await ensureBootstrapped();
      await dutyTaskRepository.removeById(taskId);
      return `🗑 Vazifa o'chirildi: ${taskId}`;
    },
    listTasks: async ({ dutyTypeEnum } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByType(dutyDefinitionRepository, dutyTypeEnum);
      if (!duty) {
        return `❌ Duty topilmadi: ${dutyTypeEnum}`;
      }

      const tasks = (
        await dutyTaskRepository.findByDutyDefinitionId(duty.id)
      ).filter((t) => t.isActive !== false);

      if (!tasks.length) {
        return "Bu navbatchilik uchun vazifalar yo'q.";
      }

      return [
        `📌 ${duty.code} vazifalari:`,
        ...tasks.map((t) => `${t.id}. ${t.taskText}`),
      ].join("\n");
    },
    clearTasks: async ({ dutyTypeEnum } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByType(dutyDefinitionRepository, dutyTypeEnum);
      if (!duty) {
        return `❌ Duty topilmadi: ${dutyTypeEnum}`;
      }

      await dutyTaskRepository.clearByDutyDefinitionId(duty.id);
      return `🧹 ${duty.code} bo'yicha barcha vazifalar tozalandi.`;
    },
  };

  async function userRepositoryByTelegram(telegramUserId) {
    if (telegramUserId == null) {
      return null;
    }

    return null;
  }
}

function createKitchenCommandFacade({
  ensureBootstrapped,
  dutyDefinitionRepository,
  dutyAssignmentQueueRepository,
  dutyRuntimeStateRepository,
  userRepository,
  kitchenDutyService,
}) {
  return {
    getCurrentAssignee: async () => {
      await ensureBootstrapped();
      const result = await kitchenDutyService.getCurrentAssignee();

      if (!result.assignee) {
        return "Hozircha oshxona navbatchilari yo'q.";
      }

      return [
        "🍽 Oshxona navbatchiligi:",
        `Joriy: @${formatUserLabel(result.assignee)}`,
        `Keyingi almashtirish: ${formatDateTime(result.nextRotationAt)}`,
      ].join("\n");
    },
    getKitchenQueue: async () => {
      await ensureBootstrapped();
      const queue = await kitchenDutyService.getKitchenQueue();

      if (!queue.length) {
        return "Oshxona navbati bo'sh.";
      }

      return [
        "📋 Oshxona navbati:",
        ...queue.map(
          (item) => `${item.position}. @${formatUserLabel(item.user)}`,
        ),
      ].join("\n");
    },
    addQueueMember: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const definition =
        await dutyDefinitionRepository.findByCode("KITCHEN_TRASH");
      const user = await userRepository.findById(userId);

      if (!definition) {
        return "❌ KITCHEN_TRASH navbatchiligi topilmadi.";
      }

      if (!user || user.isActive === false) {
        return `❌ Faol foydalanuvchi topilmadi: ${userId}`;
      }

      const queue = await dutyAssignmentQueueRepository.findByDutyDefinitionId(
        definition.id,
      );
      const activeQueue = queue.filter((q) => q.isActive !== false);
      const existing = activeQueue.find((q) => q.userId === user.id);

      if (existing) {
        return "ℹ️ Bu foydalanuvchi allaqachon oshxona navbatida.";
      }

      await dutyAssignmentQueueRepository.addQueueMember({
        dutyDefinitionId: definition.id,
        userId: user.id,
        position: activeQueue.length + 1,
      });

      return `✅ @${formatUserLabel(user)} oshxona navbatiga qo'shildi.`;
    },
    removeQueueMember: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const definition =
        await dutyDefinitionRepository.findByCode("KITCHEN_TRASH");
      if (!definition) {
        return "❌ KITCHEN_TRASH navbatchiligi topilmadi.";
      }

      await dutyAssignmentQueueRepository.removeQueueMember(
        definition.id,
        userId,
      );
      await normalizeKitchenQueuePositions(
        dutyAssignmentQueueRepository,
        definition.id,
      );

      return `🗑 ${userId} oshxona navbatidan o'chirildi.`;
    },
    rotateIfDue: async ({ force = false } = {}) => {
      await ensureBootstrapped();
      const result = await kitchenDutyService.rotateIfDue({ force });

      if (!result.rotated) {
        return result.reason === "NOT_DUE"
          ? "Hali almashtirish vaqti kelmadi."
          : "Almashtirish bajarilmadi.";
      }

      return `✅ Oshxona navbatchisi yangilandi: @${formatUserLabel(result.currentAssignee)}`;
    },
    swapCurrentWithNext: async () => {
      await ensureBootstrapped();
      const definition =
        await dutyDefinitionRepository.findByCode("KITCHEN_TRASH");
      if (!definition) {
        return "❌ KITCHEN_TRASH navbatchiligi topilmadi.";
      }

      const queue = (
        await dutyAssignmentQueueRepository.findByDutyDefinitionId(
          definition.id,
        )
      )
        .filter((q) => q.isActive !== false)
        .sort((a, b) => a.position - b.position);

      if (queue.length < 2) {
        return "Almashtirish uchun kamida 2 ta foydalanuvchi kerak.";
      }

      const runtime = await dutyRuntimeStateRepository.findByDutyDefinitionId(
        definition.id,
      );
      const currentPos = runtime?.currentQueuePosition ?? queue[0].position;
      const currentIdx = Math.max(
        queue.findIndex((q) => q.position === currentPos),
        0,
      );
      const nextIdx = (currentIdx + 1) % queue.length;
      const first = queue[currentIdx];
      const second = queue[nextIdx];

      const temp = 1000000;
      await dutyAssignmentQueueRepository.updatePosition(first.id, temp);
      await dutyAssignmentQueueRepository.updatePosition(
        second.id,
        first.position,
      );
      await dutyAssignmentQueueRepository.updatePosition(
        first.id,
        second.position,
      );

      return "🔁 Joriy va keyingi oshxona navbatchisi joyi almashtirildi.";
    },
  };
}

function createBathroomCommandFacade({
  ensureBootstrapped,
  dutyDefinitionRepository,
  dutyAssignmentGroupRepository,
  dutyAssignmentGroupMemberRepository,
  userRepository,
  bathroomDutyService,
}) {
  return {
    getCurrentPair: async () => {
      await ensureBootstrapped();
      const result = await bathroomDutyService.getCurrentPair();
      const assignees = result.currentPair?.assignees || [];

      if (!assignees.length) {
        return "Hozircha hammom navbatchi juftligi yo'q.";
      }

      return [
        "🚿 Hammom navbatchiligi:",
        `Joriy juftlik: ${assignees.map((u) => `@${formatUserLabel(u)}`).join(" va ")}`,
        `Keyingi almashtirish: ${formatDateTime(result.nextRotationAt)}`,
      ].join("\n");
    },
    listPairs: async () => {
      await ensureBootstrapped();
      const result = await bathroomDutyService.listPairs();

      if (!result.groups.length) {
        return "Hammom juftliklari hali kiritilmagan.";
      }

      return [
        "📋 Hammom juftliklari:",
        ...result.groups.map((group) => {
          const members = group.members
            .map((m) => `@${formatUserLabel(m.user)}`)
            .join(" + ");
          return `${group.position}. ${members || "(bo'sh)"}`;
        }),
      ].join("\n");
    },
    addPoolUser: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const definition =
        await dutyDefinitionRepository.findByCode("BATHROOM_TOILET");
      const user = await userRepository.findById(userId);

      if (!definition) {
        return "❌ BATHROOM_TOILET navbatchiligi topilmadi.";
      }

      if (!user || user.isActive === false) {
        return `❌ Faol foydalanuvchi topilmadi: ${userId}`;
      }

      const groups = await dutyAssignmentGroupRepository.findByDutyDefinitionId(
        definition.id,
      );
      const position = groups.length + 1;

      const group = await dutyAssignmentGroupRepository.create({
        dutyDefinitionId: definition.id,
        name: `Bathroom Pair ${position}`,
        position,
        isActive: true,
      });

      await dutyAssignmentGroupMemberRepository.addMember({
        groupId: group.id,
        userId: user.id,
      });

      return `✅ @${formatUserLabel(user)} hammom navbat juftliklariga qo'shildi.`;
    },
    removePoolUser: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const definition =
        await dutyDefinitionRepository.findByCode("BATHROOM_TOILET");
      if (!definition) {
        return "❌ BATHROOM_TOILET navbatchiligi topilmadi.";
      }

      const groups = await dutyAssignmentGroupRepository.findByDutyDefinitionId(
        definition.id,
      );

      for (const group of groups) {
        await dutyAssignmentGroupMemberRepository.removeMember(
          group.id,
          userId,
        );
        const members = await dutyAssignmentGroupMemberRepository.findByGroupId(
          group.id,
        );

        if (!members.length) {
          await dutyAssignmentGroupRepository.updateById(group.id, {
            isActive: false,
          });
        }
      }

      return `🗑 ${userId} hammom juftlik ro'yxatidan chiqarildi.`;
    },
    upsertPair: async ({ userId1, userId2 } = {}) => {
      await ensureBootstrapped();
      await bathroomDutyService.upsertPair({ userId1, userId2 });
      return `✅ Yangi juftlik saqlandi: ${userId1} va ${userId2}`;
    },
    rotatePairIfDue: async ({ force = false } = {}) => {
      await ensureBootstrapped();
      const result = await bathroomDutyService.rotatePairIfDue({ force });

      if (!result.rotated) {
        return result.reason === "NOT_DUE"
          ? "Hali juftlikni almashtirish vaqti kelmadi."
          : "Juftlik almashtirilmadi.";
      }

      const names = (result.currentAssignment?.assignees || [])
        .map((u) => `@${formatUserLabel(u)}`)
        .join(" va ");

      return `✅ Hammom juftligi yangilandi: ${names || "(noma'lum)"}`;
    },
  };
}

function createRoomCommandFacade({
  ensureBootstrapped,
  roomService,
  roomMemberRepository,
}) {
  return {
    listOwners: async ({ roomCode } = {}) => {
      await ensureBootstrapped();
      const data = await roomService.listOwners(roomCode);

      if (!data.rooms.length) {
        return "Hozircha xonalar mavjud emas.";
      }

      return [
        "🏠 Xonalar:",
        ...data.rooms.map((room) => {
          const owners = room.owners
            .map((owner) => `@${formatUserLabel(owner.user)}`)
            .join(" ");
          return `- ${room.code}: ${owners || "egalar biriktirilmagan"}`;
        }),
      ].join("\n");
    },
    createRoom: async ({ code, name } = {}) => {
      await ensureBootstrapped();
      const room = await roomService.createRoom({ code, name });
      return `✅ Xona yaratildi: ${room.code}`;
    },
    deleteRoom: async ({ roomCode } = {}) => {
      await ensureBootstrapped();
      await roomService.deleteRoom(roomCode);
      return `🗑 Xona o'chirildi: ${roomCode}`;
    },
    moveUser: async ({ userId, roomCode } = {}) => {
      await ensureBootstrapped();
      await roomService.moveUser({ userId, roomCode, isOwner: true });
      return `✅ Foydalanuvchi xonaga biriktirildi: ${userId} -> ${roomCode}`;
    },
    removeUser: async ({ userId } = {}) => {
      await ensureBootstrapped();
      await roomMemberRepository.removeByUserId(userId);
      return `🗑 Foydalanuvchi xonadan chiqarildi: ${userId}`;
    },
  };
}

function createPaymentCommandFacade({
  ensureBootstrapped,
  prisma,
  paymentService,
  paymentSettingsRepository,
}) {
  return {
    getSettings: async () => {
      await ensureBootstrapped();
      const settings =
        (await paymentSettingsRepository.findDefault()) ||
        (await paymentSettingsRepository.upsertDefault({}));

      return [
        "💳 To'lov sozlamalari:",
        `- holat: ${settings.isActive ? "faol" : "faol emas"}`,
        `- eslatma kuni: ${settings.reminderDayOfMonth}`,
        `- yig'im kuni: ${settings.collectionDayOfMonth}`,
        `- rejim: ${settings.paymentMode}`,
        `- valyuta: ${settings.amountCurrency}`,
      ].join("\n");
    },
    setMonthAmount: async (payload = {}) => {
      await ensureBootstrapped();
      const record = await paymentService.setMonthAmount(payload);
      return `✅ Oy summasi saqlandi: ${record.perPersonAmount} ${record.currency} (${record.monthKey})`;
    },
    getCurrentAmount: async () => {
      await ensureBootstrapped();
      const result = await paymentService.getCurrentAmount();
      return `💰 Joriy summa: ${result.record.perPersonAmount} ${result.record.currency} (${result.record.monthKey})`;
    },
    getAmountHistory: async ({ months = 6 } = {}) => {
      await ensureBootstrapped();
      const items = await prisma.paymentMonthAmount.findMany({
        orderBy: [{ monthKey: "desc" }],
        take: Number(months) || 6,
      });

      if (!items.length) {
        return "To'lov tarixi mavjud emas.";
      }

      return [
        "📈 To'lov tarixi:",
        ...items.map(
          (item) =>
            `${item.monthKey}: ${item.perPersonAmount} ${item.currency}`,
        ),
      ].join("\n");
    },
    setCardDetails: async ({ cardNumber, holderName } = {}) => {
      await ensureBootstrapped();
      const settings =
        (await paymentSettingsRepository.findDefault()) ||
        (await paymentSettingsRepository.upsertDefault({}));

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        cardNumberMasked: cardNumber,
        cardHolderName: holderName,
      });

      return "✅ Karta ma'lumotlari yangilandi.";
    },
    setCashInstruction: async ({ instruction } = {}) => {
      await ensureBootstrapped();
      const settings =
        (await paymentSettingsRepository.findDefault()) ||
        (await paymentSettingsRepository.upsertDefault({}));

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        cashInstruction: instruction,
      });

      return "✅ Naqd to'lov ko'rsatmasi yangilandi.";
    },
    setPaymentMode: async ({ mode } = {}) => {
      await ensureBootstrapped();
      const settings =
        (await paymentSettingsRepository.findDefault()) ||
        (await paymentSettingsRepository.upsertDefault({}));

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        paymentMode: mode,
      });

      return `✅ To'lov rejimi o'zgartirildi: ${mode}`;
    },
    setPaymentDays: async ({ reminderDay, collectionDay } = {}) => {
      await ensureBootstrapped();
      const settings =
        (await paymentSettingsRepository.findDefault()) ||
        (await paymentSettingsRepository.upsertDefault({}));

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        reminderDayOfMonth: Number(reminderDay),
        collectionDayOfMonth: Number(collectionDay),
      });

      return `✅ To'lov kunlari yangilandi: ${reminderDay}/${collectionDay}`;
    },
  };
}

function createAccountabilityService({
  ensureBootstrapped,
  userMonthlyDutyStatRepository,
}) {
  return {
    getBadDuties: async ({ monthKey } = {}) => {
      await ensureBootstrapped();
      const targetMonth = monthKey || getCurrentMonthKey();
      const offenders = await userMonthlyDutyStatRepository.findOffenders(
        targetMonth,
        2,
      );

      if (!offenders.length) {
        return `${targetMonth} oyida badDuty >= 2 bo'lganlar yo'q.`;
      }

      return [
        `⚠️ ${targetMonth} badDuty hisoboti:`,
        ...offenders.map(
          (row, index) =>
            `${index + 1}. @${formatUserLabel(row.user)} bu oy ${row.badDutyCount} marta vazifani vaqtida topshirmagan.`,
        ),
      ].join("\n");
    },
  };
}

function createSystemService({
  ensureBootstrapped,
  chatSettingsRepository,
  userRepository,
  adminRepository,
  genericDutyService,
  dutyDefinitionRepository,
  dutyPollService,
  prisma,
}) {
  return {
    getStatus: async () => {
      await ensureBootstrapped();
      const [chat, users, admins, duties] = await Promise.all([
        chatSettingsRepository.findFirst(),
        userRepository.findAllActive(),
        adminRepository.findAll(),
        dutyDefinitionRepository.findActive(),
      ]);

      return [
        "Bot holati:",
        `- chatId: ${chat?.telegramChatId || "o'rnatilmagan"}`,
        `- foydalanuvchilar: ${users.length}`,
        `- adminlar: ${admins.length}`,
        `- faol dutylar: ${duties.length}`,
      ].join("\n");
    },
    forceRotate: async ({ dutyCode } = {}) => {
      await ensureBootstrapped();
      const result = await genericDutyService.rotateDutyIfDue({
        dutyCode,
        force: true,
      });

      if (!result.rotated) {
        return `ℹ️ Rotatsiya bajarilmadi: ${result.reason}`;
      }

      return `✅ Rotatsiya bajarildi: ${dutyCode}`;
    },
    forcePoll: async ({ dutyCode, chatId } = {}) => {
      await ensureBootstrapped();
      if (!chatId) {
        return "❌ chatId topilmadi.";
      }

      await dutyPollService.createPoll({ dutyCode, chatId });
      return `✅ Poll yaratildi: ${dutyCode}`;
    },
    resolvePoll: async ({ dutyCode } = {}) => {
      await ensureBootstrapped();
      const definition = await dutyDefinitionRepository.findByCode(dutyCode);
      if (!definition) {
        return `❌ Duty topilmadi: ${dutyCode}`;
      }

      const poll = await prisma.dutyPoll.findFirst({
        where: {
          dutyDefinitionId: definition.id,
          decisionApplied: false,
        },
        orderBy: [{ closesAt: "asc" }],
      });

      if (!poll) {
        return "ℹ️ Yechilmagan poll topilmadi.";
      }

      await dutyPollService.resolvePollByTelegramPollId(poll.telegramPollId);
      return "✅ Poll yakunlandi.";
    },
    reload: async () => {
      await ensureBootstrapped();
      return "✅ Sozlamalar tekshirildi va ma'lumotlar yangilandi.";
    },
  };
}

async function importLegacyState(db, repositories) {
  if (!db || !db.data) {
    return;
  }

  const { chatSettingsRepository, userRepository, adminRepository } =
    repositories;

  const users = Array.isArray(db.data.users) ? db.data.users : [];
  const admins = Array.isArray(db.data.admins) ? db.data.admins : [];

  if (db.data.chatId != null) {
    await chatSettingsRepository.upsertByTelegramChatId(db.data.chatId, {
      timezone: "UTC",
      language: "uz",
    });
  }

  for (const u of users) {
    await ensureUserRecord(userRepository, {
      id: u.id,
      username: u.username ?? null,
      first_name: u.first_name ?? null,
      isActive: true,
    });
  }

  for (const adminTelegramId of admins) {
    const user = await ensureUserRecord(userRepository, {
      id: adminTelegramId,
    });
    const existing = await adminRepository.findByUserId(user.id);
    if (!existing) {
      await adminRepository.create({ userId: user.id });
    }
  }
}

async function seedInitialData(repositories) {
  const {
    dutyDefinitionRepository,
    dutyTaskRepository,
    roomRepository,
    paymentSettingsRepository,
  } = repositories;

  for (const seed of DUTY_DEFINITION_SEED) {
    const existing = await dutyDefinitionRepository.findByCode(seed.code);

    if (!existing) {
      await dutyDefinitionRepository.create({
        ...seed,
        isActive: true,
        tieKeepsCurrent: true,
        failureKeepsCurrent: true,
      });
      continue;
    }

    await dutyDefinitionRepository.updateById(existing.id, {
      name: seed.name,
      description: seed.description,
      category: seed.category,
      assignmentMode: seed.assignmentMode,
      rotationIntervalHours: seed.rotationIntervalHours ?? null,
      rotationIntervalDays: seed.rotationIntervalDays ?? null,
      scheduleCron: seed.scheduleCron ?? null,
      requiresPoll: seed.requiresPoll,
      pollLeadHours: seed.pollLeadHours ?? null,
      pollDurationMinutes: seed.pollDurationMinutes ?? null,
      isActive: true,
    });
  }

  for (const code of Object.keys(DUTY_TASK_SEED)) {
    const duty = await dutyDefinitionRepository.findByCode(code);
    if (!duty) {
      continue;
    }

    const existingTasks = await dutyTaskRepository.findByDutyDefinitionId(
      duty.id,
    );
    if (existingTasks.length > 0) {
      continue;
    }

    for (const taskText of DUTY_TASK_SEED[code]) {
      await dutyTaskRepository.create({
        dutyDefinitionId: duty.id,
        taskText,
      });
    }
  }

  for (const roomCode of DEFAULT_ROOM_CODES) {
    const existing = await roomRepository.findByCode(roomCode);

    if (!existing) {
      await roomRepository.create({
        code: roomCode,
        name: `Xona ${roomCode.replace("room", "")}`,
        isActive: true,
      });
    } else if (existing.isActive === false) {
      await roomRepository.updateByCode(roomCode, {
        isActive: true,
      });
    }
  }

  const paymentSettings = await paymentSettingsRepository.findDefault();
  if (!paymentSettings) {
    await paymentSettingsRepository.upsertDefault({
      isActive: true,
      reminderDayOfMonth: 13,
      collectionDayOfMonth: 15,
      paymentMode: "CARD_OR_CASH",
      amountCurrency: "USD",
    });
  }
}

async function ensureKitchenQueueSeededFromUsers(repositories, db) {
  const {
    dutyDefinitionRepository,
    dutyAssignmentQueueRepository,
    userRepository,
  } = repositories;

  const duty = await dutyDefinitionRepository.findByCode("KITCHEN_TRASH");
  if (!duty) {
    return;
  }

  const existingQueue =
    await dutyAssignmentQueueRepository.findByDutyDefinitionId(duty.id);

  if (existingQueue.some((item) => item.isActive !== false)) {
    return;
  }

  const activeUsers = await userRepository.findAllActive();
  if (!activeUsers.length) {
    return;
  }

  const legacyUsers = Array.isArray(db?.data?.users) ? db.data.users : [];
  const legacyCurrentIndex = Number(db?.data?.currentIndex || 0);

  const orderedTelegramIds = legacyUsers.length
    ? rotateLegacyOrder(legacyUsers, legacyCurrentIndex).map((u) =>
        Number(u.id),
      )
    : activeUsers.map((u) => Number(u.telegramUserId));

  const byTelegramId = new Map(
    activeUsers.map((u) => [Number(u.telegramUserId), u]),
  );

  const orderedUsers = [];

  for (const telegramId of orderedTelegramIds) {
    const user = byTelegramId.get(Number(telegramId));

    if (user) {
      orderedUsers.push(user);
      byTelegramId.delete(Number(telegramId));
    }
  }

  for (const [, user] of byTelegramId.entries()) {
    orderedUsers.push(user);
  }

  for (let index = 0; index < orderedUsers.length; index += 1) {
    await dutyAssignmentQueueRepository.addQueueMember({
      dutyDefinitionId: duty.id,
      userId: orderedUsers[index].id,
      position: index + 1,
      isActive: true,
    });
  }
}

async function normalizeKitchenQueuePositions(
  queueRepository,
  dutyDefinitionId,
) {
  const queue = (await queueRepository.findByDutyDefinitionId(dutyDefinitionId))
    .filter((item) => item.isActive !== false)
    .sort((a, b) => a.position - b.position);

  for (let index = 0; index < queue.length; index += 1) {
    const expected = index + 1;
    if (queue[index].position !== expected) {
      await queueRepository.updatePosition(queue[index].id, expected);
    }
  }
}

async function ensureUserRecord(userRepository, user) {
  const telegramUserId = resolveTelegramUserId(user);
  if (telegramUserId == null) {
    throw new Error("telegramUserId talab qilinadi");
  }

  const existing = await userRepository.findByTelegramUserId(telegramUserId);

  if (existing) {
    return userRepository.updateById(existing.id, {
      telegramUserId,
      username: user.username ?? existing.username ?? null,
      firstName:
        user.firstName ?? user.first_name ?? existing.firstName ?? null,
      lastName: user.lastName ?? user.last_name ?? existing.lastName ?? null,
      isActive: user.isActive ?? existing.isActive ?? true,
    });
  }

  return userRepository.create({
    telegramUserId,
    username: user.username ?? null,
    firstName: user.firstName ?? user.first_name ?? null,
    lastName: user.lastName ?? user.last_name ?? null,
    isActive: user.isActive ?? true,
  });
}

async function findDutyByType(dutyDefinitionRepository, dutyTypeEnum) {
  if (!dutyTypeEnum) {
    return null;
  }

  const byCode = await dutyDefinitionRepository.findByCode(dutyTypeEnum);
  if (byCode) {
    return byCode;
  }

  const all = await dutyDefinitionRepository.findAll();
  return all.find((duty) => duty.builtinType === dutyTypeEnum) || null;
}

async function toggleDutyActive({
  ensureBootstrapped,
  dutyDefinitionRepository,
  code,
  isActive,
}) {
  await ensureBootstrapped();
  const duty = await dutyDefinitionRepository.findByCode(code);

  if (!duty) {
    return `❌ Navbatchilik topilmadi: ${code}`;
  }

  await dutyDefinitionRepository.updateById(duty.id, { isActive });
  return `✅ ${code} ${isActive ? "yoqildi" : "o'chirildi"}.`;
}

function parseDutyCreateInput(rawInput) {
  const text = String(rawInput || "").trim();

  if (!text) {
    throw new Error("dutycreate uchun ma'lumot kerak");
  }

  if (text.startsWith("{")) {
    const parsed = JSON.parse(text);
    return {
      code: String(parsed.code).toUpperCase(),
      builtinType: parsed.builtinType ?? null,
      name: parsed.name,
      description: parsed.description ?? null,
      category: parsed.category,
      assignmentMode: parsed.assignmentMode,
      rotationIntervalHours: parsed.rotationIntervalHours ?? null,
      rotationIntervalDays: parsed.rotationIntervalDays ?? null,
      scheduleCron: parsed.scheduleCron ?? null,
      requiresPoll: parsed.requiresPoll ?? false,
      pollLeadHours: parsed.pollLeadHours ?? null,
      pollDurationMinutes: parsed.pollDurationMinutes ?? null,
      isActive: parsed.isActive ?? true,
      tieKeepsCurrent: true,
      failureKeepsCurrent: true,
    };
  }

  const parts = text.split("|").map((part) => part.trim());
  if (parts.length < 4) {
    throw new Error(
      "Format: /dutycreate CODE|NOMI|CATEGORY|ASSIGNMENT_MODE (masalan: CUSTOM|Test duty|ROTATION|SINGLE)",
    );
  }

  return {
    code: parts[0].toUpperCase(),
    builtinType: null,
    name: parts[1],
    description: null,
    category: parts[2],
    assignmentMode: parts[3],
    rotationIntervalHours: null,
    rotationIntervalDays: null,
    scheduleCron: null,
    requiresPoll: false,
    pollLeadHours: null,
    pollDurationMinutes: null,
    isActive: true,
    tieKeepsCurrent: true,
    failureKeepsCurrent: true,
  };
}

function parseInterval(intervalInput) {
  const value = String(intervalInput || "")
    .trim()
    .toLowerCase();

  const hourMatch = value.match(/^(\d+)h$/);
  if (hourMatch) {
    return { hours: Number(hourMatch[1]), days: null };
  }

  const dayMatch = value.match(/^(\d+)d$/);
  if (dayMatch) {
    return { hours: null, days: Number(dayMatch[1]) };
  }

  throw new Error("Interval formati noto'g'ri. Misol: 48h yoki 14d");
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

function formatAdminList(admins) {
  if (!admins.length) {
    return "Hali adminlar yo'q.";
  }

  return [
    "📋 Adminlar:",
    ...admins.map((admin, index) => {
      const label = admin.user
        ? `@${formatUserLabel(admin.user)}`
        : `user:${admin.userId}`;
      return `${index + 1}. ${label} (ID: ${admin.userId})`;
    }),
  ].join("\n");
}

function formatUserList(users) {
  if (!users.length) {
    return "Hali foydalanuvchilar yo'q.";
  }

  return [
    "📋 Foydalanuvchilar:",
    ...users.map(
      (user, index) =>
        `${index + 1}. @${formatUserLabel(user)} (ID: ${user.id})`,
    ),
  ].join("\n");
}

function formatUserLabel(user) {
  if (!user) {
    return "noma'lum";
  }

  return (
    user.username ||
    user.firstName ||
    user.first_name ||
    user.lastName ||
    user.id
  );
}

function rotateLegacyOrder(users, currentIndex) {
  if (!users.length) {
    return [];
  }

  const safeIndex =
    Number.isInteger(currentIndex) && currentIndex >= 0
      ? currentIndex % users.length
      : 0;

  return users.slice(safeIndex).concat(users.slice(0, safeIndex));
}

function formatDateTime(value) {
  if (!value) {
    return "noma'lum";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "noma'lum";
  }

  return date.toISOString().replace("T", " ").slice(0, 16);
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

module.exports = {
  createStartupServiceContainer,
};
const { getPrismaClient } = require("../database/client/prismaClient");
const {
  PrismaAdminRepository,
  PrismaChatSettingsRepository,
  PrismaDutyAssignmentGroupMemberRepository,
  PrismaDutyAssignmentGroupRepository,
  PrismaDutyAssignmentQueueRepository,
  PrismaDutyDefinitionRepository,
  PrismaDutyPollRepository,
  PrismaDutyRuntimeStateRepository,
  PrismaDutyTaskRepository,
  PrismaPaymentMonthAmountRepository,
  PrismaPaymentSettingsRepository,
  PrismaRoomMemberRepository,
  PrismaRoomRepository,
  PrismaUserMonthlyDutyStatRepository,
  PrismaUserRepository,
} = require("../database/repositories/prisma");
const { createBathroomDutyService } = require("./bathroomDutyService");
const { createDutyPollService } = require("./dutyPollService");
const { createGenericDutyService } = require("./genericDutyService");
const { createKitchenDutyService } = require("./kitchenDutyService");
const { createPaymentService } = require("./paymentService");
const { createRoomService } = require("./roomService");

const DEFAULT_ROOMS = [
  { code: "room1", name: "Room 1" },
  { code: "room2", name: "Room 2" },
  { code: "room3", name: "Room 3" },
  { code: "room4", name: "Room 4" },
];

const DEFAULT_DUTIES = [
  {
    code: "KITCHEN_TRASH",
    builtinType: "KITCHEN_TRASH",
    name: "Oshxona va chiqindi",
    description:
      "48 soatda bir navbat almashadigan oshxona va chiqindi navbatchiligi.",
    category: "ROTATION",
    assignmentMode: "SINGLE",
    rotationIntervalHours: 48,
    rotationIntervalDays: null,
    scheduleCron: null,
    requiresPoll: true,
    pollLeadHours: 2,
    pollDurationMinutes: 60,
  },
  {
    code: "BATHROOM_TOILET",
    builtinType: "BATHROOM_TOILET",
    name: "Hammom va hojatxona",
    description: "14 kunda bir juftliklar almashadigan hammom navbatchiligi.",
    category: "ROTATION",
    assignmentMode: "PAIR",
    rotationIntervalHours: null,
    rotationIntervalDays: 14,
    scheduleCron: null,
    requiresPoll: true,
    pollLeadHours: 3,
    pollDurationMinutes: 120,
  },
  {
    code: "ROOM_CLEANING",
    builtinType: "ROOM_CLEANING",
    name: "Xona tozalash eslatmasi",
    description: "Shanba va yakshanba xona egalari uchun eslatma yuboriladi.",
    category: "ROOM_REMINDER",
    assignmentMode: "ROOM",
    rotationIntervalHours: null,
    rotationIntervalDays: null,
    scheduleCron: "0 10 * * 6,0",
    requiresPoll: false,
    pollLeadHours: null,
    pollDurationMinutes: null,
  },
  {
    code: "FLAT_PAYMENT",
    builtinType: "FLAT_PAYMENT",
    name: "Kvartira to'lovi",
    description: "Har oy 13 va 15-kunlari to'lov eslatmalari.",
    category: "PAYMENT_REMINDER",
    assignmentMode: "NONE",
    rotationIntervalHours: null,
    rotationIntervalDays: null,
    scheduleCron: null,
    requiresPoll: false,
    pollLeadHours: null,
    pollDurationMinutes: null,
  },
];

const DEFAULT_TASKS_BY_DUTY_CODE = {
  KITCHEN_TRASH: ["Oshxonani tozalash", "Chiqindini olib chiqish"],
  BATHROOM_TOILET: ["Hammomni tozalash", "Hojatxonani tozalash"],
  ROOM_CLEANING: ["Polni artish", "Changni artish"],
};

function createStartupServiceContainer({ bot, db, dutyService }) {
  const prisma = getPrismaClient();

  const repositories = {
    adminRepository: new PrismaAdminRepository(prisma),
    chatSettingsRepository: new PrismaChatSettingsRepository(prisma),
    dutyAssignmentGroupMemberRepository:
      new PrismaDutyAssignmentGroupMemberRepository(prisma),
    dutyAssignmentGroupRepository: new PrismaDutyAssignmentGroupRepository(
      prisma,
    ),
    dutyAssignmentQueueRepository: new PrismaDutyAssignmentQueueRepository(
      prisma,
    ),
    dutyDefinitionRepository: new PrismaDutyDefinitionRepository(prisma),
    dutyPollRepository: new PrismaDutyPollRepository(prisma),
    dutyRuntimeStateRepository: new PrismaDutyRuntimeStateRepository(prisma),
    dutyTaskRepository: new PrismaDutyTaskRepository(prisma),
    paymentMonthAmountRepository: new PrismaPaymentMonthAmountRepository(
      prisma,
    ),
    paymentSettingsRepository: new PrismaPaymentSettingsRepository(prisma),
    roomMemberRepository: new PrismaRoomMemberRepository(prisma),
    roomRepository: new PrismaRoomRepository(prisma),
    userMonthlyDutyStatRepository: new PrismaUserMonthlyDutyStatRepository(
      prisma,
    ),
    userRepository: new PrismaUserRepository(prisma),
    prisma,
  };

  const notifier = {
    sendMessage: (chatId, text) => bot.sendMessage(chatId, text),
  };

  const telegramPollGateway = {
    async createAnonymousPoll({
      chatId,
      question,
      options,
      openPeriodSeconds,
    }) {
      const message = await bot.sendPoll(chatId, question, options, {
        is_anonymous: true,
        open_period: openPeriodSeconds,
      });

      return {
        telegramPollId: message.poll.id,
        telegramMessageId: message.message_id,
      };
    },
  };

  const genericDutyService = createGenericDutyService({
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
    dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository:
      repositories.dutyAssignmentGroupMemberRepository,
    roomRepository: repositories.roomRepository,
    roomMemberRepository: repositories.roomMemberRepository,
    userRepository: repositories.userRepository,
  });

  const dutyPollService = createDutyPollService({
    dutyPollRepository: repositories.dutyPollRepository,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    userMonthlyDutyStatRepository: repositories.userMonthlyDutyStatRepository,
    genericDutyService,
    telegramPollGateway,
  });

  const kitchenCoreService = createKitchenDutyService({
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
    userRepository: repositories.userRepository,
  });

  const bathroomCoreService = createBathroomDutyService({
    genericDutyService,
    dutyPollService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository:
      repositories.dutyAssignmentGroupMemberRepository,
    userRepository: repositories.userRepository,
  });

  const roomCoreService = createRoomService({
    roomRepository: repositories.roomRepository,
    roomMemberRepository: repositories.roomMemberRepository,
    userRepository: repositories.userRepository,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
    notifier,
  });

  const paymentCoreService = createPaymentService({
    paymentSettingsRepository: repositories.paymentSettingsRepository,
    paymentMonthAmountRepository: repositories.paymentMonthAmountRepository,
    userRepository: repositories.userRepository,
    notifier,
  });

  const bootstrapState = {
    promise: null,
  };

  const ensureBootstrapped = async () => {
    if (bootstrapState.promise) {
      return bootstrapState.promise;
    }

    bootstrapState.promise = (async () => {
      await importLegacyState({ db, repositories });
      await seedInitialData({ repositories, dutyService, db });
      await ensureKitchenQueueSeededFromUsers({ repositories, db });
    })();

    return bootstrapState.promise;
  };

  ensureBootstrapped().catch((error) => {
    console.error("Startup bootstrap failed", error);
  });

  const lifecycleService = createLifecycleService({
    ensureBootstrapped,
    chatSettingsRepository: repositories.chatSettingsRepository,
    userRepository: repositories.userRepository,
    adminRepository: repositories.adminRepository,
  });

  const userAdminService = createUserAdminService({
    ensureBootstrapped,
    userRepository: repositories.userRepository,
    adminRepository: repositories.adminRepository,
  });

  const dutyDefinitionService = createDutyDefinitionService({
    ensureBootstrapped,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
  });

  const kitchenDutyService = createKitchenCommandFacade({
    ensureBootstrapped,
    kitchenCoreService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    userRepository: repositories.userRepository,
  });

  const bathroomDutyService = createBathroomCommandFacade({
    ensureBootstrapped,
    bathroomCoreService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository:
      repositories.dutyAssignmentGroupMemberRepository,
    userRepository: repositories.userRepository,
  });

  const roomService = createRoomCommandFacade({
    ensureBootstrapped,
    roomCoreService,
    roomMemberRepository: repositories.roomMemberRepository,
  });

  const paymentService = createPaymentCommandFacade({
    ensureBootstrapped,
    paymentCoreService,
    paymentSettingsRepository: repositories.paymentSettingsRepository,
    paymentMonthAmountRepository: repositories.paymentMonthAmountRepository,
  });

  const accountabilityService = createAccountabilityService({
    ensureBootstrapped,
    userMonthlyDutyStatRepository: repositories.userMonthlyDutyStatRepository,
  });

  const systemService = createSystemService({
    ensureBootstrapped,
    chatSettingsRepository: repositories.chatSettingsRepository,
    userRepository: repositories.userRepository,
    adminRepository: repositories.adminRepository,
    genericDutyService,
    dutyPollService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyPollRepository: repositories.dutyPollRepository,
  });

  const authService = {
    ensureAdmin: async ({ userId } = {}) => {
      const isAdmin = await userAdminService.isAdmin(userId);

      if (!isAdmin) {
        throw new Error("Admin huquqi talab qilinadi");
      }

      return true;
    },
  };

  return {
    authService,
    accountabilityService,
    bathroomDutyService,
    dutyDefinitionService,
    kitchenDutyService,
    lifecycleService,
    paymentService,
    roomService,
    systemService,
    userAdminService,
    bot,
  };
}

function createLifecycleService({
  ensureBootstrapped,
  chatSettingsRepository,
  userRepository,
  adminRepository,
}) {
  return {
    start: async ({ chatId, user } = {}) => {
      if (!chatId) {
        throw new Error("start requires chatId");
      }

      await ensureBootstrapped();

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
            return "✅ Bot ishga tushdi. Siz birinchi admin sifatida belgilandingiz.";
          }
        }
      }

      return "✅ Bot ishga tushdi.";
    },
  };
}

function createUserAdminService({
  ensureBootstrapped,
  userRepository,
  adminRepository,
}) {
  return {
    addUser: async ({ message } = {}) => {
      await ensureBootstrapped();

      const user = resolveTargetUser(message);

      if (!user) {
        return (
          "❌ Foydalanuvchini aniqlab bo'lmadi.\n" +
          "Reply qilib /adduser yuboring yoki /adduser dan oldin user xabar yuborsin."
        );
      }

      const savedUser = await ensureUserRecord(userRepository, user);

      return `✅ @${formatUserLabel(savedUser)} bazaga qo'shildi.`;
    },
    removeUser: async ({ telegramUserId } = {}) => {
      await ensureBootstrapped();

      if (!telegramUserId) {
        throw new Error("removeUser uchun telegramUserId kerak");
      }

      const user = await userRepository.findByTelegramUserId(telegramUserId);

      if (!user) {
        return "ℹ️ Bu foydalanuvchi bazada topilmadi.";
      }

      await userRepository.updateById(user.id, { isActive: false });
      await adminRepository.removeByUserId(user.id);

      return `🗑 @${formatUserLabel(user)} faol ro'yxatdan chiqarildi.`;
    },
    listAdmins: async () => {
      await ensureBootstrapped();
      const admins = await adminRepository.findAll();
      return formatAdminList(admins);
    },
    addAdmin: async ({ telegramUserId } = {}) => {
      await ensureBootstrapped();

      if (!telegramUserId) {
        throw new Error("addAdmin uchun telegramUserId kerak");
      }

      const user = await ensureUserRecord(userRepository, {
        id: telegramUserId,
      });

      const existing = await adminRepository.findByUserId(user.id);

      if (!existing) {
        await adminRepository.create({ userId: user.id });
      }

      return `✅ Admin qo'shildi: ${telegramUserId}`;
    },
    removeAdmin: async ({ telegramUserId } = {}) => {
      await ensureBootstrapped();

      if (!telegramUserId) {
        throw new Error("removeAdmin uchun telegramUserId kerak");
      }

      const user = await userRepository.findByTelegramUserId(telegramUserId);

      if (!user) {
        return "ℹ️ Bu telegram ID bo'yicha admin topilmadi.";
      }

      await adminRepository.removeByUserId(user.id);
      return `🗑 Admin olib tashlandi: ${telegramUserId}`;
    },
    listUsers: async () => {
      await ensureBootstrapped();
      const users = await userRepository.findAllActive();
      return formatUserList(users);
    },
    isAdmin: async (telegramUserId) => {
      await ensureBootstrapped();
      const user = await userRepository.findByTelegramUserId(telegramUserId);

      if (!user) {
        return false;
      }

      const admin = await adminRepository.findByUserId(user.id);
      return Boolean(admin);
    },
  };
}

function createDutyDefinitionService({
  ensureBootstrapped,
  dutyDefinitionRepository,
  dutyTaskRepository,
}) {
  return {
    listDuties: async () => {
      await ensureBootstrapped();
      const duties = await dutyDefinitionRepository.findAll();

      if (!duties.length) {
        return "Hozircha navbatchilik turlari yo'q.";
      }

      return [
        "📋 Navbatchilik turlari:",
        ...duties.map(
          (duty, index) =>
            `${index + 1}. ${duty.code} | ${duty.name} | ${duty.isActive ? "faol" : "o'chirilgan"}`,
        ),
      ].join("\n");
    },
    getDuty: async ({ code } = {}) => {
      await ensureBootstrapped();

      if (!code) {
        throw new Error("duty kodi kerak");
      }

      const duty = await dutyDefinitionRepository.findByCode(code);

      if (!duty) {
        return `Navbatchilik topilmadi: ${code}`;
      }

      const tasks = await dutyTaskRepository.findByDutyDefinitionId(duty.id);

      return [
        `Kod: ${duty.code}`,
        `Nomi: ${duty.name}`,
        `Kategoriya: ${duty.category}`,
        `Holati: ${duty.isActive ? "faol" : "o'chirilgan"}`,
        `Biriktirish usuli: ${duty.assignmentMode}`,
        `Vazifalar soni: ${(tasks || []).length}`,
      ].join("\n");
    },
    createDuty: async ({ rawInput } = {}) => {
      await ensureBootstrapped();

      const parsed = parseDutyCreateInput(rawInput);
      const existing = await dutyDefinitionRepository.findByCode(parsed.code);

      if (existing) {
        return `ℹ️ ${parsed.code} allaqachon mavjud.`;
      }

      await dutyDefinitionRepository.create(parsed);
      return `✅ Yangi navbatchilik yaratildi: ${parsed.code}`;
    },
    enableDuty: async ({ code } = {}) => {
      await ensureBootstrapped();
      return setDutyActiveState(dutyDefinitionRepository, code, true);
    },
    disableDuty: async ({ code } = {}) => {
      await ensureBootstrapped();
      return setDutyActiveState(dutyDefinitionRepository, code, false);
    },
    setInterval: async ({ code, intervalInput } = {}) => {
      await ensureBootstrapped();
      const duty = await mustFindDuty(dutyDefinitionRepository, code);
      const parsed = parseIntervalInput(intervalInput);

      await dutyDefinitionRepository.updateById(duty.id, {
        ...duty,
        rotationIntervalHours: parsed.hours,
        rotationIntervalDays: parsed.days,
      });

      return `✅ ${code} interval yangilandi: ${intervalInput}`;
    },
    setPollConfig: async ({ code, leadHours, durationMinutes } = {}) => {
      await ensureBootstrapped();
      const duty = await mustFindDuty(dutyDefinitionRepository, code);

      await dutyDefinitionRepository.updateById(duty.id, {
        ...duty,
        requiresPoll: true,
        pollLeadHours: Number(leadHours),
        pollDurationMinutes: Number(durationMinutes),
      });

      return `✅ ${code} uchun poll sozlamalari yangilandi.`;
    },
    setCron: async ({ code, cron } = {}) => {
      await ensureBootstrapped();
      const duty = await mustFindDuty(dutyDefinitionRepository, code);

      await dutyDefinitionRepository.updateById(duty.id, {
        ...duty,
        scheduleCron: String(cron || "").trim() || null,
      });

      return `✅ ${code} uchun cron yangilandi.`;
    },
    addTask: async ({ taskText, dutyTypeEnum, actorUserId } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByTypeOrCode(
        dutyDefinitionRepository,
        dutyTypeEnum,
      );

      if (!duty) {
        throw new Error(`Duty topilmadi: ${dutyTypeEnum}`);
      }

      const created = await dutyTaskRepository.create({
        dutyDefinitionId: duty.id,
        taskText,
        createdByUserId: actorUserId || null,
      });

      return `✅ Vazifa qo'shildi (#${created.id}) ${duty.code}: ${taskText}`;
    },
    removeTask: async ({ taskId } = {}) => {
      await ensureBootstrapped();

      if (!taskId) {
        throw new Error("taskId kerak");
      }

      await dutyTaskRepository.removeById(taskId);
      return `🗑 Vazifa o'chirildi: ${taskId}`;
    },
    listTasks: async ({ dutyTypeEnum } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByTypeOrCode(
        dutyDefinitionRepository,
        dutyTypeEnum,
      );

      if (!duty) {
        throw new Error(`Duty topilmadi: ${dutyTypeEnum}`);
      }

      const tasks = await dutyTaskRepository.findByDutyDefinitionId(duty.id);

      if (!tasks.length) {
        return `ℹ️ ${duty.code} uchun vazifalar yo'q.`;
      }

      return [
        `📌 ${duty.code} vazifalari:`,
        ...tasks.map(
          (task) => `${task.position}. (#${task.id}) ${task.taskText}`,
        ),
      ].join("\n");
    },
    clearTasks: async ({ dutyTypeEnum } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByTypeOrCode(
        dutyDefinitionRepository,
        dutyTypeEnum,
      );

      if (!duty) {
        throw new Error(`Duty topilmadi: ${dutyTypeEnum}`);
      }

      const result = await dutyTaskRepository.clearByDutyDefinitionId(duty.id);
      return `🗑 ${duty.code} uchun ${result.count || 0} ta vazifa o'chirildi.`;
    },
  };
}

function createKitchenCommandFacade({
  ensureBootstrapped,
  kitchenCoreService,
  dutyDefinitionRepository,
  dutyAssignmentQueueRepository,
  dutyRuntimeStateRepository,
  userRepository,
}) {
  return {
    getCurrentAssignee: async () => {
      await ensureBootstrapped();
      const result = await kitchenCoreService.getCurrentAssignee();

      if (!result.assignee) {
        return "ℹ️ Oshxona navbati uchun foydalanuvchilar hali qo'shilmagan.";
      }

      return [
        "🍽 Oshxona navbatchisi:",
        `- ${formatUserMention(result.assignee)}`,
        `- Keyingi almashuv: ${formatDateTime(result.nextRotationAt)}`,
      ].join("\n");
    },
    getKitchenQueue: async () => {
      await ensureBootstrapped();
      const queue = await kitchenCoreService.getKitchenQueue();

      if (!queue.length) {
        return "ℹ️ Oshxona navbati bo'sh.";
      }

      return [
        "📋 Oshxona navbati:",
        ...queue.map(
          (item) => `${item.position}. ${formatUserMention(item.user)}`,
        ),
      ].join("\n");
    },
    addQueueMember: async ({ userId } = {}) => {
      await ensureBootstrapped();

      const user = await userRepository.findById(userId);

      if (!user || user.isActive === false) {
        throw new Error(`Faol foydalanuvchi topilmadi: ${userId}`);
      }

      const duty = await mustFindDuty(
        dutyDefinitionRepository,
        "KITCHEN_TRASH",
      );
      const queue = await dutyAssignmentQueueRepository.findByDutyDefinitionId(
        duty.id,
      );

      if ((queue || []).some((item) => item.userId === Number(userId))) {
        return "ℹ️ Bu foydalanuvchi oshxona navbatida allaqachon bor.";
      }

      const nextPosition = (queue || []).length + 1;

      await dutyAssignmentQueueRepository.addQueueMember({
        dutyDefinitionId: duty.id,
        userId: Number(userId),
        position: nextPosition,
        isActive: true,
      });

      return `✅ Oshxona navbatiga qo'shildi: ${formatUserMention(user)}`;
    },
    removeQueueMember: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const duty = await mustFindDuty(
        dutyDefinitionRepository,
        "KITCHEN_TRASH",
      );

      await dutyAssignmentQueueRepository.removeQueueMember(duty.id, userId);
      await normalizeQueuePositions(dutyAssignmentQueueRepository, duty.id);

      return `🗑 Oshxona navbatidan olib tashlandi: ${userId}`;
    },
    rotateIfDue: async ({ force = false } = {}) => {
      await ensureBootstrapped();
      const result = await kitchenCoreService.rotateIfDue({ force });

      if (!result.rotated) {
        if (result.reason === "QUEUE_EMPTY") {
          return "ℹ️ Navbat bo'sh, almashuv qilinmadi.";
        }

        return `ℹ️ Hali almashuv vaqti emas. Keyingi almashuv: ${formatDateTime(result.nextRotationAt)}`;
      }

      return [
        "✅ Oshxona navbati almashdi.",
        `- Oldingi: ${formatUserMention(result.previousAssignee)}`,
        `- Yangi: ${formatUserMention(result.currentAssignee)}`,
      ].join("\n");
    },
    swapCurrentWithNext: async () => {
      await ensureBootstrapped();
      const duty = await mustFindDuty(
        dutyDefinitionRepository,
        "KITCHEN_TRASH",
      );
      const queue = await dutyAssignmentQueueRepository.findByDutyDefinitionId(
        duty.id,
      );
      const active = (queue || []).filter((item) => item.isActive !== false);

      if (active.length < 2) {
        return "ℹ️ Almashtirish uchun kamida 2 ta foydalanuvchi kerak.";
      }

      const runtime = await dutyRuntimeStateRepository.findByDutyDefinitionId(
        duty.id,
      );
      const currentPosition =
        runtime?.currentQueuePosition ?? active[0].position;
      const sorted = [...active].sort((a, b) => a.position - b.position);
      const currentIndex = sorted.findIndex(
        (item) => item.position === currentPosition,
      );
      const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (safeCurrentIndex + 1) % sorted.length;
      const current = sorted[safeCurrentIndex];
      const next = sorted[nextIndex];
      const tempPosition = 999999;

      await dutyAssignmentQueueRepository.updatePosition(next.id, tempPosition);
      await dutyAssignmentQueueRepository.updatePosition(
        current.id,
        next.position,
      );
      await dutyAssignmentQueueRepository.updatePosition(
        next.id,
        current.position,
      );

      return "✅ Joriy va keyingi oshxona navbatchilari almashtirildi.";
    },
  };
}

function createBathroomCommandFacade({
  ensureBootstrapped,
  bathroomCoreService,
  dutyDefinitionRepository,
  dutyAssignmentGroupRepository,
  dutyAssignmentGroupMemberRepository,
  userRepository,
}) {
  return {
    getCurrentPair: async () => {
      await ensureBootstrapped();
      const result = await bathroomCoreService.getCurrentPair();
      const names = (result.currentPair?.assignees || []).map(
        formatUserMention,
      );

      if (!names.length) {
        return "ℹ️ Hammom navbatchi juftligi hali belgilanmagan.";
      }

      return [
        "🚿 Hozirgi hammom navbatchilari:",
        `- ${names.join(" va ")}`,
        `- Keyingi almashuv: ${formatDateTime(result.nextRotationAt)}`,
      ].join("\n");
    },
    listPairs: async () => {
      await ensureBootstrapped();
      const result = await bathroomCoreService.listPairs();

      if (!result.groups.length) {
        return "ℹ️ Hammom juftliklari hali kiritilmagan.";
      }

      return [
        "📋 Hammom juftliklari:",
        ...result.groups.map((group) => {
          const members = (group.members || [])
            .map((member) => formatUserMention(member.user))
            .join(" + ");
          return `${group.position}. ${members || "(bo'sh)"}`;
        }),
      ].join("\n");
    },
    addPoolUser: async ({ userId } = {}) => {
      await ensureBootstrapped();

      const user = await userRepository.findById(userId);

      if (!user || user.isActive === false) {
        throw new Error(`Faol foydalanuvchi topilmadi: ${userId}`);
      }

      const duty = await mustFindDuty(
        dutyDefinitionRepository,
        "BATHROOM_TOILET",
      );
      const groups = await dutyAssignmentGroupRepository.findByDutyDefinitionId(
        duty.id,
      );
      const nextPosition = (groups || []).length + 1;

      const group = await dutyAssignmentGroupRepository.create({
        dutyDefinitionId: duty.id,
        name: `Bathroom Pool ${nextPosition}`,
        position: nextPosition,
        isActive: true,
      });

      await dutyAssignmentGroupMemberRepository.addMember({
        groupId: group.id,
        userId: user.id,
      });

      return `✅ Hammom ro'yxatiga qo'shildi: ${formatUserMention(user)}.`;
    },
    removePoolUser: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const duty = await mustFindDuty(
        dutyDefinitionRepository,
        "BATHROOM_TOILET",
      );
      const groups = await dutyAssignmentGroupRepository.findByDutyDefinitionId(
        duty.id,
      );

      for (const group of groups || []) {
        await dutyAssignmentGroupMemberRepository.removeMember(
          group.id,
          userId,
        );
        const members = await dutyAssignmentGroupMemberRepository.findByGroupId(
          group.id,
        );

        if (!members.length) {
          await dutyAssignmentGroupRepository.updateById(group.id, {
            name: group.name,
            position: group.position,
            isActive: false,
          });
        }
      }

      return `🗑 Hammom ro'yxatidan olib tashlandi: ${userId}`;
    },
    upsertPair: async ({ userId1, userId2 } = {}) => {
      await ensureBootstrapped();
      const pair = await bathroomCoreService.upsertPair({ userId1, userId2 });
      const members = (pair.members || []).map((member) =>
        formatUserMention(member.user),
      );
      return `✅ Hammom juftligi saqlandi: ${members.join(" va ")}`;
    },
    rotatePairIfDue: async ({ force = false } = {}) => {
      await ensureBootstrapped();
      const result = await bathroomCoreService.rotatePairIfDue({ force });

      if (!result.rotated) {
        return "ℹ️ Hammom navbatchiligi uchun hali almashuv vaqti emas yoki juftlik yo'q.";
      }

      const members = (result.currentAssignment?.assignees || []).map(
        formatUserMention,
      );
      return `✅ Hammom navbatchiligi almashdi: ${members.join(" va ")}`;
    },
  };
}

function createRoomCommandFacade({
  ensureBootstrapped,
  roomCoreService,
  roomMemberRepository,
}) {
  return {
    listOwners: async ({ roomCode } = {}) => {
      await ensureBootstrapped();
      const result = await roomCoreService.listOwners(roomCode);

      if (!result.rooms.length) {
        return "ℹ️ Xonalar ro'yxati bo'sh.";
      }

      return [
        "🏠 Xonalar:",
        ...result.rooms.map((room) => {
          const owners = (room.owners || [])
            .map((owner) => formatUserMention(owner.user))
            .join(" ");
          return `- ${room.code}: ${owners || "owner yo'q"}`;
        }),
      ].join("\n");
    },
    createRoom: async ({ code, name } = {}) => {
      await ensureBootstrapped();
      const room = await roomCoreService.createRoom({ code, name });
      return `✅ Xona yaratildi: ${room.code}`;
    },
    deleteRoom: async ({ roomCode } = {}) => {
      await ensureBootstrapped();
      await roomCoreService.deleteRoom(roomCode);
      return `🗑 Xona o'chirildi: ${roomCode}`;
    },
    moveUser: async ({ userId, roomCode } = {}) => {
      await ensureBootstrapped();
      const result = await roomCoreService.moveUser({
        userId,
        roomCode,
        isOwner: true,
      });
      return `✅ ${formatUserMention(result.user)} ${result.room.code} xonasiga biriktirildi.`;
    },
    removeUser: async ({ userId } = {}) => {
      await ensureBootstrapped();
      await roomMemberRepository.removeByUserId(userId);
      return `🗑 Foydalanuvchi xonadan olib tashlandi: ${userId}`;
    },
  };
}

function createPaymentCommandFacade({
  ensureBootstrapped,
  paymentCoreService,
  paymentSettingsRepository,
  paymentMonthAmountRepository,
}) {
  return {
    getSettings: async () => {
      await ensureBootstrapped();
      const settings = await paymentSettingsRepository.findDefault();

      if (!settings) {
        return "ℹ️ To'lov sozlamalari hali yo'q.";
      }

      return [
        "💳 To'lov sozlamalari:",
        `- Holat: ${settings.isActive ? "faol" : "o'chirilgan"}`,
        `- Rejim: ${settings.paymentMode}`,
        `- Eslatma kuni: ${settings.reminderDayOfMonth}`,
        `- Yig'im kuni: ${settings.collectionDayOfMonth}`,
        `- Karta: ${settings.cardNumberMasked || "kiritilmagan"}`,
        `- Naqd izoh: ${settings.cashInstruction || settings.note || "yo'q"}`,
      ].join("\n");
    },
    setMonthAmount: async ({ amount, currency, setByUserId, source } = {}) => {
      await ensureBootstrapped();
      const record = await paymentCoreService.setMonthAmount({
        amount,
        currency,
        setByUserId,
        source,
      });
      return `✅ Oylik summa saqlandi: ${record.perPersonAmount} ${record.currency} (${record.monthKey})`;
    },
    getCurrentAmount: async () => {
      await ensureBootstrapped();
      const result = await paymentCoreService.getCurrentAmount({});
      return `💰 Joriy summa: ${result.record.perPersonAmount} ${result.record.currency} (${result.record.monthKey})`;
    },
    getAmountHistory: async ({ months = 6 } = {}) => {
      await ensureBootstrapped();
      const list =
        await paymentMonthAmountRepository.prisma?.paymentMonthAmount?.findMany?.(
          {
            orderBy: [{ monthKey: "desc" }],
            take: Number(months) || 6,
          },
        );

      const history = list || [];

      if (!history.length) {
        return "ℹ️ To'lov tarixi bo'sh.";
      }

      return [
        "🧾 To'lov tarixi:",
        ...history.map(
          (item) =>
            `- ${item.monthKey}: ${item.perPersonAmount} ${item.currency}`,
        ),
      ].join("\n");
    },
    setCardDetails: async ({ cardNumber, holderName } = {}) => {
      await ensureBootstrapped();
      const settings = (await paymentSettingsRepository.findDefault()) || {};

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        cardNumberMasked: cardNumber,
        cardHolderName: holderName || settings.cardHolderName || null,
      });

      return "✅ Karta ma'lumotlari yangilandi.";
    },
    setCashInstruction: async ({ instruction } = {}) => {
      await ensureBootstrapped();
      const settings = (await paymentSettingsRepository.findDefault()) || {};

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        cashInstruction: instruction,
      });

      return "✅ Naqd to'lov bo'yicha izoh yangilandi.";
    },
    setPaymentMode: async ({ mode } = {}) => {
      await ensureBootstrapped();
      const settings = (await paymentSettingsRepository.findDefault()) || {};

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        paymentMode: mode,
      });

      return `✅ To'lov rejimi yangilandi: ${mode}`;
    },
    setPaymentDays: async ({ reminderDay, collectionDay } = {}) => {
      await ensureBootstrapped();
      const settings = (await paymentSettingsRepository.findDefault()) || {};

      await paymentSettingsRepository.upsertDefault({
        ...settings,
        reminderDayOfMonth: reminderDay,
        collectionDayOfMonth: collectionDay,
      });

      return `✅ To'lov kunlari yangilandi: ${reminderDay} / ${collectionDay}`;
    },
  };
}

function createAccountabilityService({
  ensureBootstrapped,
  userMonthlyDutyStatRepository,
}) {
  return {
    getBadDuties: async ({ monthKey } = {}) => {
      await ensureBootstrapped();
      const resolvedMonth = monthKey || toMonthKey(new Date());
      const offenders = await userMonthlyDutyStatRepository.findOffenders(
        resolvedMonth,
        2,
      );

      if (!offenders.length) {
        return `✅ ${resolvedMonth} oyida badDuty 2+ bo'lgan foydalanuvchi yo'q.`;
      }

      return [
        `⚠️ ${resolvedMonth} oyidagi badDuty ro'yxati:`,
        ...offenders.map(
          (item, index) =>
            `${index + 1}. ${formatUserMention(item.user)} bu oy ${item.badDutyCount} marta vazifani vaqtida topshirmagan.`,
        ),
      ].join("\n");
    },
  };
}

function createSystemService({
  ensureBootstrapped,
  chatSettingsRepository,
  userRepository,
  adminRepository,
  genericDutyService,
  dutyPollService,
  dutyDefinitionRepository,
  dutyPollRepository,
}) {
  return {
    getStatus: async () => {
      await ensureBootstrapped();
      const chat = await chatSettingsRepository.findFirst();
      const users = await userRepository.findAllActive();
      const admins = await adminRepository.findAll();

      return [
        "Bot holati:",
        `- chatId: ${chat?.telegramChatId || "o'rnatilmagan"}`,
        `- foydalanuvchilar: ${users.length}`,
        `- adminlar: ${admins.length}`,
      ].join("\n");
    },
    forceRotate: async ({ dutyCode } = {}) => {
      await ensureBootstrapped();
      const result = await genericDutyService.rotateDutyIfDue({
        dutyCode,
        force: true,
      });

      if (!result.rotated) {
        return `ℹ️ ${dutyCode} uchun majburiy almashuv bajarilmadi (${result.reason}).`;
      }

      return `✅ ${dutyCode} uchun majburiy almashuv bajarildi.`;
    },
    forcePoll: async ({ dutyCode, chatId } = {}) => {
      await ensureBootstrapped();
      const created = await dutyPollService.createPoll({ dutyCode, chatId });
      return `✅ Poll yaratildi: ${created.poll.telegramPollId}`;
    },
    resolvePoll: async ({ dutyCode } = {}) => {
      await ensureBootstrapped();

      const duty = await mustFindDuty(dutyDefinitionRepository, dutyCode);
      const due = await dutyPollRepository.findUnresolvedDue(new Date());
      const target = (due || []).find(
        (poll) => poll.dutyDefinitionId === duty.id,
      );

      if (!target) {
        return `ℹ️ ${dutyCode} uchun yopiladigan poll topilmadi.`;
      }

      const result = await dutyPollService.resolvePollByTelegramPollId(
        target.telegramPollId,
      );
      return `✅ Poll yakunlandi: ${result.decision.result}`;
    },
    reload: async () => {
      await ensureBootstrapped();
      return "✅ Sozlamalar qayta yuklandi.";
    },
  };
}

async function importLegacyState({ db, repositories }) {
  const legacyUsers = Array.isArray(db?.data?.users) ? db.data.users : [];
  const legacyAdmins = Array.isArray(db?.data?.admins) ? db.data.admins : [];
  const legacyChatId = db?.data?.chatId;

  if (legacyChatId != null) {
    await repositories.chatSettingsRepository.upsertByTelegramChatId(
      legacyChatId,
      {
        title: null,
        timezone: "UTC",
        language: "uz",
      },
    );
  }

  for (const legacyUser of legacyUsers) {
    const telegramUserId = resolveTelegramUserId(legacyUser);

    if (telegramUserId == null) {
      continue;
    }

    await ensureUserRecord(repositories.userRepository, {
      id: telegramUserId,
      telegramUserId,
      username: legacyUser.username || legacyUser.first_name || null,
      firstName: legacyUser.firstName || legacyUser.first_name || null,
      lastName: legacyUser.lastName || legacyUser.last_name || null,
      isActive: legacyUser.isActive !== false,
    });
  }

  for (const telegramAdminId of legacyAdmins) {
    const user = await ensureUserRecord(repositories.userRepository, {
      id: telegramAdminId,
      telegramUserId: telegramAdminId,
      isActive: true,
    });

    const existing = await repositories.adminRepository.findByUserId(user.id);

    if (!existing) {
      await repositories.adminRepository.create({ userId: user.id });
    }
  }
}

async function seedInitialData({ repositories }) {
  for (const dutyDef of DEFAULT_DUTIES) {
    const existing = await repositories.dutyDefinitionRepository.findByCode(
      dutyDef.code,
    );

    if (!existing) {
      await repositories.dutyDefinitionRepository.create({
        ...dutyDef,
        isActive: true,
        tieKeepsCurrent: true,
        failureKeepsCurrent: true,
      });
    }
  }

  for (const room of DEFAULT_ROOMS) {
    const existingRoom = await repositories.roomRepository.findByCode(
      room.code,
    );

    if (!existingRoom) {
      await repositories.roomRepository.create({
        code: room.code,
        name: room.name,
        isActive: true,
      });
    }
  }

  const paymentSettings =
    await repositories.paymentSettingsRepository.findDefault();

  if (!paymentSettings) {
    await repositories.paymentSettingsRepository.upsertDefault({
      isActive: true,
      reminderDayOfMonth: 13,
      collectionDayOfMonth: 15,
      paymentMode: "CARD_OR_CASH",
      amountCurrency: "USD",
      note: "Kartaga o'tkazing yoki naqd topshiring.",
    });
  }

  for (const [dutyCode, tasks] of Object.entries(DEFAULT_TASKS_BY_DUTY_CODE)) {
    const duty =
      await repositories.dutyDefinitionRepository.findByCode(dutyCode);

    if (!duty) {
      continue;
    }

    const existingTasks =
      await repositories.dutyTaskRepository.findByDutyDefinitionId(duty.id);

    if ((existingTasks || []).length > 0) {
      continue;
    }

    for (const taskText of tasks) {
      await repositories.dutyTaskRepository.create({
        dutyDefinitionId: duty.id,
        taskText,
      });
    }
  }
}

async function ensureKitchenQueueSeededFromUsers({ repositories, db }) {
  const duty =
    await repositories.dutyDefinitionRepository.findByCode("KITCHEN_TRASH");

  if (!duty) {
    return;
  }

  const queue =
    await repositories.dutyAssignmentQueueRepository.findByDutyDefinitionId(
      duty.id,
    );

  if ((queue || []).length > 0) {
    return;
  }

  const legacyUsers = Array.isArray(db?.data?.users) ? db.data.users : [];
  const currentIndex = Number.isInteger(db?.data?.currentIndex)
    ? db.data.currentIndex
    : 0;
  const rotated = rotateArray(legacyUsers, currentIndex);

  for (let i = 0; i < rotated.length; i += 1) {
    const legacyUser = rotated[i];
    const telegramUserId = resolveTelegramUserId(legacyUser);

    if (telegramUserId == null) {
      continue;
    }

    const user =
      await repositories.userRepository.findByTelegramUserId(telegramUserId);

    if (!user || user.isActive === false) {
      continue;
    }

    await repositories.dutyAssignmentQueueRepository.addQueueMember({
      dutyDefinitionId: duty.id,
      userId: user.id,
      position: i + 1,
      isActive: true,
    });
  }
}

function rotateArray(items, startIndex) {
  const safeItems = Array.isArray(items) ? items : [];

  if (!safeItems.length) {
    return [];
  }

  const index = Math.max(0, Math.min(startIndex, safeItems.length - 1));

  return [...safeItems.slice(index), ...safeItems.slice(0, index)];
}

async function ensureUserRecord(userRepository, userLike) {
  const telegramUserId = resolveTelegramUserId(userLike);

  if (telegramUserId == null) {
    throw new Error("telegramUserId kerak");
  }

  const existing = await userRepository.findByTelegramUserId(telegramUserId);

  if (existing) {
    return userRepository.updateById(existing.id, {
      telegramUserId,
      username:
        userLike.username ?? userLike.userName ?? existing.username ?? null,
      firstName:
        userLike.firstName ?? userLike.first_name ?? existing.firstName ?? null,
      lastName:
        userLike.lastName ?? userLike.last_name ?? existing.lastName ?? null,
      isActive: userLike.isActive ?? existing.isActive ?? true,
    });
  }

  return userRepository.create({
    telegramUserId,
    username: userLike.username ?? userLike.userName ?? null,
    firstName: userLike.firstName ?? userLike.first_name ?? null,
    lastName: userLike.lastName ?? userLike.last_name ?? null,
    isActive: userLike.isActive ?? true,
  });
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

function resolveTelegramUserId(userLike) {
  if (!userLike) {
    return null;
  }

  if (userLike.telegramUserId != null) {
    return Number(userLike.telegramUserId);
  }

  if (userLike.id != null) {
    return Number(userLike.id);
  }

  return null;
}

async function mustFindDuty(dutyDefinitionRepository, code) {
  const duty = await dutyDefinitionRepository.findByCode(code);

  if (!duty) {
    throw new Error(`Duty topilmadi: ${code}`);
  }

  return duty;
}

async function findDutyByTypeOrCode(
  dutyDefinitionRepository,
  dutyTypeEnumOrCode,
) {
  if (!dutyTypeEnumOrCode) {
    return null;
  }

  const code = String(dutyTypeEnumOrCode);
  const byCode = await dutyDefinitionRepository.findByCode(code);

  if (byCode) {
    return byCode;
  }

  const all = await dutyDefinitionRepository.findAll();
  return (all || []).find((item) => item.builtinType === code) || null;
}

function parseDutyCreateInput(rawInput) {
  const input = String(rawInput || "").trim();

  if (!input) {
    throw new Error(
      "dutycreate formati: CODE|NAME|CATEGORY|ASSIGNMENT_MODE (masalan: TEST|Test navbat|ROTATION|SINGLE)",
    );
  }

  if (input.startsWith("{")) {
    const parsed = JSON.parse(input);
    return {
      code: String(parsed.code || "").trim(),
      builtinType: parsed.builtinType ?? null,
      name: String(parsed.name || "").trim(),
      description: parsed.description ?? null,
      category: parsed.category,
      assignmentMode: parsed.assignmentMode,
      rotationIntervalHours: parsed.rotationIntervalHours ?? null,
      rotationIntervalDays: parsed.rotationIntervalDays ?? null,
      scheduleCron: parsed.scheduleCron ?? null,
      requiresPoll: Boolean(parsed.requiresPoll),
      pollLeadHours: parsed.pollLeadHours ?? null,
      pollDurationMinutes: parsed.pollDurationMinutes ?? null,
      isActive: parsed.isActive ?? true,
      tieKeepsCurrent: parsed.tieKeepsCurrent ?? true,
      failureKeepsCurrent: parsed.failureKeepsCurrent ?? true,
    };
  }

  const parts = input.split("|").map((part) => part.trim());

  if (parts.length < 4) {
    throw new Error("dutycreate formati: CODE|NAME|CATEGORY|ASSIGNMENT_MODE");
  }

  return {
    code: parts[0],
    builtinType: null,
    name: parts[1],
    description: null,
    category: parts[2],
    assignmentMode: parts[3],
    rotationIntervalHours: null,
    rotationIntervalDays: null,
    scheduleCron: null,
    requiresPoll: false,
    pollLeadHours: null,
    pollDurationMinutes: null,
    isActive: true,
    tieKeepsCurrent: true,
    failureKeepsCurrent: true,
  };
}

function parseIntervalInput(intervalInput) {
  const value = String(intervalInput || "")
    .trim()
    .toLowerCase();

  if (!value) {
    throw new Error("interval qiymati kerak (masalan: 48h yoki 2d)");
  }

  const hoursMatch = value.match(/^(\d+)h$/);
  if (hoursMatch) {
    return { hours: Number(hoursMatch[1]), days: null };
  }

  const daysMatch = value.match(/^(\d+)d$/);
  if (daysMatch) {
    return { hours: null, days: Number(daysMatch[1]) };
  }

  throw new Error(
    "interval formati noto'g'ri. 48h yoki 2d ko'rinishida yuboring",
  );
}

async function setDutyActiveState(dutyDefinitionRepository, code, isActive) {
  const duty = await mustFindDuty(dutyDefinitionRepository, code);

  await dutyDefinitionRepository.updateById(duty.id, {
    ...duty,
    isActive,
  });

  return `✅ ${code} ${isActive ? "yoqildi" : "o'chirildi"}.`;
}

async function normalizeQueuePositions(
  dutyAssignmentQueueRepository,
  dutyDefinitionId,
) {
  const queue =
    await dutyAssignmentQueueRepository.findByDutyDefinitionId(
      dutyDefinitionId,
    );
  const active = (queue || [])
    .filter((item) => item.isActive !== false)
    .sort((a, b) => a.position - b.position);

  for (let i = 0; i < active.length; i += 1) {
    const expectedPosition = i + 1;

    if (active[i].position !== expectedPosition) {
      await dutyAssignmentQueueRepository.updatePosition(
        active[i].id,
        expectedPosition,
      );
    }
  }
}

function formatAdminList(admins) {
  if (!admins.length) {
    return "Hali adminlar yo'q.";
  }

  return [
    "📋 Adminlar:",
    ...admins.map((item, index) => {
      const label = item.user
        ? formatUserMention(item.user)
        : `user:${item.userId}`;
      return `${index + 1}. ${label} (ID: ${item.userId})`;
    }),
  ].join("\n");
}

function formatUserList(users) {
  if (!users.length) {
    return "Hali foydalanuvchilar ro'yxati bo'sh.";
  }

  return [
    "📋 Foydalanuvchilar:",
    ...users.map(
      (user, index) =>
        `${index + 1}. ${formatUserMention(user)} (ID: ${user.id}, TG: ${user.telegramUserId})`,
    ),
  ].join("\n");
}

function formatUserMention(user) {
  if (!user) {
    return "Noma'lum";
  }

  if (user.username) {
    return `@${user.username}`;
  }

  if (user.firstName || user.lastName) {
    return `${user.firstName || ""} ${user.lastName || ""}`.trim();
  }

  return String(user.id || user.telegramUserId || "Noma'lum");
}

function formatUserLabel(user) {
  return user.username || user.firstName || user.lastName || user.id;
}

function formatDateTime(value) {
  if (!value) {
    return "noma'lum";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "noma'lum";
  }

  return date.toISOString().replace("T", " ").slice(0, 16);
}

function toMonthKey(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

module.exports = {
  createStartupServiceContainer,
};
