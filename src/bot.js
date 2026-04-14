const TelegramBot = require("node-telegram-bot-api");

function createBot(token) {
  const bot = new TelegramBot(token, { polling: false });

  bot.on("polling_error", (err) => {
    const message = err?.message || String(err);

    if (message.includes("409 Conflict")) {
      console.error(
        "Telegram 409 Conflict: another bot instance is running with the same token.",
      );
      process.exit(1);
    }

    console.error("Polling error:", message);
  });

  return bot;
}

async function startBot(bot) {
  try {
    await bot.deleteWebHook({ drop_pending_updates: true });
    await bot.startPolling({ restart: true });
    console.log("Bot started with polling");
  } catch (error) {
    console.error("Failed to start bot:", error.message || error);
    process.exit(1);
  }
}

function registerShutdownHandlers(bot) {
  async function shutdown() {
    try {
      await bot.stopPolling();
    } catch {
      // Ignore stop errors during shutdown.
    }
    process.exit(0);
  }

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

module.exports = {
  createBot,
  startBot,
  registerShutdownHandlers,
};
