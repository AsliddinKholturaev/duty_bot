const cron = require("node-cron");

function registerSchedulers({ bot, db, dutyService, rotationCheckIntervalMs }) {
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
