-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DutyTypeEnum" AS ENUM ('KITCHEN_TRASH', 'BATHROOM_TOILET', 'ROOM_CLEANING', 'FLAT_PAYMENT');

-- CreateEnum
CREATE TYPE "DutyCategory" AS ENUM ('ROTATION', 'ROOM_REMINDER', 'PAYMENT_REMINDER');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('SINGLE', 'PAIR', 'ROOM', 'NONE');

-- CreateEnum
CREATE TYPE "DutyRuntimeStatus" AS ENUM ('ACTIVE', 'WAITING_VOTE', 'PAUSED');

-- CreateEnum
CREATE TYPE "DutyPollResult" AS ENUM ('APPROVED', 'REJECTED', 'TIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CARD', 'CASH', 'CARD_OR_CASH');

-- CreateEnum
CREATE TYPE "PaymentAmountSource" AS ENUM ('ADMIN_REPLY', 'COMMAND', 'FALLBACK');

-- CreateEnum
CREATE TYPE "CommandVisibility" AS ENUM ('ALL_USERS', 'ADMINS_ONLY');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSettings" (
    "id" SERIAL NOT NULL,
    "telegramChatId" BIGINT NOT NULL,
    "title" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyDefinition" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "builtinType" "DutyTypeEnum",
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "DutyCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignmentMode" "AssignmentMode" NOT NULL,
    "rotationIntervalHours" INTEGER,
    "rotationIntervalDays" INTEGER,
    "scheduleCron" TEXT,
    "requiresPoll" BOOLEAN NOT NULL DEFAULT false,
    "pollLeadHours" INTEGER,
    "pollDurationMinutes" INTEGER,
    "tieKeepsCurrent" BOOLEAN NOT NULL DEFAULT true,
    "failureKeepsCurrent" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyAssignmentQueue" (
    "id" SERIAL NOT NULL,
    "dutyDefinitionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DutyAssignmentQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyAssignmentGroup" (
    "id" SERIAL NOT NULL,
    "dutyDefinitionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DutyAssignmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyAssignmentGroupMember" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "DutyAssignmentGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyRuntimeState" (
    "id" SERIAL NOT NULL,
    "dutyDefinitionId" INTEGER NOT NULL,
    "currentQueuePosition" INTEGER,
    "currentGroupPosition" INTEGER,
    "currentStartedAt" TIMESTAMP(3) NOT NULL,
    "nextRotationAt" TIMESTAMP(3) NOT NULL,
    "lastReminderAt" TIMESTAMP(3),
    "lastPollAt" TIMESTAMP(3),
    "status" "DutyRuntimeStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyRuntimeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyTask" (
    "id" SERIAL NOT NULL,
    "dutyDefinitionId" INTEGER NOT NULL,
    "taskText" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMonthlyDutyStat" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "monthKey" TEXT NOT NULL,
    "badDutyCount" INTEGER NOT NULL DEFAULT 0,
    "lastIncrementedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMonthlyDutyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyPoll" (
    "id" SERIAL NOT NULL,
    "dutyDefinitionId" INTEGER NOT NULL,
    "runtimeStateId" INTEGER NOT NULL,
    "telegramPollId" TEXT NOT NULL,
    "telegramMessageId" BIGINT,
    "question" TEXT NOT NULL,
    "yesVotes" INTEGER NOT NULL DEFAULT 0,
    "noVotes" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "result" "DutyPollResult",
    "decisionApplied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DutyPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMember" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSettings" (
    "id" SERIAL NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reminderDayOfMonth" INTEGER NOT NULL DEFAULT 13,
    "collectionDayOfMonth" INTEGER NOT NULL DEFAULT 15,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CARD_OR_CASH',
    "cardHolderName" TEXT,
    "cardNumberMasked" TEXT,
    "cashInstruction" TEXT,
    "note" TEXT,
    "defaultPerPersonAmount" DECIMAL(65,30),
    "amountCurrency" TEXT NOT NULL DEFAULT 'USD',
    "lastConfirmedAmountMonth" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMonthAmount" (
    "id" SERIAL NOT NULL,
    "monthKey" TEXT NOT NULL,
    "perPersonAmount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "source" "PaymentAmountSource" NOT NULL,
    "setByUserId" INTEGER,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "PaymentMonthAmount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandCatalog" (
    "id" SERIAL NOT NULL,
    "command" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "visibility" "CommandVisibility" NOT NULL DEFAULT 'ALL_USERS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramUserId_key" ON "User"("telegramUserId");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_userId_key" ON "Admin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSettings_telegramChatId_key" ON "ChatSettings"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyDefinition_code_key" ON "DutyDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DutyDefinition_builtinType_key" ON "DutyDefinition"("builtinType");

-- CreateIndex
CREATE INDEX "DutyDefinition_isActive_category_idx" ON "DutyDefinition"("isActive", "category");

-- CreateIndex
CREATE INDEX "DutyAssignmentQueue_dutyDefinitionId_isActive_position_idx" ON "DutyAssignmentQueue"("dutyDefinitionId", "isActive", "position");

-- CreateIndex
CREATE INDEX "DutyAssignmentQueue_userId_isActive_idx" ON "DutyAssignmentQueue"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DutyAssignmentQueue_dutyDefinitionId_userId_key" ON "DutyAssignmentQueue"("dutyDefinitionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyAssignmentQueue_dutyDefinitionId_position_key" ON "DutyAssignmentQueue"("dutyDefinitionId", "position");

-- CreateIndex
CREATE INDEX "DutyAssignmentGroup_dutyDefinitionId_isActive_position_idx" ON "DutyAssignmentGroup"("dutyDefinitionId", "isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DutyAssignmentGroup_dutyDefinitionId_position_key" ON "DutyAssignmentGroup"("dutyDefinitionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DutyAssignmentGroup_dutyDefinitionId_name_key" ON "DutyAssignmentGroup"("dutyDefinitionId", "name");

-- CreateIndex
CREATE INDEX "DutyAssignmentGroupMember_userId_idx" ON "DutyAssignmentGroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyAssignmentGroupMember_groupId_userId_key" ON "DutyAssignmentGroupMember"("groupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyRuntimeState_dutyDefinitionId_key" ON "DutyRuntimeState"("dutyDefinitionId");

-- CreateIndex
CREATE INDEX "DutyRuntimeState_status_nextRotationAt_idx" ON "DutyRuntimeState"("status", "nextRotationAt");

-- CreateIndex
CREATE INDEX "DutyTask_dutyDefinitionId_isActive_position_idx" ON "DutyTask"("dutyDefinitionId", "isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DutyTask_dutyDefinitionId_position_key" ON "DutyTask"("dutyDefinitionId", "position");

-- CreateIndex
CREATE INDEX "UserMonthlyDutyStat_monthKey_badDutyCount_idx" ON "UserMonthlyDutyStat"("monthKey", "badDutyCount");

-- CreateIndex
CREATE UNIQUE INDEX "UserMonthlyDutyStat_userId_monthKey_key" ON "UserMonthlyDutyStat"("userId", "monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "DutyPoll_telegramPollId_key" ON "DutyPoll"("telegramPollId");

-- CreateIndex
CREATE INDEX "DutyPoll_runtimeStateId_closesAt_idx" ON "DutyPoll"("runtimeStateId", "closesAt");

-- CreateIndex
CREATE INDEX "DutyPoll_dutyDefinitionId_resolvedAt_idx" ON "DutyPoll"("dutyDefinitionId", "resolvedAt");

-- CreateIndex
CREATE INDEX "DutyPoll_decisionApplied_closesAt_idx" ON "DutyPoll"("decisionApplied", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_isActive_idx" ON "Room"("isActive");

-- CreateIndex
CREATE INDEX "RoomMember_userId_idx" ON "RoomMember"("userId");

-- CreateIndex
CREATE INDEX "RoomMember_roomId_isOwner_idx" ON "RoomMember"("roomId", "isOwner");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSettings_singletonKey_key" ON "PaymentSettings"("singletonKey");

-- CreateIndex
CREATE INDEX "PaymentSettings_isActive_idx" ON "PaymentSettings"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMonthAmount_monthKey_key" ON "PaymentMonthAmount"("monthKey");

-- CreateIndex
CREATE INDEX "PaymentMonthAmount_setAt_idx" ON "PaymentMonthAmount"("setAt");

-- CreateIndex
CREATE INDEX "PaymentMonthAmount_source_idx" ON "PaymentMonthAmount"("source");

-- CreateIndex
CREATE UNIQUE INDEX "CommandCatalog_command_key" ON "CommandCatalog"("command");

-- CreateIndex
CREATE INDEX "CommandCatalog_category_isActive_idx" ON "CommandCatalog"("category", "isActive");

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyAssignmentQueue" ADD CONSTRAINT "DutyAssignmentQueue_dutyDefinitionId_fkey" FOREIGN KEY ("dutyDefinitionId") REFERENCES "DutyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyAssignmentQueue" ADD CONSTRAINT "DutyAssignmentQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyAssignmentGroup" ADD CONSTRAINT "DutyAssignmentGroup_dutyDefinitionId_fkey" FOREIGN KEY ("dutyDefinitionId") REFERENCES "DutyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyAssignmentGroupMember" ADD CONSTRAINT "DutyAssignmentGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DutyAssignmentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyAssignmentGroupMember" ADD CONSTRAINT "DutyAssignmentGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyRuntimeState" ADD CONSTRAINT "DutyRuntimeState_dutyDefinitionId_fkey" FOREIGN KEY ("dutyDefinitionId") REFERENCES "DutyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyTask" ADD CONSTRAINT "DutyTask_dutyDefinitionId_fkey" FOREIGN KEY ("dutyDefinitionId") REFERENCES "DutyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyTask" ADD CONSTRAINT "DutyTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMonthlyDutyStat" ADD CONSTRAINT "UserMonthlyDutyStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyPoll" ADD CONSTRAINT "DutyPoll_dutyDefinitionId_fkey" FOREIGN KEY ("dutyDefinitionId") REFERENCES "DutyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyPoll" ADD CONSTRAINT "DutyPoll_runtimeStateId_fkey" FOREIGN KEY ("runtimeStateId") REFERENCES "DutyRuntimeState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMonthAmount" ADD CONSTRAINT "PaymentMonthAmount_setByUserId_fkey" FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
