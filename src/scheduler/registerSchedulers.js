const cron = require("node-cron");

function registerSchedulers({
  bot,
  db,
  services = {},
  dutyService,
  rotationCheckIntervalMs,
}) {
  if (
    services.automationService &&
    typeof services.automationService.runFrequentChecks === "function"
  ) {
    setInterval(() => {
      services.automationService.runFrequentChecks().catch((err) => {
        console.error(
          "[automation] Frequent check failed:",
          err.message || err,
        );
      });
    }, rotationCheckIntervalMs);

    cron.schedule("5 9 * * *", () => {
      services.automationService.runDailyChecks().catch((err) => {
        console.error("[automation] Daily check failed:", err.message || err);
      });
    });

    return;
  }

  const { checkRotation, isDutyChangeDay, sendCurrentDutyReminder } =
    dutyService;

  setInterval(() => {
    db.read();
    const chatId = db.data.chatId;
    if (!chatId) {
      console.log(
        "[rotation] chatId not set yet — send /start in the group first",
      );
      return;
    }
    checkRotation(chatId);
  }, rotationCheckIntervalMs);

  cron.schedule("0 8 * * *", () => {
    db.read();
    const chatId = db.data.chatId;
    if (!chatId || db.data.users.length === 0) return;

    checkRotation(chatId);

    if (!isDutyChangeDay()) {
      return;
    }

    sendCurrentDutyReminder(chatId).catch((err) => {
      console.error(
        "[morning-reminder] Failed to send message:",
        err.message || err,
      );
    });
  });

  cron.schedule("0 18 * * *", () => {
    db.read();
    const chatId = db.data.chatId;
    if (!chatId || db.data.users.length === 0) return;

    if (!isDutyChangeDay()) {
      return;
    }

    sendCurrentDutyReminder(chatId).catch((err) => {
      console.error(
        "[evening-reminder] Failed to send message:",
        err.message || err,
      );
    });
  });
}

module.exports = {
  registerSchedulers,
};
