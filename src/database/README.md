# Database Layer Structure

## Folder Tree

src/database/

- client/
  - prismaClient.js
- repositories/
  - interfaces/
    - index.js
    - adminRepository.interface.js
    - chatSettingsRepository.interface.js
    - commandCatalogRepository.interface.js
    - dutyAssignmentGroupMemberRepository.interface.js
    - dutyAssignmentGroupRepository.interface.js
    - dutyAssignmentQueueRepository.interface.js
    - dutyDefinitionRepository.interface.js
    - dutyPollRepository.interface.js
    - dutyRuntimeStateRepository.interface.js
    - dutyTaskRepository.interface.js
    - paymentMonthAmountRepository.interface.js
    - paymentSettingsRepository.interface.js
    - roomMemberRepository.interface.js
    - roomRepository.interface.js
    - userMonthlyDutyStatRepository.interface.js
    - userRepository.interface.js
  - prisma/
    - index.js
    - adminRepository.js
    - chatSettingsRepository.js
    - commandCatalogRepository.js
    - dutyAssignmentGroupMemberRepository.js
    - dutyAssignmentGroupRepository.js
    - dutyAssignmentQueueRepository.js
    - dutyDefinitionRepository.js
    - dutyPollRepository.js
    - dutyRuntimeStateRepository.js
    - dutyTaskRepository.js
    - paymentMonthAmountRepository.js
    - paymentSettingsRepository.js
    - roomMemberRepository.js
    - roomRepository.js
    - userMonthlyDutyStatRepository.js
    - userRepository.js

## Repository Responsibilities

- UserRepository: user lifecycle persistence, active-user lookups, telegram id lookups.
- AdminRepository: admin membership persistence and role list lookups.
- ChatSettingsRepository: group-level settings persistence (chat id, timezone, language).
- DutyDefinitionRepository: duty definition CRUD and active duty discovery.
- DutyAssignmentQueueRepository: queue membership and ordered position management.
- DutyAssignmentGroupRepository: pair/group assignment set management.
- DutyAssignmentGroupMemberRepository: group member linkage persistence.
- DutyRuntimeStateRepository: current duty state and due-rotation lookups.
- DutyTaskRepository: per-duty task list persistence and ordering.
- DutyPollRepository: poll lifecycle persistence and unresolved poll querying.
- UserMonthlyDutyStatRepository: month-scoped accountability counters.
- RoomRepository: room catalog persistence and active room querying.
- RoomMemberRepository: user-to-room ownership mapping persistence.
- PaymentSettingsRepository: singleton payment configuration persistence.
- PaymentMonthAmountRepository: per-month payment amount history and retrieval.
- CommandCatalogRepository: persisted command registry and visibility filtering.
