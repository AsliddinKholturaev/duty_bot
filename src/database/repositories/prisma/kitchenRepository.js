const KITCHEN_DUTY_CODE_CANDIDATES = [
  "kitchen",
  "kitchen_trash",
  "KITCHEN_TRASH",
];
const KITCHEN_BUILTIN_TYPE = "KITCHEN_TRASH";
const ROTATION_HOURS = 48;
const MS_IN_HOUR = 60 * 60 * 1000;

class PrismaKitchenRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findKitchenDuty() {
    return this._resolveKitchenDutyDefinition(this.prisma);
  }

  async createKitchenDuty(input = {}) {
    const existing = await this._resolveKitchenDutyDefinition(this.prisma);

    if (existing) {
      throw new Error("Kitchen duty definition already exists");
    }

    const definition = await this.prisma.dutyDefinition.create({
      data: {
        code: input.code || "kitchen",
        builtinType: input.builtinType || KITCHEN_BUILTIN_TYPE,
        name: input.name || "Kitchen and Trash",
        description:
          input.description || "48-hour rotating kitchen and trash duty",
        category: input.category || "ROTATION",
        isActive: input.isActive ?? true,
        assignmentMode: input.assignmentMode || "SINGLE",
        rotationIntervalHours: input.rotationIntervalHours ?? ROTATION_HOURS,
        rotationIntervalDays: input.rotationIntervalDays ?? null,
        scheduleCron: input.scheduleCron ?? null,
        requiresPoll: input.requiresPoll ?? false,
        pollLeadHours: input.pollLeadHours ?? null,
        pollDurationMinutes: input.pollDurationMinutes ?? null,
        tieKeepsCurrent: input.tieKeepsCurrent ?? true,
        failureKeepsCurrent: input.failureKeepsCurrent ?? true,
        metadata: input.metadata ?? null,
      },
    });

    return definition;
  }

  async updateKitchenDuty(input) {
    const definition = await this._requireKitchenDutyDefinition(this.prisma);

    return this.prisma.dutyDefinition.update({
      where: { id: definition.id },
      data: {
        name: input.name,
        description: input.description,
        isActive: input.isActive,
        rotationIntervalHours: input.rotationIntervalHours,
        rotationIntervalDays: input.rotationIntervalDays,
        scheduleCron: input.scheduleCron,
        requiresPoll: input.requiresPoll,
        pollLeadHours: input.pollLeadHours,
        pollDurationMinutes: input.pollDurationMinutes,
        tieKeepsCurrent: input.tieKeepsCurrent,
        failureKeepsCurrent: input.failureKeepsCurrent,
        metadata: input.metadata,
      },
    });
  }

  async deleteKitchenDuty() {
    const definition = await this._requireKitchenDutyDefinition(this.prisma);

    await this.prisma.dutyDefinition.delete({
      where: { id: definition.id },
    });

    return { deleted: true, dutyDefinitionId: definition.id };
  }

  async listQueue() {
    const definition = await this._requireKitchenDutyDefinition(this.prisma);

    return this.prisma.dutyAssignmentQueue.findMany({
      where: {
        dutyDefinitionId: definition.id,
        isActive: true,
      },
      include: {
        user: true,
      },
      orderBy: {
        position: "asc",
      },
    });
  }

  async addQueueMember(userId, options = {}) {
    if (!userId) {
      throw new Error("userId is required");
    }

    return this.prisma.$transaction(async (tx) => {
      const definition = await this._requireKitchenDutyDefinition(tx);
      const user = await tx.user.findUnique({ where: { id: userId } });

      if (!user) {
        throw new Error(`User not found for id=${userId}`);
      }

      const existing = await tx.dutyAssignmentQueue.findUnique({
        where: {
          dutyDefinitionId_userId: {
            dutyDefinitionId: definition.id,
            userId,
          },
        },
      });

      if (existing && existing.isActive) {
        return existing;
      }

      const queue = await tx.dutyAssignmentQueue.findMany({
        where: {
          dutyDefinitionId: definition.id,
          isActive: true,
        },
        orderBy: {
          position: "asc",
        },
      });

      const desiredPosition = this._resolveInsertPosition(
        queue,
        options.position,
      );

      await tx.dutyAssignmentQueue.updateMany({
        where: {
          dutyDefinitionId: definition.id,
          isActive: true,
          position: {
            gte: desiredPosition,
          },
        },
        data: {
          position: {
            increment: 1,
          },
        },
      });

      if (existing) {
        return tx.dutyAssignmentQueue.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            position: desiredPosition,
          },
        });
      }

      return tx.dutyAssignmentQueue.create({
        data: {
          dutyDefinitionId: definition.id,
          userId,
          position: desiredPosition,
          isActive: true,
        },
      });
    });
  }

  async removeQueueMember(userId) {
    if (!userId) {
      throw new Error("userId is required");
    }

    return this.prisma.$transaction(async (tx) => {
      const definition = await this._requireKitchenDutyDefinition(tx);
      const row = await tx.dutyAssignmentQueue.findUnique({
        where: {
          dutyDefinitionId_userId: {
            dutyDefinitionId: definition.id,
            userId,
          },
        },
      });

      if (!row || !row.isActive) {
        return { removed: false };
      }

      await tx.dutyAssignmentQueue.update({
        where: { id: row.id },
        data: { isActive: false },
      });

      await tx.dutyAssignmentQueue.updateMany({
        where: {
          dutyDefinitionId: definition.id,
          isActive: true,
          position: {
            gt: row.position,
          },
        },
        data: {
          position: {
            decrement: 1,
          },
        },
      });

      const runtime = await tx.dutyRuntimeState.findUnique({
        where: { dutyDefinitionId: definition.id },
      });

      if (runtime && runtime.currentQueuePosition === row.position) {
        const remaining = await tx.dutyAssignmentQueue.findMany({
          where: {
            dutyDefinitionId: definition.id,
            isActive: true,
          },
          orderBy: {
            position: "asc",
          },
        });

        if (remaining.length > 0) {
          const fallback =
            remaining.find((item) => item.position >= row.position) ||
            remaining[0];

          await tx.dutyRuntimeState.update({
            where: { dutyDefinitionId: definition.id },
            data: {
              currentQueuePosition: fallback.position,
              currentStartedAt: new Date(),
              nextRotationAt: new Date(
                Date.now() + ROTATION_HOURS * MS_IN_HOUR,
              ),
            },
          });
        }
      }

      return { removed: true };
    });
  }

  async moveQueueMember(userId, newPosition) {
    if (!userId) {
      throw new Error("userId is required");
    }

    if (!Number.isInteger(newPosition) || newPosition < 1) {
      throw new Error("newPosition must be an integer >= 1");
    }

    return this.prisma.$transaction(async (tx) => {
      const definition = await this._requireKitchenDutyDefinition(tx);
      const row = await tx.dutyAssignmentQueue.findUnique({
        where: {
          dutyDefinitionId_userId: {
            dutyDefinitionId: definition.id,
            userId,
          },
        },
      });

      if (!row || !row.isActive) {
        throw new Error(`Active queue row not found for userId=${userId}`);
      }

      const queue = await tx.dutyAssignmentQueue.findMany({
        where: {
          dutyDefinitionId: definition.id,
          isActive: true,
        },
        orderBy: {
          position: "asc",
        },
      });

      const boundedPosition = Math.min(newPosition, queue.length);

      if (boundedPosition === row.position) {
        return row;
      }

      if (boundedPosition < row.position) {
        await tx.dutyAssignmentQueue.updateMany({
          where: {
            dutyDefinitionId: definition.id,
            isActive: true,
            position: {
              gte: boundedPosition,
              lt: row.position,
            },
          },
          data: {
            position: {
              increment: 1,
            },
          },
        });
      } else {
        await tx.dutyAssignmentQueue.updateMany({
          where: {
            dutyDefinitionId: definition.id,
            isActive: true,
            position: {
              gt: row.position,
              lte: boundedPosition,
            },
          },
          data: {
            position: {
              decrement: 1,
            },
          },
        });
      }

      return tx.dutyAssignmentQueue.update({
        where: { id: row.id },
        data: { position: boundedPosition },
      });
    });
  }

  async getCurrentAssignee() {
    return this.prisma.$transaction(async (tx) => {
      const definition = await this._requireKitchenDutyDefinition(tx);
      const queue = await tx.dutyAssignmentQueue.findMany({
        where: {
          dutyDefinitionId: definition.id,
          isActive: true,
        },
        include: {
          user: true,
        },
        orderBy: {
          position: "asc",
        },
      });

      if (queue.length === 0) {
        return {
          dutyDefinition: definition,
          runtimeState: null,
          queueItem: null,
          assignee: null,
        };
      }

      const runtime = await this._ensureRuntimeState(tx, definition.id, queue);
      const queueItem =
        queue.find((item) => item.position === runtime.currentQueuePosition) ||
        queue[0];

      return {
        dutyDefinition: definition,
        runtimeState: runtime,
        queueItem,
        assignee: queueItem.user,
      };
    });
  }

  async setCurrentAssigneeByUserId(userId, options = {}) {
    if (!userId) {
      throw new Error("userId is required");
    }

    return this.prisma.$transaction(async (tx) => {
      const definition = await this._requireKitchenDutyDefinition(tx);
      const queueItem = await tx.dutyAssignmentQueue.findUnique({
        where: {
          dutyDefinitionId_userId: {
            dutyDefinitionId: definition.id,
            userId,
          },
        },
        include: {
          user: true,
        },
      });

      if (!queueItem || !queueItem.isActive) {
        throw new Error(`User ${userId} is not an active kitchen queue member`);
      }

      const startedAt = options.startedAt
        ? new Date(options.startedAt)
        : new Date();
      const nextRotationAt = options.nextRotationAt
        ? new Date(options.nextRotationAt)
        : new Date(startedAt.getTime() + ROTATION_HOURS * MS_IN_HOUR);

      const runtime = await tx.dutyRuntimeState.upsert({
        where: { dutyDefinitionId: definition.id },
        update: {
          currentQueuePosition: queueItem.position,
          currentStartedAt: startedAt,
          nextRotationAt,
          status: "ACTIVE",
        },
        create: {
          dutyDefinitionId: definition.id,
          currentQueuePosition: queueItem.position,
          currentGroupPosition: null,
          currentStartedAt: startedAt,
          nextRotationAt,
          status: "ACTIVE",
        },
      });

      return {
        dutyDefinition: definition,
        runtimeState: runtime,
        queueItem,
        assignee: queueItem.user,
      };
    });
  }

  async rotateToNextAssignee(options = {}) {
    const at = options.at ? new Date(options.at) : new Date();
    const force = Boolean(options.force);

    return this.prisma.$transaction(async (tx) => {
      const definition = await this._requireKitchenDutyDefinition(tx);
      const queue = await tx.dutyAssignmentQueue.findMany({
        where: {
          dutyDefinitionId: definition.id,
          isActive: true,
        },
        include: {
          user: true,
        },
        orderBy: {
          position: "asc",
        },
      });

      if (queue.length === 0) {
        return {
          rotated: false,
          reason: "QUEUE_EMPTY",
          currentAssignee: null,
          nextAssignee: null,
          runtimeState: null,
        };
      }

      const runtime = await this._ensureRuntimeState(
        tx,
        definition.id,
        queue,
        at,
      );

      if (!force && at < new Date(runtime.nextRotationAt)) {
        const currentItem =
          queue.find(
            (item) => item.position === runtime.currentQueuePosition,
          ) || queue[0];

        return {
          rotated: false,
          reason: "NOT_DUE",
          currentAssignee: currentItem.user,
          nextAssignee: null,
          runtimeState: runtime,
        };
      }

      const currentIndex = queue.findIndex(
        (item) => item.position === runtime.currentQueuePosition,
      );
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (safeIndex + 1) % queue.length;

      const currentItem = queue[safeIndex];
      const nextItem = queue[nextIndex];

      const updatedRuntimeState = await tx.dutyRuntimeState.update({
        where: { dutyDefinitionId: definition.id },
        data: {
          currentQueuePosition: nextItem.position,
          currentStartedAt: at,
          nextRotationAt: new Date(at.getTime() + ROTATION_HOURS * MS_IN_HOUR),
          status: "ACTIVE",
        },
      });

      return {
        rotated: true,
        reason: force ? "FORCED" : "DUE",
        previousAssignee: currentItem.user,
        currentAssignee: nextItem.user,
        previousQueueItem: currentItem,
        currentQueueItem: nextItem,
        runtimeState: updatedRuntimeState,
      };
    });
  }

  async _resolveKitchenDutyDefinition(tx) {
    const byBuiltinType = await tx.dutyDefinition.findFirst({
      where: {
        builtinType: KITCHEN_BUILTIN_TYPE,
      },
    });

    if (byBuiltinType) {
      return byBuiltinType;
    }

    return tx.dutyDefinition.findFirst({
      where: {
        code: {
          in: KITCHEN_DUTY_CODE_CANDIDATES,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async _requireKitchenDutyDefinition(tx) {
    const definition = await this._resolveKitchenDutyDefinition(tx);

    if (!definition) {
      throw new Error("Kitchen duty definition not found");
    }

    return definition;
  }

  async _ensureRuntimeState(tx, dutyDefinitionId, queue, now = new Date()) {
    const runtime = await tx.dutyRuntimeState.findUnique({
      where: {
        dutyDefinitionId,
      },
    });

    if (runtime) {
      return runtime;
    }

    if (!queue.length) {
      return null;
    }

    return tx.dutyRuntimeState.create({
      data: {
        dutyDefinitionId,
        currentQueuePosition: queue[0].position,
        currentGroupPosition: null,
        currentStartedAt: now,
        nextRotationAt: new Date(now.getTime() + ROTATION_HOURS * MS_IN_HOUR),
        status: "ACTIVE",
      },
    });
  }

  _resolveInsertPosition(queue, requestedPosition) {
    if (!Number.isInteger(requestedPosition) || requestedPosition < 1) {
      return queue.length + 1;
    }

    return Math.min(requestedPosition, queue.length + 1);
  }
}

module.exports = {
  PrismaKitchenRepository,
};
