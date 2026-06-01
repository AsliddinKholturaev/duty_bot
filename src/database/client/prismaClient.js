const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");

let prisma;
let pool;

function getPrismaClient() {
  if (!prisma) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    prisma = new PrismaClient({
      adapter: new PrismaPg(pool),
    });
  }

  return prisma;
}

async function closePrismaClient() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }

  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPrismaClient,
  closePrismaClient,
};
