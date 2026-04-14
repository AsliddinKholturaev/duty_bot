const dayjs = require("dayjs");
const { getDutyMessage, getDutyReminderMessage } = require("../messages");

function createDutyService({ bot, db, save, rotationDays }) {
  function toDisplayName(user) {
    return user.username || user.first_name || String(user.id);
  }

  function sendDutyMessage(chatId, title) {
    const users = db.data.users;
    if (users.length === 0) {
      return bot.sendMessage(chatId, "Hali navbatchilar ro'yxati bo'sh.");
    }

    const current = users[db.data.currentIndex];
    const next = users[(db.data.currentIndex + 1) % users.length];

    return bot.sendMessage(chatId, getDutyMessage(title, current, next));
  }

  function sendCurrentDutyReminder(chatId) {
    const users = db.data.users;
    if (users.length === 0) {
      return Promise.resolve();
    }

    const current = users[db.data.currentIndex];
    return bot.sendMessage(chatId, getDutyReminderMessage(current));
  }

  function isDutyChangeDay() {
    if (!db.data.lastUpdated) {
      return false;
    }

    return (
      dayjs().format("YYYY-MM-DD") ===
      dayjs(db.data.lastUpdated).format("YYYY-MM-DD")
    );
  }

  function addUserToDuty(user) {
    const exists = db.data.users.find((u) => u.id === user.id);
    if (exists) {
      return { added: false, username: exists.username };
    }

    const username = toDisplayName(user);

    db.data.users.push({
      id: user.id,
      username,
    });

    save();

    return { added: true, username };
  }

  function removeUserFromDuty(userId) {
    const userIndex = db.data.users.findIndex((user) => user.id === userId);

    if (userIndex === -1) {
      return { removed: false };
    }

    const [removedUser] = db.data.users.splice(userIndex, 1);

    if (db.data.users.length === 0) {
      db.data.currentIndex = 0;
    } else if (userIndex < db.data.currentIndex) {
      db.data.currentIndex -= 1;
    } else if (userIndex === db.data.currentIndex) {
      db.data.currentIndex %= db.data.users.length;
    } else if (db.data.currentIndex >= db.data.users.length) {
      db.data.currentIndex = 0;
    }

    save();

    return {
      removed: true,
      username: removedUser.username,
    };
  }

  function isAdmin(userId) {
    return db.data.admins.includes(userId);
  }

  function ensureAdmin(msg) {
    if (isAdmin(msg.from.id)) {
      return true;
    }

    bot.sendMessage(msg.chat.id, "❌ Bu buyruqni faqat admin ishlata oladi.");
    return false;
  }

  function checkRotation(chatId) {
    const { lastUpdated, users } = db.data;
    if (!lastUpdated || users.length === 0) return;

    const diff = dayjs().diff(dayjs(lastUpdated), "day", true);

    if (diff >= rotationDays) {
      db.data.currentIndex = (db.data.currentIndex + 1) % users.length;
      db.data.lastUpdated = dayjs().format();

      save();

      sendDutyMessage(chatId, "🔔 Navbatchi almashdi!")
        .then(() => sendCurrentDutyReminder(chatId))
        .then(() => {
          const current = db.data.users[db.data.currentIndex];
          console.log(`[rotation] Message sent. Now: ${current.username}`);
        })
        .catch((err) => {
          console.error(
            "[rotation] Failed to send message:",
            err.message || err,
          );
        });
    }
  }

  return {
    addUserToDuty,
    checkRotation,
    ensureAdmin,
    isAdmin,
    isDutyChangeDay,
    removeUserFromDuty,
    sendCurrentDutyReminder,
    sendDutyMessage,
  };
}

module.exports = {
  createDutyService,
};
