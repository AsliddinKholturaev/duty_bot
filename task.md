# OnDuty Bot Project Specification

## 1. Purpose

This project is a Telegram group bot for managing shared-flat responsibilities.

The current bot already supports a simple 48-hour kitchen duty rotation using a JSON file database.

The target version must become a dynamic, database-driven household management bot with:

- multiple duty types
- flexible schedules
- voting before duty handover
- room ownership tracking
- monthly payment reminders
- admin commands for changing settings without editing code
- a visible command list inside the bot

This document is the source of truth for implementation.

## 2. Current State

Current codebase status:

- runtime: Node.js, CommonJS
- bot library: `node-telegram-bot-api`
- scheduling: `node-cron` + `setInterval`
- storage: `lowdb` with `db.json`
- current business logic: one rotating kitchen duty list

Current implemented behavior:

- `/start` initializes bot and first admin
- `/add`, `/addid`, `/join`, `/remove` manage a single duty user list
- `/list`, `/duty`, `/skip`, `/swap` manage/view the current kitchen duty rotation
- duty changes every 48 hours
- reminders are sent on duty change day

Current limitation:

- only one duty type exists
- users and settings are not normalized
- schedules are hardcoded
- no voting flow exists
- no room ownership structure exists
- no payment notification structure exists
- no dynamic duty definitions exist
- still uses file-based JSON storage

## 3. Product Goal

Build a flexible household-duty Telegram bot where all key entities are stored in a real database and can be managed through admin commands.

The bot must support several parallel processes:

1. rotating kitchen/trash duty every 48 hours
2. rotating bathroom/toilet duty every 2 weeks with 2 assigned people
3. weekly room-cleaning reminders for room owners
4. monthly flat-payment reminders on the 13th and 15th
5. pre-handover anonymous voting for duty completion

The system must be dynamic enough so that new duty types can be added later without changing the core architecture.

## 4. Main Functional Requirements

### 4.1 Duty Type A: Kitchen and Trash

This is the current duty flow and should remain supported.

Rules:

- one person is assigned at a time
- rotation happens every 48 hours
- this duty has a duty list / rotation queue
- before the duty changes, a poll is sent 2 to 3 hours earlier
- the poll asks whether the current duty person completed all required tasks
- if positive votes are greater than negative votes, rotation proceeds to the next person
- if negative votes are greater than positive votes, or the result is a tie, the same person remains on duty for the next 48 hours

Example poll meaning:

- `Does @username clean the kitchen and take out the trash?`

Task-list behavior for this duty type:

- this duty type can have multiple configurable tasks
- admin can add, remove, and list tasks from commands
- reminder message should include task list when tasks exist
- if no task is configured, reminder should still be sent with generic duty text

### 4.2 Duty Type B: Bathroom and Toilet

Rules:

- two people are assigned at a time
- rotation happens every 2 weeks
- this duty has its own duty list / rotation queue
- before the duty changes, a poll is sent 2 to 3 hours earlier
- the poll asks whether those two people completed the bathroom/toilet cleaning tasks
- if positive votes are greater than negative votes, the next pair becomes responsible
- if negative votes are greater than positive votes, or the result is a tie, the same pair remains responsible for the next 2 weeks

Task-list behavior for this duty type:

- this duty type can have multiple configurable tasks
- if tasks are configured, include them in reminder/announcement message
- if no tasks are configured, send default duty message like `Clean bathroom and toilet`

### 4.3 Duty Type C: Room Cleaning Reminder

This is not a rotating shared duty. It is a reminder flow.

Rules:

- reminder is sent every week on Saturday and Sunday
- there are 4 rooms
- every room has one or more owners
- roommates clean their own rooms
- the bot must notify the room owners by username
- admin can assign users to rooms
- admin can move a user to another room with a command like `/put <userId> room1`
- each room must maintain its own member list in the database

Example message meaning:

- `Room cleaning reminder: @user1 @user2 please clean room1.`

Task-list behavior for this duty type:

- room reminder duty type may optionally have generic room-clean tasks
- if such tasks exist, include them in room reminder text
- if no tasks exist, send reminder without task list

### 4.4 Duty Task Management (Clarification)

`Update duty` in this project means updating task items inside an existing duty type.

It does not mean creating a new duty type every time.

Rules:

- each duty type can own zero or more task items
- task items are stored in database
- admin can add/remove tasks by selecting duty type enum code
- if a duty type has no tasks, bot sends duty/reminder message without task list
- if tasks exist, bot includes numbered task list in reminder and duty-related messages

Duty type enum constants (fixed set for first implementation):

- `KITCHEN_TRASH`
- `BATHROOM_TOILET`
- `ROOM_CLEANING`
- `FLAT_PAYMENT` (usually no task list, but kept for consistent API)

### 4.5 Monthly Flat Payment Reminder

Rules:

- on the 13th day of every month, send a reminder that money will be collected in 2 days
- on the 13th day, bot must also request the per-person amount for the current month from admin
- if admin provides a new amount, bot saves it as the current month amount
- if admin does not provide a new amount, bot uses the previously saved amount
- on the 15th day of every month, send the actual payment request
- on the 15th day, payment request message must include per-person amount
- on the 15th day, payment request message must mention all active users by username
- payment destination must be configurable
- payment destination can be either:
  - plastic card number
  - cash note / cash instruction
- payment settings must be stored in the database
- monthly per-person amount must be stored in the database
- admin must be able to update payment details from bot commands

Monthly payment amount flow:

1. On day 13, bot sends a message to admin to input per-person amount for that month.
2. Admin can reply with amount input or use command `/payment-per <amount>`.
3. Bot validates and saves the amount for that month.
4. If no new amount is saved before day 15, bot falls back to previously saved amount.
5. On day 15, bot sends payment collection message with the resolved amount and all usernames.

Example messages:

- `Reminder: in 2 days we will collect flat payment. Please be ready.`
- `Admin action needed: send this month payment per person, for example /payment-per 60.`
- `Today is payment day. For each person 60 USD. @user1 @user2 @user3 please transfer to card XXXX or give cash as configured.`

### 4.6 Monthly badDuty Tracking and Worst-Duty Notification

Goal:

- track users who failed or delayed duty handover in the current month

Rules:

- when vote result causes the same assignee(s) to stay on duty for the next cycle, each retained assignee gets `badDuty +1`
- this applies across all duty types that use duty-assignee handover logic
- monthly counting scope is `YYYY-MM`
- at the start of each new month, monthly `badDuty` count must be treated as `0`
- old months must remain queryable as history
- admin can request current-month offenders with `/badDuties`

Report behavior:

- `/badDuties` should return users with monthly `badDuty >= 2`
- response should include username/display name and count
- message style should be similar to:
  - `1. Username1 this month 3 times does not do duty on time, thus contributes to flat pollution.`
  - `2. Username2 this month 2 times does not do duty on time, thus contributes to flat pollution.`

Notes:

- tie and reject both count as failed handover when current assignee remains
- approved handover does not increase `badDuty`

## 5. Voting and Handover Rules

Voting is required for duty types that rotate responsibility.

Applies to:

- kitchen/trash duty
- bathroom/toilet duty

Does not apply to:

- room cleaning reminders
- monthly payment reminders

Voting flow:

1. Bot calculates the next planned handover time.
2. Bot sends an anonymous poll 2 to 3 hours before handover.
3. Poll remains open for a configurable duration.
4. Bot evaluates the result when the poll closes or when the handover time is reached.
5. If `yes > no`, move to the next assignee or next pair.
6. If `yes === no`, keep the same assignee(s) for the next cycle.
7. If `no > yes`, keep the same assignee(s) for the next cycle.
8. Bot sends the resulting status message to the group.
9. If assignee(s) are kept due to tie/reject, increment monthly `badDuty` for each retained assignee.

Important policy:

- a tie is treated as failure to approve
- failed approval means duty does not rotate
- the current assignee remains responsible for the next full cycle
- failed approval that keeps current assignee(s) increases monthly `badDuty` by 1 per retained assignee

## 6. Required Dynamic Architecture

The new version must avoid hardcoding each duty directly into one service.

The system should support a generic concept of `duty definition` with per-duty configuration.

Minimum dynamic capability:

- add a new duty type through database/config structure
- enable or disable a duty
- change schedule without code changes where possible
- store assignment mode per duty
- store reminder and poll configuration per duty
- store editable task list per duty type

Recommended architectural direction:

- separate duty definitions from runtime duty state
- separate people, rooms, schedules, and payment settings
- keep scheduler orchestration separate from domain rules
- keep Telegram command handlers thin
- move core business rules into services

## 7. Target Data Model

The project will move from `db.json`/`lowdb` to a real database.

Database choice can be finalized during implementation. Good options:

- PostgreSQL with Prisma
- SQLite with Prisma for local-first development

Recommended approach:

- start with Prisma
- use SQLite during development for simplicity
- keep schema portable so PostgreSQL can be adopted later

### 7.1 Core Entities

#### User

Represents a Telegram member known to the bot.

Fields:

- `id` internal database id
- `telegramUserId` Telegram numeric user id
- `username`
- `firstName`
- `lastName`
- `isActive`
- `createdAt`
- `updatedAt`

#### Admin

Represents bot admins.

Fields:

- `id`
- `userId`
- `createdAt`

#### ChatSettings

Global Telegram group settings.

Fields:

- `id`
- `telegramChatId`
- `title`
- `timezone`
- `language`
- `createdAt`
- `updatedAt`

#### DutyDefinition

Defines a duty type.

Fields:

- `id`
- `code` unique string like `kitchen`, `bathroom`, `room_reminder`, `flat_payment`
- `name`
- `description`
- `category` enum: `ROTATION`, `ROOM_REMINDER`, `PAYMENT_REMINDER`
- `isActive`
- `assignmentMode` enum: `SINGLE`, `PAIR`, `ROOM`, `NONE`
- `rotationIntervalHours` nullable
- `rotationIntervalDays` nullable
- `scheduleCron` nullable
- `requiresPoll`
- `pollLeadHours` nullable
- `pollDurationMinutes` nullable
- `tieKeepsCurrent`
- `failureKeepsCurrent`
- `metadata` JSON field for extensibility
- `createdAt`
- `updatedAt`

#### DutyAssignmentQueue

Stores members in a duty queue.

Fields:

- `id`
- `dutyDefinitionId`
- `userId`
- `position`
- `isActive`

For pair duties, queue logic can either:

- use consecutive users as a pair, or
- use explicit assignment groups

Preferred design:

- support `DutyAssignmentGroup` for future flexibility

#### DutyAssignmentGroup

Used for pair or group-based duties.

Fields:

- `id`
- `dutyDefinitionId`
- `name`
- `position`
- `isActive`

#### DutyAssignmentGroupMember

Fields:

- `id`
- `groupId`
- `userId`

#### DutyRuntimeState

Stores the current state of each duty.

Fields:

- `id`
- `dutyDefinitionId`
- `currentQueuePosition` nullable
- `currentGroupPosition` nullable
- `currentStartedAt`
- `nextRotationAt`
- `lastReminderAt`
- `lastPollAt`
- `status` enum: `ACTIVE`, `WAITING_VOTE`, `PAUSED`
- `updatedAt`

#### DutyTask

Stores task items for each duty type.

Fields:

- `id`
- `dutyDefinitionId`
- `taskText`
- `position`
- `isActive`
- `createdByUserId` nullable
- `createdAt`
- `updatedAt`

#### UserMonthlyDutyStat

Stores monthly accountability counters per user.

Fields:

- `id`
- `userId`
- `monthKey` format `YYYY-MM`
- `badDutyCount` default `0`
- `lastIncrementedAt` nullable
- `updatedAt`

#### DutyPoll

Stores anonymous poll history and decisions.

Fields:

- `id`
- `dutyDefinitionId`
- `runtimeStateId`
- `telegramPollId`
- `telegramMessageId`
- `question`
- `yesVotes`
- `noVotes`
- `openedAt`
- `closesAt`
- `resolvedAt`
- `result` enum: `APPROVED`, `REJECTED`, `TIED`, `EXPIRED`
- `decisionApplied`

#### Room

Represents a flat room.

Fields:

- `id`
- `code` like `room1`, `room2`, `room3`, `room4`
- `name`
- `isActive`
- `createdAt`
- `updatedAt`

#### RoomMember

Links users to rooms.

Fields:

- `id`
- `roomId`
- `userId`
- `isOwner`
- `createdAt`

#### PaymentSettings

Stores payment reminder configuration.

Fields:

- `id`
- `isActive`
- `reminderDayOfMonth` default `13`
- `collectionDayOfMonth` default `15`
- `paymentMode` enum: `CARD`, `CASH`, `CARD_OR_CASH`
- `cardHolderName` nullable
- `cardNumberMasked` nullable
- `cashInstruction` nullable
- `note` nullable
- `defaultPerPersonAmount` nullable
- `amountCurrency` default `USD`
- `lastConfirmedAmountMonth` nullable (format `YYYY-MM`)
- `updatedAt`

#### PaymentMonthAmount

Stores payment amount history per month.

Fields:

- `id`
- `monthKey` format `YYYY-MM`
- `perPersonAmount`
- `currency`
- `source` enum: `ADMIN_REPLY`, `COMMAND`, `FALLBACK`
- `setByUserId` nullable
- `setAt`
- `note` nullable

#### CommandCatalog

Optional persisted command registry if command descriptions should also be dynamic.

If not persisted, it can be generated from code.

## 8. Minimum Database Migration Goals

Phase-one migration requirements:

- stop depending on `lowdb` as the source of truth
- preserve current users/admins/chat information
- seed the current kitchen duty from existing JSON data
- introduce database schema and migration scripts
- keep data access behind repository/service modules

Migration notes:

- old `db.json` can remain temporarily for import only
- migration script should read old JSON and seed initial records
- after migration, bot should read from database only

## 9. Target Command Surface

All important operational changes should be manageable through bot commands.

### 9.1 General Commands

- `/start` initialize bot and bind group/admin if not initialized
- `/commands` show all commands and descriptions
- `/help` alias of `/commands`
- `/status` show overall bot status and active duties

### 9.2 User and Admin Commands

- `/adduser` add or register a user
- `/removeuser <telegramUserId>` remove a user
- `/admins` list admins
- `/addadmin <telegramUserId>` add admin
- `/removeadmin <telegramUserId>` remove admin
- `/users` list users

### 9.3 Duty Definition Commands

- `/duties` list all duty definitions
- `/dutyshow <code>` show duty details
- `/dutycreate ...` create a new duty definition
- `/dutyenable <code>` enable a duty
- `/dutydisable <code>` disable a duty
- `/dutysetinterval <code> <hours|days>` update rotation interval
- `/dutysetpoll <code> <leadHours> <durationMinutes>` update poll settings
- `/dutysetcron <code> <cron>` set cron for reminder-based duties
- `/add-task "<taskText>" <dutyTypeEnum>` add task item to a duty type
- `/remove-task <taskId> <dutyTypeEnum>` remove task item from a duty type
- `/tasks <dutyTypeEnum>` list task items for a duty type
- `/clear-tasks <dutyTypeEnum>` remove all tasks from that duty type

### 9.4 Kitchen Duty Commands

- `/kitchen` show current kitchen duty
- `/kitchenlist` show kitchen queue
- `/kitchenadd <userId>` add to kitchen queue
- `/kitchenremove <userId>` remove from kitchen queue
- `/kitchenskip` skip to next assignee
- `/kitchenswap` swap current with next

### 9.5 Bathroom Duty Commands

- `/bathroom` show current bathroom duty pair
- `/bathroomlist` show bathroom queue or groups
- `/bathroomadd <userId>` add to bathroom pool
- `/bathroomremove <userId>` remove from bathroom pool
- `/bathroompair <userId1> <userId2>` explicitly create/update a pair if needed
- `/bathroomskip` force next pair

### 9.6 Room Commands

- `/rooms` list rooms and owners
- `/roomshow <roomCode>` show one room
- `/roomcreate <roomCode> <name>` create room if needed
- `/roomdelete <roomCode>` deactivate/delete room if allowed
- `/put <userId> <roomCode>` assign or move user to room
- `/roomremove <userId>` remove user from room

### 9.7 Payment Commands

- `/payment` show current payment settings
- `/payment-per <amount>` set or update current month per-person amount (example: `/payment-per 60`)
- `/payment-per <amount> <currency>` set amount with currency if needed
- `/payment-amount` show active amount that will be used on the 15th
- `/payment-history [months]` show recent month amount history
- `/paymentcard <cardNumber> [holderName]` update card details
- `/paymentcash <instruction>` update cash details
- `/paymentmode <CARD|CASH|CARD_OR_CASH>` change payment mode
- `/paymentday <reminderDay> <collectionDay>` update payment dates

### 9.8 Admin/Debug Commands

- `/forcerotate <dutyCode>` force duty rotation
- `/forcepoll <dutyCode>` create duty poll immediately
- `/resolvepoll <dutyCode>` manually resolve current poll if needed
- `/reload` reload configuration or cached state if applicable

### 9.9 Accountability Commands

- `/badDuties` show current-month users with `badDuty >= 2`
- `/badDuties <YYYY-MM>` show offenders for selected month (optional extension)

Final command naming can be refined during implementation, but the bot must always expose a visible command reference through `/commands`.

## 10. Message Requirements

Messages should be consistent, readable, and easy to localize later.

Minimum message categories:

- duty announcement messages
- reminder messages
- poll question messages
- poll result messages
- room reminder messages
- payment reminder messages
- monthly accountability report messages
- command help messages
- validation and error messages

Task rendering rules:

- when duty type has tasks, include numbered task list
- when duty type has no tasks, send concise default duty text without list

Recommended structure:

- central message builder layer
- templates grouped by feature
- avoid hardcoding long strings inside command handlers

## 11. Scheduler Requirements

The current `setInterval` approach should be reduced or replaced with a clearer scheduling model.

Target scheduler behavior:

- one scheduler layer checks due jobs regularly
- cron-based reminders for weekly/monthly notifications
- deadline-based execution for rotation duties and poll lead times
- all duty timing should respect configured timezone
- monthly accountability window must roll over automatically on first day of month

Recommended approach:

- use database timestamps for `nextRotationAt`, `nextPollAt`, `nextReminderAt`
- run a periodic worker every minute
- run feature-specific handlers based on due events
- keep schedule calculation in domain services, not directly in command handlers
- use monthly keyed stats (`YYYY-MM`) so new month starts at zero without deleting history

## 12. Suggested Codebase Refactor Direction

Current codebase is small, so implementation should evolve it into clearer modules.

Suggested target structure:

```text
src/
	bot/
		registerBotHandlers.js
	commands/
		registerCommands.js
		commandCatalog.js
	config/
		env.js
		constants.js
	db/
		client.js
		migrations/
		seed/
	domain/
		duties/
			dutyService.js
			dutyScheduler.js
			dutyPollService.js
			dutyRepository.js
		rooms/
			roomService.js
			roomRepository.js
		payments/
			paymentService.js
			paymentRepository.js
		users/
			userService.js
			userRepository.js
	jobs/
		registerSchedulers.js
	messages/
		dutyMessages.js
		roomMessages.js
		paymentMessages.js
		helpMessages.js
```

This structure is a direction, not a strict final folder layout.

## 13. Feature Breakdown

### Feature 1: Foundation and Database Migration

Goal:

- replace JSON-file persistence with a database-backed persistence layer

Deliverables:

- database setup
- schema design
- migration scripts
- seed/import from existing `db.json`
- repository layer for users/admins/chat settings

### Feature 2: Generic Duty Engine

Goal:

- support multiple duty definitions with shared lifecycle logic

Deliverables:

- duty definitions table/model
- duty task table/model
- runtime state table/model
- queue/group assignment support
- generic rotation resolver
- dynamic schedule calculation

### Feature 3: Kitchen Duty Migration

Goal:

- move current kitchen duty onto the new generic duty engine

Deliverables:

- kitchen duty seed data
- kitchen commands adapted to new architecture
- 48-hour rotation fully preserved

### Feature 4: Bathroom Duty

Goal:

- add pair-based 2-week bathroom/toilet duty

Deliverables:

- pair/group assignment model
- bathroom commands
- bathroom reminders and messages
- bathroom rotation logic

### Feature 5: Polling and Approval Flow

Goal:

- prevent handover until community approves duty completion

Deliverables:

- anonymous poll creation
- poll persistence
- poll result evaluation
- tie/failure retention logic
- badDuty increment logic when assignees are retained
- final decision messaging

### Feature 10: Monthly Accountability Reporting

Goal:

- surface users with repeated duty delays/failures in current month

Deliverables:

- monthly user duty-stat model
- `/badDuties` command
- monthly rollover behavior
- formatted offender report message

### Feature 6: Room Ownership and Room Cleaning Reminders

Goal:

- manage rooms and notify room owners weekly

Deliverables:

- rooms table/model
- room member assignments
- `/put` and related room commands
- weekly Saturday/Sunday reminders

### Feature 7: Monthly Payment Reminders

Goal:

- manage monthly flat-payment reminders dynamically

Deliverables:

- payment settings table/model
- monthly per-person amount model and history
- reminder jobs for 13th and 15th
- day-13 admin input request for monthly amount
- day-15 payment message with resolved amount and all usernames
- fallback logic to previous saved amount if month amount is not updated
- commands to update payment destination and rules

### Feature 8: Command Discoverability

Goal:

- make the bot self-documenting for admins and users

Deliverables:

- `/commands`
- grouped help text with descriptions
- role-aware command visibility if needed

### Feature 9: Stability and Observability

Goal:

- make the bot safer to operate in production

Deliverables:

- structured logging
- validation for commands
- clearer error handling
- idempotent scheduler behavior
- recovery for missed jobs after restart

## 14. Step-by-Step Implementation Plan

### Step 1: Document Current Behavior and Freeze Baseline

Tasks:

- inspect existing command behavior
- inspect current db shape
- preserve current kitchen rotation behavior as reference
- define env/config requirements

Exit criteria:

- current behavior is fully understood and documented

### Step 2: Introduce Database Layer

Tasks:

- choose Prisma + SQLite initially
- add schema
- add migrations
- add database client
- add seed/import script from `db.json`

Exit criteria:

- bot can read users/admins/chat settings from database

### Step 3: Refactor Current Kitchen Duty Into New Domain Layer

Tasks:

- move kitchen-specific logic out of raw `db.data`
- create repositories and services
- keep current commands working through the new layer

Exit criteria:

- current kitchen duty works with database persistence

### Step 4: Introduce Generic Duty Definitions and Runtime State

Tasks:

- create `DutyDefinition` and `DutyRuntimeState`
- support single-assignee rotation
- calculate `nextRotationAt`
- register scheduled execution path

Exit criteria:

- kitchen duty runs as a generic duty definition

### Step 5: Add Poll Infrastructure

Tasks:

- store polls in database
- create anonymous Telegram polls
- map poll result back to duty instance
- resolve approval logic at handover time

Exit criteria:

- kitchen duty handover depends on poll result

### Step 6: Add Bathroom/Toilet Pair Duty

Tasks:

- implement pair/group assignment model
- create bathroom duty seed/config
- add bathroom commands
- integrate bathroom poll approval flow

Exit criteria:

- bathroom duty rotates every 2 weeks with 2 assignees

### Step 7: Add Room Management and Weekly Room Reminders

Tasks:

- add rooms and room ownership models
- implement `/put` and room commands
- add Saturday/Sunday room reminder jobs

Exit criteria:

- room owners can be assigned and reminded correctly

### Step 8: Add Monthly Payment Feature

Tasks:

- add payment settings storage
- implement payment commands
- add 13th/15th reminder jobs

Exit criteria:

- monthly payment messages are sent using dynamic payment settings

### Step 9: Add `/commands` and Help Catalog

Tasks:

- create centralized command catalog
- generate help text from command metadata
- expose descriptions clearly in Telegram

Exit criteria:

- `/commands` returns the full supported command list with descriptions

### Step 10: Hardening and Cleanup

Tasks:

- improve validation
- improve logs
- remove obsolete lowdb-only paths
- verify restart behavior
- verify poll edge cases

Exit criteria:

- bot is stable enough for real group usage

## 15. Acceptance Criteria

The implementation can be considered successful when all items below are true:

- kitchen duty is database-backed and rotates every 48 hours
- kitchen handover depends on anonymous approval poll
- bathroom duty supports 2-person assignment and 2-week rotation
- bathroom handover depends on anonymous approval poll
- room reminders are sent every Saturday and Sunday
- room owners can be assigned and changed through commands
- payment reminders are sent on the 13th and 15th of each month
- bot can request and store per-person amount on the 13th
- `/payment-per` can update per-person amount manually at any time
- on the 15th, payment message includes per-person amount and all active usernames
- if month amount is not updated, previously saved amount is used
- when failed vote keeps same assignee(s), their monthly `badDuty` increases by 1
- `/badDuties` returns users with current-month `badDuty >= 2`
- monthly `badDuty` resets logically each new month while preserving history
- payment destination is configurable through commands
- bot exposes `/commands` with descriptions
- duty definitions and key settings are database-driven
- admin can manage per-duty task list using commands and duty type enum
- admin can manage the system without editing source files for routine changes

## 16. Risks and Design Notes

Important implementation risks:

- Telegram poll lifecycle handling may need careful mapping between poll ids and message ids
- bot restarts must not cause duplicate poll creation or duplicate rotation
- timezone handling must be explicit
- pair-duty queue logic must be defined clearly to avoid ambiguous next-pair selection
- command parsing should stay simple and reliable

Open design choices to settle during implementation:

- exact database choice for production: SQLite vs PostgreSQL
- exact timezone used by the group
- whether bathroom duty pairs are fixed groups or derived from queue order
- whether `/commands` should show all commands or only commands allowed for that user role
- whether payment text should support multilingual templates

## 17. Recommended First Implementation Order

To minimize risk, implementation should begin in this order:

1. database layer and migration from `db.json`
2. kitchen duty migration to the new architecture
3. poll infrastructure
4. bathroom duty
5. rooms and room reminders
6. payment reminders
7. `/commands` catalog
8. cleanup and production hardening

## 18. Non-Goals for the First Iteration

The first implementation should not overcomplicate the system with:

- web dashboard
- multi-group support unless explicitly needed later
- advanced analytics
- per-user notification preferences
- automatic language switching

These can be added later if needed.

## 19. Final Summary

This project will evolve from a simple JSON-based kitchen duty bot into a dynamic household operations bot with:

- database-backed storage
- configurable duty definitions
- kitchen duty rotation
- bathroom/toilet pair rotation
- room ownership and weekly room reminders
- monthly payment reminders
- anonymous approval polls before duty handover
- admin-managed settings via Telegram commands
- a visible in-bot command reference

This `task.md` should guide the implementation sequence for the next development steps.
