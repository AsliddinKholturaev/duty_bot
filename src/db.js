const dayjs = require("dayjs");
const fs = require("fs");
const { LowSync } = require("lowdb");
const { JSONFileSync } = require("lowdb/node");
const path = require("path");

const dbFilePath = path.resolve(process.env.DB_FILE_PATH || "db.json");
// Ensure custom DB path directories exist before lowdb touches the file.
fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

const adapter = new JSONFileSync(dbFilePath);
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
