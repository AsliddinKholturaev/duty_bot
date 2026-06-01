const { COMMAND_CATALOG, COMMAND_PERMISSION } = require("./commandCatalog");

function registerCommands({
  bot,
  services = {},
  dutyService,
  logger = console,
}) {
  if (!bot) {
    throw new Error("registerCommands requires bot");
  }

  const serviceRegistry = { ...services };

  if (dutyService && !serviceRegistry.dutyService) {
    serviceRegistry.dutyService = dutyService;
  }

  const context = { bot, services: serviceRegistry, logger };

  registerTelegramCommands(bot, logger);

  registerGeneralCommands(context);
  registerUserAdminCommands(context);
  registerDutyDefinitionCommands(context);
  registerKitchenCommands(context);
  registerBathroomCommands(context);
  registerRoomCommands(context);
  registerPaymentCommands(context);
  registerDebugCommands(context);
  registerAccountabilityCommands(context);
}

function registerGeneralCommands({ bot, services }) {
  register(bot, /\/start(?:\s+|$)/, async (msg) => {
    await invoke(services.lifecycleService, "start", {
      chatId: msg.chat.id,
      user: msg.from,
    });

    return "Bot ishga tushdi.";
  });

  register(bot, /\/(commands|help)(?:\s+|$)/, async () => {
    return formatCommandHelp(COMMAND_CATALOG);
  });

  register(bot, /\/status(?:\s+|$)/, async () => {
    return invoke(services.systemService, "getStatus", {});
  });

  register(bot, /\/onduty(?:\s+|$)/, async () => {
    return invoke(services.onDutyService, "getOnDuty", {});
  });
}

function registerTelegramCommands(bot, logger) {
  const telegramCommands = COMMAND_CATALOG.map((item) => ({
    command: item.command.replace("/", ""),
    description: normalizeDescription(item.description),
  })).filter((item) => {
    const ok = /^[a-z0-9_]{1,32}$/.test(item.command);

    if (!ok) {
      logger.warn(
        `Skipping setMyCommands entry for unsupported Telegram command: ${item.command}`,
      );
    }

    return ok;
  });

  bot.setMyCommands(telegramCommands).catch((error) => {
    logger.error("Failed to register Telegram command catalog", error);
  });
}

function registerUserAdminCommands({ bot, services }) {
  register(bot, /\/adduser(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.userAdminService, "addUser", {
      actorUserId: msg.from.id,
      message: msg,
    });
  });

  register(bot, /\/removeuser\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.userAdminService, "removeUser", {
      actorUserId: msg.from.id,
      telegramUserId: Number(match[1]),
    });
  });

  register(bot, /\/admins(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.userAdminService, "listAdmins", {});
  });

  register(bot, /\/addadmin\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.userAdminService, "addAdmin", {
      actorUserId: msg.from.id,
      telegramUserId: Number(match[1]),
    });
  });

  register(bot, /\/removeadmin\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.userAdminService, "removeAdmin", {
      actorUserId: msg.from.id,
      telegramUserId: Number(match[1]),
    });
  });

  register(bot, /\/users(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.userAdminService, "listUsers", {});
  });
}

function registerDutyDefinitionCommands({ bot, services }) {
  register(bot, /\/duties(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "listDuties", {});
  });

  register(bot, /\/dutyshow\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "getDuty", {
      code: match[1],
    });
  });

  register(bot, /\/dutycreate\s+(.+)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "createDuty", {
      rawInput: match[1],
      actorUserId: msg.from.id,
    });
  });

  register(bot, /\/dutyenable\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "enableDuty", {
      code: match[1],
    });
  });

  register(bot, /\/dutydisable\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "disableDuty", {
      code: match[1],
    });
  });

  register(
    bot,
    /\/dutysetinterval\s+(\S+)\s+(\S+)(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.dutyDefinitionService, "setInterval", {
        code: match[1],
        intervalInput: match[2],
      });
    },
  );

  register(
    bot,
    /\/dutysetpoll\s+(\S+)\s+(\d+)\s+(\d+)(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.dutyDefinitionService, "setPollConfig", {
        code: match[1],
        leadHours: Number(match[2]),
        durationMinutes: Number(match[3]),
      });
    },
  );

  register(bot, /\/dutysetcron\s+(\S+)\s+(.+)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "setCron", {
      code: match[1],
      cron: match[2],
    });
  });

  register(
    bot,
    /\/add-task\s+"([^"]+)"\s+(\S+)(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.dutyDefinitionService, "addTask", {
        taskText: match[1],
        dutyTypeEnum: match[2],
        actorUserId: msg.from.id,
      });
    },
  );

  register(
    bot,
    /\/remove-task\s+(\d+)\s+(\S+)(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.dutyDefinitionService, "removeTask", {
        taskId: Number(match[1]),
        dutyTypeEnum: match[2],
      });
    },
  );

  register(bot, /\/tasks\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "listTasks", {
      dutyTypeEnum: match[1],
    });
  });

  register(bot, /\/clear-tasks\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.dutyDefinitionService, "clearTasks", {
      dutyTypeEnum: match[1],
    });
  });
}

function registerKitchenCommands({ bot, services }) {
  register(bot, /\/kitchen(?:\s+|$)/, async () => {
    return invoke(services.kitchenDutyService, "getCurrentAssignee", {});
  });

  register(bot, /\/kitchenlist(?:\s+|$)/, async () => {
    return invoke(services.kitchenDutyService, "getKitchenQueue", {});
  });

  register(bot, /\/kitchenadd\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.kitchenDutyService, "addQueueMember", {
      userId: Number(match[1]),
    });
  });

  register(bot, /\/kitchenremove\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.kitchenDutyService, "removeQueueMember", {
      userId: Number(match[1]),
    });
  });

  register(bot, /\/kitchenskip(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.kitchenDutyService, "rotateIfDue", {
      force: true,
      source: "COMMAND",
    });
  });

  register(bot, /\/kitchenswap(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.kitchenDutyService, "swapCurrentWithNext", {
      actorUserId: msg.from.id,
    });
  });
}

function registerBathroomCommands({ bot, services }) {
  register(bot, /\/bathroom(?:\s+|$)/, async () => {
    return invoke(services.bathroomDutyService, "getCurrentPair", {});
  });

  register(bot, /\/bathroomlist(?:\s+|$)/, async () => {
    return invoke(services.bathroomDutyService, "listPairs", {});
  });

  register(bot, /\/bathroomadd\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.bathroomDutyService, "addPoolUser", {
      userId: Number(match[1]),
    });
  });

  register(bot, /\/bathroomremove\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.bathroomDutyService, "removePoolUser", {
      userId: Number(match[1]),
    });
  });

  register(
    bot,
    /\/bathroompair\s+(\d+)\s+(\d+)(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.bathroomDutyService, "upsertPair", {
        userId1: Number(match[1]),
        userId2: Number(match[2]),
      });
    },
  );

  register(bot, /\/bathroomskip(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.bathroomDutyService, "rotatePairIfDue", {
      force: true,
      source: "COMMAND",
    });
  });
}

function registerRoomCommands({ bot, services }) {
  register(bot, /\/rooms(?:\s+|$)/, async () => {
    return invoke(services.roomService, "listOwners", {});
  });

  register(bot, /\/roomshow\s+(\S+)(?:\s+|$)/, async (_msg, match) => {
    return invoke(services.roomService, "listOwners", {
      roomCode: match[1],
    });
  });

  register(bot, /\/roomcreate\s+(\S+)\s+(.+)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.roomService, "createRoom", {
      code: match[1],
      name: match[2],
    });
  });

  register(bot, /\/roomdelete\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.roomService, "deleteRoom", {
      roomCode: match[1],
    });
  });

  register(bot, /\/put\s+(\d+)\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.roomService, "moveUser", {
      userId: Number(match[1]),
      roomCode: match[2],
    });
  });

  register(bot, /\/roomremove\s+(\d+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.roomService, "removeUser", {
      userId: Number(match[1]),
    });
  });
}

function registerPaymentCommands({ bot, services }) {
  register(bot, /\/payment(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.paymentService, "getSettings", {});
  });

  register(
    bot,
    /\/payment-per\s+(\d+(?:\.\d+)?)(?:\s+(\S+))?(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.paymentService, "setMonthAmount", {
        amount: Number(match[1]),
        currency: match[2],
        source: "COMMAND",
        setByUserId: msg.from.id,
      });
    },
  );

  register(bot, /\/payment-amount(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.paymentService, "getCurrentAmount", {});
  });

  register(
    bot,
    /\/payment-history(?:\s+(\d+))?(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.paymentService, "getAmountHistory", {
        months: match[1] ? Number(match[1]) : undefined,
      });
    },
  );

  register(
    bot,
    /\/paymentcard\s+(\S+)(?:\s+(.+))?(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.paymentService, "setCardDetails", {
        cardNumber: match[1],
        holderName: match[2] || null,
      });
    },
  );

  register(bot, /\/paymentcash\s+(.+)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.paymentService, "setCashInstruction", {
      instruction: match[1],
    });
  });

  register(
    bot,
    /\/paymentmode\s+(CARD|CASH|CARD_OR_CASH)(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.paymentService, "setPaymentMode", {
        mode: match[1],
      });
    },
  );

  register(
    bot,
    /\/paymentday\s+(\d{1,2})\s+(\d{1,2})(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.paymentService, "setPaymentDays", {
        reminderDay: Number(match[1]),
        collectionDay: Number(match[2]),
      });
    },
  );
}

function registerDebugCommands({ bot, services }) {
  register(bot, /\/forcerotate\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.systemService, "forceRotate", {
      dutyCode: match[1],
      actorUserId: msg.from.id,
    });
  });

  register(bot, /\/forcepoll\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.systemService, "forcePoll", {
      dutyCode: match[1],
      actorUserId: msg.from.id,
      chatId: msg.chat.id,
    });
  });

  register(bot, /\/resolvepoll\s+(\S+)(?:\s+|$)/, async (msg, match) => {
    await ensureAdmin(msg, services);
    return invoke(services.systemService, "resolvePoll", {
      dutyCode: match[1],
      actorUserId: msg.from.id,
    });
  });

  register(bot, /\/reload(?:\s+|$)/, async (msg) => {
    await ensureAdmin(msg, services);
    return invoke(services.systemService, "reload", {
      actorUserId: msg.from.id,
    });
  });
}

function registerAccountabilityCommands({ bot, services }) {
  register(
    bot,
    /\/badDuties(?:\s+(\d{4}-\d{2}))?(?:\s+|$)/,
    async (msg, match) => {
      await ensureAdmin(msg, services);
      return invoke(services.accountabilityService, "getBadDuties", {
        monthKey: match[1] || null,
      });
    },
  );
}

function register(bot, regexp, fn) {
  bot.onText(regexp, async (msg, match) => {
    try {
      const result = await fn(msg, match || []);
      await sendResult(bot, msg.chat.id, result);
    } catch (error) {
      await bot.sendMessage(
        msg.chat.id,
        `Xatolik: ${error.message || String(error)}`,
      );
    }
  });
}

async function ensureAdmin(msg, services) {
  if (!msg || !msg.from) {
    throw new Error("Missing message sender");
  }

  if (
    services.authService &&
    typeof services.authService.ensureAdmin === "function"
  ) {
    await services.authService.ensureAdmin({
      userId: msg.from.id,
      chatId: msg.chat.id,
    });
    return;
  }

  if (
    services.userAdminService &&
    typeof services.userAdminService.isAdmin === "function"
  ) {
    const isAdmin = await services.userAdminService.isAdmin(msg.from.id);

    if (!isAdmin) {
      throw new Error("Admin permission required");
    }

    return;
  }

  if (
    services.dutyService &&
    typeof services.dutyService.ensureAdmin === "function"
  ) {
    const ok = await services.dutyService.ensureAdmin(msg);

    if (!ok) {
      throw new Error("Admin permission required");
    }

    return;
  }

  throw new Error("Admin guard service is not configured");
}

async function invoke(service, methodName, payload) {
  if (!service || typeof service[methodName] !== "function") {
    throw new Error(`Service method not available: ${methodName}`);
  }

  return service[methodName](payload || {});
}

function formatCommandHelp(items) {
  return items
    .map(
      (item) =>
        `${item.command} - ${item.description}${item.permission ? ` [${translatePermission(item.permission)}]` : ""}`,
    )
    .join("\n");
}

function normalizeDescription(value) {
  const fallback = "Tavsif yo'q";
  const text = String(value || fallback).trim();

  if (text.length <= 256) {
    return text;
  }

  return `${text.slice(0, 253)}...`;
}

function translatePermission(permission) {
  if (permission === COMMAND_PERMISSION.ANYONE) {
    return "Hamma uchun";
  }

  if (permission === COMMAND_PERMISSION.ADMIN) {
    return "Faqat admin";
  }

  return permission;
}

async function sendResult(bot, chatId, result) {
  if (result == null) {
    return;
  }

  if (typeof result === "string") {
    await bot.sendMessage(chatId, result);
    return;
  }

  await bot.sendMessage(chatId, JSON.stringify(result, null, 2));
}

module.exports = {
  registerCommands,
};
