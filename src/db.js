const dayjs = require("dayjs");
const { LowSync } = require("lowdb");
const { JSONFileSync } = require("lowdb/node");

const adapter = new JSONFileSync("db.json");
const defaultData = {
  chatId: null,
  admins: [],
  users: [],
  currentIndex: 0,
  lastUpdated: null,
};

const db = new LowSync(adapter, defaultData);

db.read();
db.data ||= defaultData;

if (!db.data.lastUpdated) {
  db.data.lastUpdated = dayjs().format();
  db.write();
}

const save = () => db.write();

module.exports = {
  db,
  save,
};
