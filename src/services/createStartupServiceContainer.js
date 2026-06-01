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
    description: "Har 48 soatda oshxona va chiqindi navbatchiligi.",
    category: "ROTATION",
    assignmentMode: "SINGLE",
    rotationIntervalHours: 48,
    rotationIntervalDays: null,
    scheduleCron: null,
    requiresPoll: true,
    pollLeadHours: 2,
    pollDurationMinutes: 120,
  },
  {
    code: "BATHROOM_TOILET",
    builtinType: "BATHROOM_TOILET",
    name: "Hammom va hojatxona",
    description: "Har 14 kunda hammom va hojatxona navbatchiligi.",
    category: "ROTATION",
    assignmentMode: "PAIR",
    rotationIntervalHours: null,
    rotationIntervalDays: 14,
    scheduleCron: null,
    requiresPoll: true,
    pollLeadHours: 3,
    pollDurationMinutes: 180,
  },
  {
    code: "ROOM_CLEANING",
    builtinType: "ROOM_CLEANING",
    name: "Xona tozalash",
    description: "Shanba va yakshanba kunlari xonalarni tozalash eslatmasi.",
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
    description: "13-kun eslatma, 15-kun to'lov yig'ish.",
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

const DUTY_TASK_SEED = {
  KITCHEN_TRASH: ["Oshxonani tozalash", "Chiqindini olib chiqish"],
  BATHROOM_TOILET: ["Hammomni tozalash", "Hojatxonani tozalash"],
  ROOM_CLEANING: ["Polni artish", "Changni artish"],
};

const ROOM_SEED = [
  { code: "room1", name: "Xona 1" },
  { code: "room2", name: "Xona 2" },
  { code: "room3", name: "Xona 3" },
  { code: "room4", name: "Xona 4" },
];

function createStartupServiceContainer({ bot, db }) {
  const prisma = getPrismaClient();
  const repositories = createRepositories(prisma);

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
      const payload = { is_anonymous: true };

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

  const kitchenDomainService = createKitchenDutyService({
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
    userRepository: repositories.userRepository,
  });

  const bathroomDomainService = createBathroomDutyService({
    genericDutyService,
    dutyPollService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository:
      repositories.dutyAssignmentGroupMemberRepository,
    userRepository: repositories.userRepository,
  });

  const roomDomainService = createRoomService({
    roomRepository: repositories.roomRepository,
    roomMemberRepository: repositories.roomMemberRepository,
    userRepository: repositories.userRepository,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
    notifier,
  });

  const paymentDomainService = createPaymentService({
    paymentSettingsRepository: repositories.paymentSettingsRepository,
    paymentMonthAmountRepository: repositories.paymentMonthAmountRepository,
    userRepository: repositories.userRepository,
    notifier,
  });

  const bootstrapState = { promise: null };

  const ensureBootstrapped = async () => {
    if (!bootstrapState.promise) {
      bootstrapState.promise = bootstrap({ db, repositories });
    }

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

  const onDutyService = createOnDutyService({
    ensureBootstrapped,
    kitchenDomainService,
    bathroomDomainService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
  });

  const kitchenDutyService = createKitchenCommandFacade({
    ensureBootstrapped,
    kitchenDomainService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyAssignmentQueueRepository: repositories.dutyAssignmentQueueRepository,
    dutyRuntimeStateRepository: repositories.dutyRuntimeStateRepository,
    userRepository: repositories.userRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
  });

  const bathroomDutyService = createBathroomCommandFacade({
    ensureBootstrapped,
    bathroomDomainService,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    dutyAssignmentGroupRepository: repositories.dutyAssignmentGroupRepository,
    dutyAssignmentGroupMemberRepository:
      repositories.dutyAssignmentGroupMemberRepository,
    userRepository: repositories.userRepository,
    dutyTaskRepository: repositories.dutyTaskRepository,
  });

  const roomService = createRoomCommandFacade({
    ensureBootstrapped,
    roomDomainService,
    roomMemberRepository: repositories.roomMemberRepository,
  });

  const paymentService = createPaymentCommandFacade({
    ensureBootstrapped,
    prisma,
    paymentDomainService,
    paymentSettingsRepository: repositories.paymentSettingsRepository,
    userRepository: repositories.userRepository,
  });

  const accountabilityService = createAccountabilityService({
    ensureBootstrapped,
    userMonthlyDutyStatRepository: repositories.userMonthlyDutyStatRepository,
  });

  const systemService = createSystemService({
    ensureBootstrapped,
    prisma,
    chatSettingsRepository: repositories.chatSettingsRepository,
    userRepository: repositories.userRepository,
    adminRepository: repositories.adminRepository,
    dutyDefinitionRepository: repositories.dutyDefinitionRepository,
    genericDutyService,
    dutyPollService,
  });

  const authService = {
    ensureAdmin: async ({ userId } = {}) => {
      const isAdmin = await userAdminService.isAdmin(userId);

      if (!isAdmin) {
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
    onDutyService,
    paymentService,
    roomService,
    systemService,
    userAdminService,
    bot,
  };
}

function createRepositories(prisma) {
  return {
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
}

async function bootstrap({ db, repositories }) {
  await importLegacyState(db, repositories);
  await seedInitialData(repositories);
  await seedKitchenQueueFromUsers(db, repositories);
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
        const savedUser = await ensureUserRecord(userRepository, user);
        const admins = await adminRepository.findAll();

        if (!admins.length) {
          await adminRepository.create({ userId: savedUser.id });
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

      // Must be a reply to another user's message — we intentionally do NOT
      // fall back to message.from so admins can't accidentally add themselves.
      const targetFrom = message?.reply_to_message?.from;

      if (!targetFrom) {
        return "ℹ️ Foydalanuvchi qo'shish uchun biror xabarga reply qiling va /adduser yuboring.";
      }

      if (targetFrom.is_bot) {
        return "❌ Botni foydalanuvchi sifatida qo'shib bo'lmaydi.";
      }

      const telegramUserId = targetFrom.id;
      const existing =
        await userRepository.findByTelegramUserId(telegramUserId);

      if (existing && existing.isActive) {
        return `ℹ️ ${formatUserMention(existing)} allaqachon foydalanuvchilar ro'yxatida bor.`;
      }

      // Create new or reactivate soft-deleted user
      const savedUser = await ensureUserRecord(userRepository, {
        ...targetFrom,
        isActive: true,
      });

      if (existing && !existing.isActive) {
        return `✅ ${formatUserMention(savedUser)} ro'yxatga qaytarildi.`;
      }

      return `✅ ${formatUserMention(savedUser)} foydalanuvchilar ro'yxatiga qo'shildi.`;
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

      return `🗑 ${formatUserMention(user)} faol ro'yxatdan chiqarildi.`;
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
          (duty, index) =>
            `${index + 1}. ${duty.code} | ${duty.name} | ${duty.isActive ? "faol" : "faol emas"}`,
        ),
      ].join("\n");
    },
    getDuty: async ({ code } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode(code);

      if (!duty) {
        return `❌ Navbatchilik topilmadi: ${code}`;
      }

      const tasks = await dutyTaskRepository.findByDutyDefinitionId(duty.id);

      return [
        `Kod: ${duty.code}`,
        `Nomi: ${duty.name}`,
        `Kategoriya: ${duty.category}`,
        `Rejim: ${duty.assignmentMode}`,
        `Holat: ${duty.isActive ? "faol" : "faol emas"}`,
        `Vazifalar soni: ${tasks.filter((item) => item.isActive !== false).length}`,
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
    enableDuty: async ({ code } = {}) =>
      toggleDutyActive({
        ensureBootstrapped,
        dutyDefinitionRepository,
        code,
        isActive: true,
      }),
    disableDuty: async ({ code } = {}) =>
      toggleDutyActive({
        ensureBootstrapped,
        dutyDefinitionRepository,
        code,
        isActive: false,
      }),
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
        scheduleCron: String(cron || "").trim() || null,
      });

      return `✅ ${code} uchun cron yangilandi.`;
    },
    addTask: async ({ taskText, dutyTypeEnum, actorUserId } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByCodeOrType(
        dutyDefinitionRepository,
        dutyTypeEnum,
      );

      if (!duty) {
        return `❌ Duty topilmadi: ${dutyTypeEnum}`;
      }

      await dutyTaskRepository.create({
        dutyDefinitionId: duty.id,
        taskText,
        createdByUserId: actorUserId ?? null,
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
      const duty = await findDutyByCodeOrType(
        dutyDefinitionRepository,
        dutyTypeEnum,
      );

      if (!duty) {
        return `❌ Duty topilmadi: ${dutyTypeEnum}`;
      }

      const tasks = (
        await dutyTaskRepository.findByDutyDefinitionId(duty.id)
      ).filter((item) => item.isActive !== false);

      if (!tasks.length) {
        return `${duty.code} uchun vazifalar yo'q.`;
      }

      return [
        `📌 ${duty.code} vazifalari:`,
        ...tasks.map((task) => `${task.id}. ${task.taskText}`),
      ].join("\n");
    },
    clearTasks: async ({ dutyTypeEnum } = {}) => {
      await ensureBootstrapped();
      const duty = await findDutyByCodeOrType(
        dutyDefinitionRepository,
        dutyTypeEnum,
      );

      if (!duty) {
        return `❌ Duty topilmadi: ${dutyTypeEnum}`;
      }

      const result = await dutyTaskRepository.clearByDutyDefinitionId(duty.id);
      return `🧹 ${duty.code} uchun ${result.count || 0} ta vazifa o'chirildi.`;
    },
  };
}

function createKitchenCommandFacade({
  ensureBootstrapped,
  kitchenDomainService,
  dutyDefinitionRepository,
  dutyAssignmentQueueRepository,
  dutyRuntimeStateRepository,
  userRepository,
  dutyTaskRepository,
}) {
  return {
    getCurrentAssignee: async () => {
      await ensureBootstrapped();
      const result = await kitchenDomainService.getCurrentAssignee();

      if (!result.assignee) {
        return "Hozircha oshxona navbatchilari yo'q.";
      }

      return [
        "🍽 Oshxona navbatchiligi:",
        `Joriy: ${formatUserMention(result.assignee)}`,
        `Keyingi almashtirish: ${formatDateTime(result.nextRotationAt)}`,
      ].join("\n");
    },
    getKitchenQueue: async () => {
      await ensureBootstrapped();
      const queue = await kitchenDomainService.getKitchenQueue();

      if (!queue.length) {
        return "Oshxona navbati bo'sh.";
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
      const duty = await dutyDefinitionRepository.findByCode("KITCHEN_TRASH");
      const user = await userRepository.findById(userId);

      if (!duty) {
        return "❌ KITCHEN_TRASH navbatchiligi topilmadi.";
      }

      if (!user || user.isActive === false) {
        return `❌ Faol foydalanuvchi topilmadi: ${userId}`;
      }

      const queue = await dutyAssignmentQueueRepository.findByDutyDefinitionId(
        duty.id,
      );
      const activeQueue = queue.filter((item) => item.isActive !== false);

      if (activeQueue.some((item) => item.userId === user.id)) {
        return "ℹ️ Bu foydalanuvchi allaqachon oshxona navbatida.";
      }

      await dutyAssignmentQueueRepository.addQueueMember({
        dutyDefinitionId: duty.id,
        userId: user.id,
        position: activeQueue.length + 1,
        isActive: true,
      });

      return `✅ ${formatUserMention(user)} oshxona navbatiga qo'shildi.`;
    },
    removeQueueMember: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode("KITCHEN_TRASH");

      if (!duty) {
        return "❌ KITCHEN_TRASH navbatchiligi topilmadi.";
      }

      await dutyAssignmentQueueRepository.removeQueueMember(duty.id, userId);
      await normalizeKitchenQueue(dutyAssignmentQueueRepository, duty.id);

      return `🗑 ${userId} oshxona navbatidan o'chirildi.`;
    },
    rotateIfDue: async ({ force = false } = {}) => {
      await ensureBootstrapped();
      const result = await kitchenDomainService.rotateIfDue({ force });

      if (!result.rotated) {
        return result.reason === "NOT_DUE"
          ? "Hali almashtirish vaqti kelmadi."
          : "Oshxona navbati almashtirilmadi.";
      }

      const lines = [
        `✅ Yangi oshxona navbatchisi: ${formatUserMention(result.currentAssignee)}`,
      ];

      const tasks = await loadTasksForCode(
        dutyDefinitionRepository,
        dutyTaskRepository,
        "KITCHEN_TRASH",
      );

      if (tasks.length) {
        lines.push("");
        lines.push("📌 Vazifalar:");
        tasks.forEach((task, i) => lines.push(`  ${i + 1}. ${task.taskText}`));
      }

      return lines.join("\n");
    },
    swapCurrentWithNext: async () => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode("KITCHEN_TRASH");

      if (!duty) {
        return "❌ KITCHEN_TRASH navbatchiligi topilmadi.";
      }

      const queue = (
        await dutyAssignmentQueueRepository.findByDutyDefinitionId(duty.id)
      )
        .filter((item) => item.isActive !== false)
        .sort((a, b) => a.position - b.position);

      if (queue.length < 2) {
        return "Almashtirish uchun kamida 2 ta foydalanuvchi kerak.";
      }

      const runtime = await dutyRuntimeStateRepository.findByDutyDefinitionId(
        duty.id,
      );
      const currentPosition =
        runtime?.currentQueuePosition ?? queue[0].position;
      const currentIndex = Math.max(
        queue.findIndex((item) => item.position === currentPosition),
        0,
      );
      const nextIndex = (currentIndex + 1) % queue.length;
      const current = queue[currentIndex];
      const next = queue[nextIndex];
      const tempPosition = 999999;

      await dutyAssignmentQueueRepository.updatePosition(
        current.id,
        tempPosition,
      );
      await dutyAssignmentQueueRepository.updatePosition(
        next.id,
        current.position,
      );
      await dutyAssignmentQueueRepository.updatePosition(
        current.id,
        next.position,
      );

      return "🔁 Joriy va keyingi oshxona navbatchisi joyi almashtirildi.";
    },
  };
}

function createBathroomCommandFacade({
  ensureBootstrapped,
  bathroomDomainService,
  dutyDefinitionRepository,
  dutyAssignmentGroupRepository,
  dutyAssignmentGroupMemberRepository,
  userRepository,
  dutyTaskRepository,
}) {
  return {
    getCurrentPair: async () => {
      await ensureBootstrapped();
      const result = await bathroomDomainService.getCurrentPair();
      const assignees = result.currentPair?.assignees || [];

      if (!assignees.length) {
        return "Hozircha hammom navbatchi juftligi yo'q.";
      }

      return [
        "🚿 Hammom navbatchiligi:",
        `Joriy juftlik: ${assignees.map((user) => `${formatUserMention(user)}`).join(" va ")}`,
        `Keyingi almashtirish: ${formatDateTime(result.nextRotationAt)}`,
      ].join("\n");
    },
    listPairs: async () => {
      await ensureBootstrapped();
      const result = await bathroomDomainService.listPairs();

      if (!result.groups.length) {
        return "Hammom juftliklari hali kiritilmagan.";
      }

      return [
        "📋 Hammom juftliklari:",
        ...result.groups.map((group) => {
          const members = group.members
            .map((member) => `${formatUserMention(member.user)}`)
            .join(" + ");
          return `${group.position}. ${members || "(bo'sh)"}`;
        }),
      ].join("\n");
    },
    addPoolUser: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode("BATHROOM_TOILET");
      const user = await userRepository.findById(userId);

      if (!duty) {
        return "❌ BATHROOM_TOILET navbatchiligi topilmadi.";
      }

      if (!user || user.isActive === false) {
        return `❌ Faol foydalanuvchi topilmadi: ${userId}`;
      }

      const groups = (
        await dutyAssignmentGroupRepository.findByDutyDefinitionId(duty.id)
      )
        .filter((group) => group.isActive !== false)
        .sort((a, b) => a.position - b.position);

      let targetGroup = null;

      for (const group of groups) {
        const members = await dutyAssignmentGroupMemberRepository.findByGroupId(
          group.id,
        );

        if ((members || []).length === 1) {
          targetGroup = group;
          break;
        }
      }

      if (targetGroup) {
        await dutyAssignmentGroupMemberRepository.addMember({
          groupId: targetGroup.id,
          userId: user.id,
        });
      } else {
        const group = await dutyAssignmentGroupRepository.create({
          dutyDefinitionId: duty.id,
          name: `Bathroom Pair ${groups.length + 1}`,
          position: groups.length + 1,
          isActive: true,
        });

        await dutyAssignmentGroupMemberRepository.addMember({
          groupId: group.id,
          userId: user.id,
        });
      }

      return `✅ ${formatUserMention(user)} hammom navbati ro'yxatiga qo'shildi.`;
    },
    removePoolUser: async ({ userId } = {}) => {
      await ensureBootstrapped();
      const duty = await dutyDefinitionRepository.findByCode("BATHROOM_TOILET");

      if (!duty) {
        return "❌ BATHROOM_TOILET navbatchiligi topilmadi.";
      }

      const groups = await dutyAssignmentGroupRepository.findByDutyDefinitionId(
        duty.id,
      );

      for (const group of groups) {
        await dutyAssignmentGroupMemberRepository.removeMember(
          group.id,
          userId,
        );
        const members = await dutyAssignmentGroupMemberRepository.findByGroupId(
          group.id,
        );

        if (!members.length && group.isActive !== false) {
          await dutyAssignmentGroupRepository.updateById(group.id, {
            name: group.name,
            position: group.position,
            isActive: false,
          });
        }
      }

      await normalizeBathroomGroups(
        dutyAssignmentGroupRepository,
        dutyDefinitionRepository,
        duty.id,
      );

      return `🗑 ${userId} hammom ro'yxatidan chiqarildi.`;
    },
    upsertPair: async ({ userId1, userId2 } = {}) => {
      await ensureBootstrapped();
      const result = await bathroomDomainService.upsertPair({
        userId1,
        userId2,
      });
      const members = result.members.map(
        (member) => `${formatUserMention(member.user)}`,
      );
      return `✅ Juftlik saqlandi: ${members.join(" va ")}`;
    },
    rotatePairIfDue: async ({ force = false } = {}) => {
      await ensureBootstrapped();
      const result = await bathroomDomainService.rotatePairIfDue({ force });

      if (!result.rotated) {
        return result.reason === "NOT_DUE"
          ? "Hali hammom juftligini almashtirish vaqti kelmadi."
          : "Hammom juftligi almashtirilmadi.";
      }

      const names = (result.currentAssignment?.assignees || [])
        .map((user) => `${formatUserMention(user)}`)
        .join(" va ");

      const lines = [`✅ Yangi hammom juftligi: ${names || "(noma'lum)"}`];

      const tasks = await loadTasksForCode(
        dutyDefinitionRepository,
        dutyTaskRepository,
        "BATHROOM_TOILET",
      );

      if (tasks.length) {
        lines.push("");
        lines.push("📌 Vazifalar:");
        tasks.forEach((task, i) => lines.push(`  ${i + 1}. ${task.taskText}`));
      }

      return lines.join("\n");
    },
  };
}

function createRoomCommandFacade({
  ensureBootstrapped,
  roomDomainService,
  roomMemberRepository,
}) {
  return {
    listOwners: async ({ roomCode } = {}) => {
      await ensureBootstrapped();
      const data = await roomDomainService.listOwners(roomCode);

      if (!data.rooms.length) {
        return "Hozircha xonalar mavjud emas.";
      }

      return [
        "🏠 Xonalar:",
        ...data.rooms.map((room) => {
          const owners = room.owners
            .map((owner) => `${formatUserMention(owner.user)}`)
            .join(" ");
          return `- ${room.code}: ${owners || "egalar biriktirilmagan"}`;
        }),
      ].join("\n");
    },
    createRoom: async ({ code, name } = {}) => {
      await ensureBootstrapped();
      const room = await roomDomainService.createRoom({ code, name });
      return `✅ Xona yaratildi: ${room.code}`;
    },
    deleteRoom: async ({ roomCode } = {}) => {
      await ensureBootstrapped();
      await roomDomainService.deleteRoom(roomCode);
      return `🗑 Xona o'chirildi: ${roomCode}`;
    },
    moveUser: async ({ userId, roomCode } = {}) => {
      await ensureBootstrapped();
      await roomDomainService.moveUser({ userId, roomCode, isOwner: true });
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
  paymentDomainService,
  paymentSettingsRepository,
  userRepository,
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
        `- karta: ${settings.cardNumberMasked || "kiritilmagan"}`,
        `- naqd izoh: ${settings.cashInstruction || settings.note || "yo'q"}`,
      ].join("\n");
    },
    setMonthAmount: async (payload = {}) => {
      await ensureBootstrapped();

      // payload.setByUserId comes in as a Telegram user ID (from msg.from.id).
      // Resolve it to the internal DB row id to satisfy the FK constraint,
      // falling back to null if the user is not yet in the database.
      let resolvedSetByUserId = null;

      if (payload.setByUserId != null) {
        const user = await userRepository.findByTelegramUserId(
          payload.setByUserId,
        );
        resolvedSetByUserId = user ? user.id : null;
      }

      const record = await paymentDomainService.setMonthAmount({
        ...payload,
        setByUserId: resolvedSetByUserId,
      });
      return `✅ Oy summasi saqlandi: ${record.perPersonAmount} ${record.currency} (${record.monthKey})`;
    },
    getCurrentAmount: async () => {
      await ensureBootstrapped();

      try {
        const result = await paymentDomainService.getCurrentAmount();
        return `💰 Joriy summa: ${result.record.perPersonAmount} ${result.record.currency} (${result.record.monthKey})`;
      } catch (_error) {
        return "ℹ️ Hali joriy oy uchun summa kiritilmagan.";
      }
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
        cardHolderName: holderName || null,
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
          (item, index) =>
            `${index + 1}. ${formatUserMention(item.user)} bu oy ${item.badDutyCount} marta vazifani vaqtida topshirmagan.`,
        ),
      ].join("\n");
    },
  };
}

function createOnDutyService({
  ensureBootstrapped,
  kitchenDomainService,
  bathroomDomainService,
  dutyDefinitionRepository,
  dutyTaskRepository,
}) {
  return {
    getOnDuty: async () => {
      await ensureBootstrapped();

      const [kitchenResult, bathroomResult, kitchenTasks, bathroomTasks] =
        await Promise.all([
          kitchenDomainService.getCurrentAssignee().catch(() => null),
          bathroomDomainService.getCurrentPair().catch(() => null),
          loadTasksForCode(
            dutyDefinitionRepository,
            dutyTaskRepository,
            "KITCHEN_TRASH",
          ).catch(() => []),
          loadTasksForCode(
            dutyDefinitionRepository,
            dutyTaskRepository,
            "BATHROOM_TOILET",
          ).catch(() => []),
        ]);

      const lines = ["📋 Hozirgi navbatchiligi:"];

      // Kitchen section
      lines.push("");
      lines.push("🍽 Oshxona va chiqindi:");

      if (kitchenResult?.assignee) {
        lines.push(`  Navbatchi: ${formatUserMention(kitchenResult.assignee)}`);
        lines.push(
          `  Almashtirish: ${formatDateTime(kitchenResult.nextRotationAt)}`,
        );

        if (kitchenTasks.length) {
          lines.push("  Vazifalar:");
          kitchenTasks.forEach((task, i) =>
            lines.push(`    ${i + 1}. ${task.taskText}`),
          );
        }
      } else {
        lines.push("  Hozircha navbatchi yo'q.");
      }

      // Bathroom section
      lines.push("");
      lines.push("🚿 Hammom va hojatxona:");

      const assignees = bathroomResult?.currentPair?.assignees || [];

      if (assignees.length) {
        const names = assignees
          .map((user) => `${formatUserMention(user)}`)
          .join(" va ");
        lines.push(`  Juftlik: ${names}`);
        lines.push(
          `  Almashtirish: ${formatDateTime(bathroomResult.nextRotationAt)}`,
        );

        if (bathroomTasks.length) {
          lines.push("  Vazifalar:");
          bathroomTasks.forEach((task, i) =>
            lines.push(`    ${i + 1}. ${task.taskText}`),
          );
        }
      } else {
        lines.push("  Hozircha juftlik yo'q.");
      }

      return lines.join("\n");
    },
  };
}

function createSystemService({
  ensureBootstrapped,
  prisma,
  chatSettingsRepository,
  userRepository,
  adminRepository,
  dutyDefinitionRepository,
  genericDutyService,
  dutyPollService,
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
      const duty = await dutyDefinitionRepository.findByCode(dutyCode);

      if (!duty) {
        return `❌ Duty topilmadi: ${dutyCode}`;
      }

      const poll = await prisma.dutyPoll.findFirst({
        where: {
          dutyDefinitionId: duty.id,
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
      return "✅ Sozlamalar yangilandi.";
    },
  };
}

async function importLegacyState(db, repositories) {
  if (!db?.data) {
    return;
  }

  const users = Array.isArray(db.data.users) ? db.data.users : [];
  const admins = Array.isArray(db.data.admins) ? db.data.admins : [];
  const chatId = db.data.chatId;

  if (chatId != null) {
    await repositories.chatSettingsRepository.upsertByTelegramChatId(chatId, {
      timezone: "UTC",
      language: "uz",
    });
  }

  for (const user of users) {
    await ensureUserRecord(repositories.userRepository, {
      id: user.id,
      username: user.username ?? null,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      isActive: true,
    });
  }

  for (const adminTelegramId of admins) {
    const savedUser = await ensureUserRecord(repositories.userRepository, {
      id: adminTelegramId,
      isActive: true,
    });

    const existing = await repositories.adminRepository.findByUserId(
      savedUser.id,
    );

    if (!existing) {
      await repositories.adminRepository.create({ userId: savedUser.id });
    }
  }
}

async function seedInitialData(repositories) {
  for (const dutySeed of DUTY_DEFINITION_SEED) {
    const existing = await repositories.dutyDefinitionRepository.findByCode(
      dutySeed.code,
    );

    if (!existing) {
      await repositories.dutyDefinitionRepository.create({
        ...dutySeed,
        isActive: true,
        tieKeepsCurrent: true,
        failureKeepsCurrent: true,
      });
    }
  }

  for (const roomSeed of ROOM_SEED) {
    const existing = await repositories.roomRepository.findByCode(
      roomSeed.code,
    );

    if (!existing) {
      await repositories.roomRepository.create({
        code: roomSeed.code,
        name: roomSeed.name,
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

  for (const [code, tasks] of Object.entries(DUTY_TASK_SEED)) {
    const duty = await repositories.dutyDefinitionRepository.findByCode(code);

    if (!duty) {
      continue;
    }

    const existingTasks =
      await repositories.dutyTaskRepository.findByDutyDefinitionId(duty.id);

    if (existingTasks.length > 0) {
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

async function seedKitchenQueueFromUsers(db, repositories) {
  const duty =
    await repositories.dutyDefinitionRepository.findByCode("KITCHEN_TRASH");

  if (!duty) {
    return;
  }

  const queue =
    await repositories.dutyAssignmentQueueRepository.findByDutyDefinitionId(
      duty.id,
    );

  if (queue.some((item) => item.isActive !== false)) {
    return;
  }

  const users = await repositories.userRepository.findAllActive();

  if (!users.length) {
    return;
  }

  const legacyUsers = Array.isArray(db?.data?.users) ? db.data.users : [];
  const currentIndex = Number.isInteger(db?.data?.currentIndex)
    ? db.data.currentIndex
    : 0;
  const orderedLegacyTelegramIds = rotateLegacyUsers(
    legacyUsers,
    currentIndex,
  ).map((item) => Number(item.id));
  const usersByTelegramId = new Map(
    users.map((user) => [Number(user.telegramUserId), user]),
  );
  const orderedUsers = [];

  for (const telegramId of orderedLegacyTelegramIds) {
    const user = usersByTelegramId.get(telegramId);

    if (user) {
      orderedUsers.push(user);
      usersByTelegramId.delete(telegramId);
    }
  }

  for (const user of usersByTelegramId.values()) {
    orderedUsers.push(user);
  }

  for (let index = 0; index < orderedUsers.length; index += 1) {
    await repositories.dutyAssignmentQueueRepository.addQueueMember({
      dutyDefinitionId: duty.id,
      userId: orderedUsers[index].id,
      position: index + 1,
      isActive: true,
    });
  }
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

async function findDutyByCodeOrType(dutyDefinitionRepository, value) {
  if (!value) {
    return null;
  }

  const byCode = await dutyDefinitionRepository.findByCode(String(value));

  if (byCode) {
    return byCode;
  }

  const all = await dutyDefinitionRepository.findAll();
  return all.find((item) => item.builtinType === value) || null;
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

async function normalizeKitchenQueue(queueRepository, dutyDefinitionId) {
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

async function normalizeBathroomGroups(
  groupRepository,
  _dutyDefinitionRepository,
  dutyDefinitionId,
) {
  const groups = (
    await groupRepository.findByDutyDefinitionId(dutyDefinitionId)
  )
    .filter((item) => item.isActive !== false)
    .sort((a, b) => a.position - b.position);

  for (let index = 0; index < groups.length; index += 1) {
    const expected = index + 1;

    if (groups[index].position !== expected) {
      await groupRepository.updateById(groups[index].id, {
        name: groups[index].name,
        position: expected,
        isActive: groups[index].isActive,
      });
    }
  }
}

async function loadTasksForCode(
  dutyDefinitionRepository,
  dutyTaskRepository,
  code,
) {
  if (!dutyDefinitionRepository || !dutyTaskRepository) return [];
  const duty = await dutyDefinitionRepository.findByCode(code);
  if (!duty) return [];
  const tasks = await dutyTaskRepository.findByDutyDefinitionId(duty.id);
  return (tasks || []).filter((t) => t.isActive !== false);
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

  const parts = text.split("|").map((item) => item.trim());

  if (parts.length < 4) {
    throw new Error("Format: /dutycreate CODE|NOMI|CATEGORY|ASSIGNMENT_MODE");
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

function parseInterval(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  const hoursMatch = text.match(/^(\d+)h$/);
  const daysMatch = text.match(/^(\d+)d$/);

  if (hoursMatch) {
    return { hours: Number(hoursMatch[1]), days: null };
  }

  if (daysMatch) {
    return { hours: null, days: Number(daysMatch[1]) };
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
        ? `${formatUserMention(admin.user)}`
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
        `${index + 1}. ${formatUserMention(user)} (ID: ${user.id})`,
    ),
  ].join("\n");
}

function formatUserMention(user) {
  const username = normalizeTelegramUsername(user?.username);

  if (username) {
    return `@${username}`;
  }

  return formatUserLabel(user);
}

function formatUserLabel(user) {
  if (!user) {
    return "noma'lum";
  }

  const fullName = [
    user.firstName || user.first_name,
    user.lastName || user.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  const rawUsername =
    typeof user.username === "string" ? user.username.trim() : "";

  if (rawUsername) {
    return rawUsername;
  }

  const telegramUserId = resolveTelegramUserId(user);
  if (telegramUserId != null) {
    return `user:${telegramUserId}`;
  }

  return "noma'lum";
}

function normalizeTelegramUsername(username) {
  if (typeof username !== "string") {
    return "";
  }

  const value = username.trim();

  if (!/^[A-Za-z0-9_]{5,32}$/.test(value)) {
    return "";
  }

  return value;
}

function rotateLegacyUsers(users, currentIndex) {
  if (!Array.isArray(users) || users.length === 0) {
    return [];
  }

  const safeIndex =
    Number.isInteger(currentIndex) && currentIndex >= 0
      ? currentIndex % users.length
      : 0;

  return [...users.slice(safeIndex), ...users.slice(0, safeIndex)];
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
