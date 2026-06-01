require("dotenv").config();

const dayjs = require("dayjs");
const { createBot, registerShutdownHandlers, startBot } = require("./src/bot");
const { ROTATION_CHECK_INTERVAL_MS, ROTATION_DAYS } = require("./src/config");
const { db, save } = require("./src/db");
const { registerCommands } = require("./src/commands/registerCommands");
const { registerSchedulers } = require("./src/scheduler/registerSchedulers");
const {
  createStartupServiceContainer,
} = require("./src/services/createStartupServiceContainer");
const { createDutyService } = require("./src/services/dutyService");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
}

const bot = createBot(token);

registerShutdownHandlers(bot);

const dutyService = createDutyService({
  bot,
  db,
  save,
  rotationDays: ROTATION_DAYS,
});

const services = createStartupServiceContainer({
  bot,
  db,
  save,
  dutyService,
});

registerCommands({
  bot,
  services,
  dutyService,
});

registerSchedulers({
  bot,
  db,
  dutyService,
  rotationCheckIntervalMs: ROTATION_CHECK_INTERVAL_MS,
});

startBot(bot);
