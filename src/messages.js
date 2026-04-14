const dutyTasks = [
  "Axlatni to'kib kelish",
  "Oshxonani supurish",
  "Yuvilmagan idish qolsa, egasini topib yuvdirish",
];

function buildTasksList() {
  return dutyTasks.map((task, index) => `${index + 1}. ${task}`).join("\n");
}

function getDutyMessage(title, current, next) {
  return `${title}\n\n👤 Navbatchi: @${current.username}\n⏭ Keyingi navbatchi: @${next.username}\n\n📋 Vazifalar:\n${buildTasksList()}`;
}

function getDutyReminderMessage(current) {
  return `⚠️ @${current.username}, siz bugun navbatchisiz. Mas'uliyatsiz bo'lmang!\n\n📋 Bugungi vazifalaringiz:\n${buildTasksList()}`;
}

module.exports = {
  getDutyMessage,
  getDutyReminderMessage,
};
