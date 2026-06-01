const dutyTasks = [
  "Axlatni to'kib kelish",
  "Oshxonani supurish",
  "Yuvilmagan idish qolsa, egasini topib yuvdirish",
];

function buildTasksList() {
  return dutyTasks.map((task, index) => `${index + 1}. ${task}`).join("\n");
}

function isTelegramUsername(value) {
  return typeof value === "string" && /^[A-Za-z0-9_]{5,32}$/.test(value);
}

function formatLegacyMention(user) {
  const username = typeof user?.username === "string" ? user.username.trim() : "";

  if (isTelegramUsername(username)) {
    return `@${username}`;
  }

  if (username) {
    return username;
  }

  if (user?.first_name) {
    return user.first_name;
  }

  if (user?.id != null) {
    return `user:${user.id}`;
  }

  return "noma'lum";
}

function getDutyMessage(title, current, next) {
  return `${title}\n\n👤 Navbatchi: ${formatLegacyMention(current)}\n⏭ Keyingi navbatchi: ${formatLegacyMention(next)}`;
}

function getDutyReminderMessage(current) {
  return `⚠️ ${formatLegacyMention(current)}, siz bugun navbatchisiz. Mas'uliyatsiz bo'lmang!\n\n📋 Bugungi vazifalaringiz:\n${buildTasksList()}`;
}

module.exports = {
  getDutyMessage,
  getDutyReminderMessage,
};
