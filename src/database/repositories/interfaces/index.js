const { AdminRepository } = require("./adminRepository.interface");
const {
  ChatSettingsRepository,
} = require("./chatSettingsRepository.interface");
const {
  CommandCatalogRepository,
} = require("./commandCatalogRepository.interface");
const {
  DutyAssignmentGroupMemberRepository,
} = require("./dutyAssignmentGroupMemberRepository.interface");
const {
  DutyAssignmentGroupRepository,
} = require("./dutyAssignmentGroupRepository.interface");
const {
  DutyAssignmentQueueRepository,
} = require("./dutyAssignmentQueueRepository.interface");
const {
  DutyDefinitionRepository,
} = require("./dutyDefinitionRepository.interface");
const { DutyPollRepository } = require("./dutyPollRepository.interface");
const {
  DutyRuntimeStateRepository,
} = require("./dutyRuntimeStateRepository.interface");
const { DutyTaskRepository } = require("./dutyTaskRepository.interface");
const {
  PaymentMonthAmountRepository,
} = require("./paymentMonthAmountRepository.interface");
const {
  PaymentSettingsRepository,
} = require("./paymentSettingsRepository.interface");
const { RoomMemberRepository } = require("./roomMemberRepository.interface");
const { RoomRepository } = require("./roomRepository.interface");
const {
  UserMonthlyDutyStatRepository,
} = require("./userMonthlyDutyStatRepository.interface");
const { UserRepository } = require("./userRepository.interface");
const { KitchenRepository } = require("./kitchenRepository.interface");

module.exports = {
  AdminRepository,
  ChatSettingsRepository,
  CommandCatalogRepository,
  DutyAssignmentGroupMemberRepository,
  DutyAssignmentGroupRepository,
  DutyAssignmentQueueRepository,
  DutyDefinitionRepository,
  DutyPollRepository,
  DutyRuntimeStateRepository,
  DutyTaskRepository,
  PaymentMonthAmountRepository,
  PaymentSettingsRepository,
  RoomMemberRepository,
  RoomRepository,
  UserMonthlyDutyStatRepository,
  UserRepository,
  KitchenRepository,
};
