const fs = require("fs");
const path = require("path");

const DEFAULT_TICK_INTERVAL_MS = 60 * 1000;
const DEFAULT_RUNNING_STALE_AFTER_MS = 10 * 60 * 1000;

class SchedulerService {
  constructor({
    dueJobProvider,
    jobHandlers,
    executionStateStore,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    runningStaleAfterMs = DEFAULT_RUNNING_STALE_AFTER_MS,
    runOnStart = true,
    now = () => new Date(),
    logger = console,
  }) {
    if (!dueJobProvider || typeof dueJobProvider.getDueJobs !== "function") {
      throw new Error(
        "SchedulerService requires dueJobProvider.getDueJobs(at)",
      );
    }

    if (!jobHandlers || typeof jobHandlers !== "object") {
      throw new Error("SchedulerService requires jobHandlers map");
    }

    if (
      !executionStateStore ||
      typeof executionStateStore.getByKey !== "function" ||
      typeof executionStateStore.upsert !== "function"
    ) {
      throw new Error(
        "SchedulerService requires executionStateStore with getByKey and upsert",
      );
    }

    this.dueJobProvider = dueJobProvider;
    this.jobHandlers = jobHandlers;
    this.executionStateStore = executionStateStore;
    this.tickIntervalMs = tickIntervalMs;
    this.runningStaleAfterMs = runningStaleAfterMs;
    this.runOnStart = runOnStart;
    this.now = now;
    this.logger = logger;

    this.timer = null;
    this.tickInProgress = false;
  }

  start() {
    if (this.timer) {
      return;
    }

    if (this.runOnStart) {
      this.tick().catch((error) => {
        this.logger.error(
          `[scheduler] startup tick failed: ${error.message || error}`,
        );
      });
    }

    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error(`[scheduler] tick failed: ${error.message || error}`);
      });
    }, this.tickIntervalMs);

    this.logger.info(
      `[scheduler] started with interval ${this.tickIntervalMs}ms`,
    );
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    this.logger.info("[scheduler] stopped");
  }

  async tick(at = this.now()) {
    if (this.tickInProgress) {
      this.logger.warn(
        "[scheduler] skipping tick because previous tick still running",
      );
      return {
        skipped: true,
        reason: "TICK_IN_PROGRESS",
      };
    }

    this.tickInProgress = true;

    try {
      const dueJobs = await this.dueJobProvider.getDueJobs(at);
      const jobs = Array.isArray(dueJobs) ? dueJobs : [];
      const results = [];

      for (const job of jobs) {
        const result = await this._executeJob(job, at);
        results.push(result);
      }

      return {
        skipped: false,
        jobCount: jobs.length,
        results,
      };
    } finally {
      this.tickInProgress = false;
    }
  }

  async _executeJob(job, now) {
    this._validateJob(job);

    const { executionKey, type, payload = null } = job;
    const handler = this.jobHandlers[type];

    if (typeof handler !== "function") {
      throw new Error(`No scheduler handler registered for job type=${type}`);
    }

    const state = await this.executionStateStore.getByKey(executionKey);

    if (state && state.status === "completed") {
      return {
        executionKey,
        type,
        skipped: true,
        reason: "ALREADY_COMPLETED",
      };
    }

    if (state && state.status === "running") {
      const startedAt = state.startedAt ? new Date(state.startedAt) : null;
      const stale =
        startedAt &&
        now.getTime() - startedAt.getTime() > this.runningStaleAfterMs;

      if (!stale) {
        return {
          executionKey,
          type,
          skipped: true,
          reason: "ALREADY_RUNNING",
        };
      }
    }

    const attempts = state?.attempts || 0;
    await this.executionStateStore.upsert(executionKey, {
      executionKey,
      type,
      status: "running",
      attempts: attempts + 1,
      startedAt: now.toISOString(),
      scheduledAt: job.scheduledAt
        ? new Date(job.scheduledAt).toISOString()
        : null,
      payload,
      error: null,
      finishedAt: null,
      updatedAt: now.toISOString(),
    });

    try {
      const output = await handler({
        job,
        now,
      });

      await this.executionStateStore.upsert(executionKey, {
        executionKey,
        type,
        status: "completed",
        attempts: attempts + 1,
        startedAt: now.toISOString(),
        scheduledAt: job.scheduledAt
          ? new Date(job.scheduledAt).toISOString()
          : null,
        payload,
        error: null,
        finishedAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      });

      return {
        executionKey,
        type,
        skipped: false,
        status: "completed",
        output,
      };
    } catch (error) {
      await this.executionStateStore.upsert(executionKey, {
        executionKey,
        type,
        status: "failed",
        attempts: attempts + 1,
        startedAt: now.toISOString(),
        scheduledAt: job.scheduledAt
          ? new Date(job.scheduledAt).toISOString()
          : null,
        payload,
        error: error.message || String(error),
        finishedAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      });

      return {
        executionKey,
        type,
        skipped: false,
        status: "failed",
        error: error.message || String(error),
      };
    }
  }

  _validateJob(job) {
    if (!job || typeof job !== "object") {
      throw new Error("Scheduler job must be an object");
    }

    if (!job.type || typeof job.type !== "string") {
      throw new Error("Scheduler job requires string type");
    }

    if (!job.executionKey || typeof job.executionKey !== "string") {
      throw new Error("Scheduler job requires string executionKey");
    }
  }
}

class FileExecutionStateStore {
  constructor({ filePath }) {
    if (!filePath) {
      throw new Error("FileExecutionStateStore requires filePath");
    }

    this.filePath = filePath;
    this._ensureStateFile();
  }

  async getByKey(executionKey) {
    const state = this._readState();
    return state[executionKey] || null;
  }

  async upsert(executionKey, value) {
    const state = this._readState();
    state[executionKey] = value;
    this._writeState(state);
    return value;
  }

  _ensureStateFile() {
    const dir = path.dirname(this.filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2), "utf8");
    }
  }

  _readState() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      return parsed;
    } catch {
      return {};
    }
  }

  _writeState(state) {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }
}

function createSchedulerService(options) {
  return new SchedulerService(options);
}

function createDefaultFileExecutionStateStore() {
  const statePath = path.resolve(
    process.cwd(),
    ".scheduler",
    "execution-state.json",
  );

  return new FileExecutionStateStore({
    filePath: statePath,
  });
}

module.exports = {
  SchedulerService,
  FileExecutionStateStore,
  createSchedulerService,
  createDefaultFileExecutionStateStore,
  DEFAULT_TICK_INTERVAL_MS,
};
