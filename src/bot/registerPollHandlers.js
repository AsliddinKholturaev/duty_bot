function registerPollHandlers({ bot, dutyPollService, logger = console }) {
  if (!bot) {
    throw new Error("registerPollHandlers requires bot");
  }

  if (!dutyPollService) {
    throw new Error("registerPollHandlers requires dutyPollService");
  }

  bot.on("poll", async (pollUpdate) => {
    try {
      await handlePollUpdate({ dutyPollService, logger, pollUpdate });
    } catch (error) {
      logger.error(
        `[poll-handler] Unhandled poll update error: ${error.message || error}`,
      );
    }
  });
}

async function handlePollUpdate({ dutyPollService, logger, pollUpdate }) {
  if (!pollUpdate || !pollUpdate.id) {
    logger.warn("[poll-handler] Received poll update without id");
    return;
  }

  const voteCounts = extractVoteCounts(pollUpdate.options);

  await dutyPollService.savePollUpdate({
    telegramPollId: pollUpdate.id,
    yesVotes: voteCounts.yesVotes,
    noVotes: voteCounts.noVotes,
  });

  logger.info(
    `[poll-handler] Poll ${pollUpdate.id} votes saved: yes=${voteCounts.yesVotes}, no=${voteCounts.noVotes}`,
  );

  if (shouldResolvePoll(pollUpdate)) {
    const resolution = await dutyPollService.resolvePollByTelegramPollId(
      pollUpdate.id,
      { at: new Date() },
    );

    const result = resolution?.poll?.result || resolution?.outcome || "UNKNOWN";
    logger.info(`[poll-handler] Poll ${pollUpdate.id} resolved with ${result}`);
  }
}

function extractVoteCounts(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return {
      yesVotes: 0,
      noVotes: 0,
    };
  }

  const normalized = options.map((option) => ({
    text: String(option?.text || "")
      .trim()
      .toLowerCase(),
    voterCount: Number(option?.voter_count || 0),
  }));

  const yesOption =
    normalized.find((option) => YES_LABELS.has(option.text)) || normalized[0];

  const noOption =
    normalized.find((option) => NO_LABELS.has(option.text)) || normalized[1];

  return {
    yesVotes: toSafeInt(yesOption?.voterCount),
    noVotes: toSafeInt(noOption?.voterCount),
  };
}

function shouldResolvePoll(pollUpdate) {
  if (pollUpdate.is_closed) {
    return true;
  }

  if (pollUpdate.close_date) {
    const closeAtMs = Number(pollUpdate.close_date) * 1000;
    return Number.isFinite(closeAtMs) && Date.now() >= closeAtMs;
  }

  return false;
}

function toSafeInt(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

const YES_LABELS = new Set(["yes", "ha", "true", "approve", "approved"]);
const NO_LABELS = new Set(["no", "yo'q", "yoq", "false", "reject", "rejected"]);

module.exports = {
  registerPollHandlers,
  handlePollUpdate,
  extractVoteCounts,
  shouldResolvePoll,
};
