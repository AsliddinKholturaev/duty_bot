const { PrismaAdminRepository } = require("./adminRepository");
const { PrismaChatSettingsRepository } = require("./chatSettingsRepository");
const {
  PrismaCommandCatalogRepository,
} = require("./commandCatalogRepository");
const {
  PrismaDutyAssignmentGroupMemberRepository,
} = require("./dutyAssignmentGroupMemberRepository");
const {
  PrismaDutyAssignmentGroupRepository,
} = require("./dutyAssignmentGroupRepository");
const {
  PrismaDutyAssignmentQueueRepository,
} = require("./dutyAssignmentQueueRepository");
const {
  PrismaDutyDefinitionRepository,
} = require("./dutyDefinitionRepository");
const { PrismaDutyPollRepository } = require("./dutyPollRepository");
const {
  PrismaDutyRuntimeStateRepository,
} = require("./dutyRuntimeStateRepository");
const { PrismaDutyTaskRepository } = require("./dutyTaskRepository");
const {
  PrismaPaymentMonthAmountRepository,
} = require("./paymentMonthAmountRepository");
const {
  PrismaPaymentSettingsRepository,
} = require("./paymentSettingsRepository");
const { PrismaRoomMemberRepository } = require("./roomMemberRepository");
const { PrismaRoomRepository } = require("./roomRepository");
const {
  PrismaUserMonthlyDutyStatRepository,
} = require("./userMonthlyDutyStatRepository");
const { PrismaUserRepository } = require("./userRepository");
const { PrismaKitchenRepository } = require("./kitchenRepository");

module.exports = {
  PrismaAdminRepository,
  PrismaChatSettingsRepository,
  PrismaCommandCatalogRepository,
  PrismaDutyAssignmentGroupMemberRepository,
  PrismaDutyAssignmentGroupRepository,
  PrismaDutyAssignmentQueueRepository,
  PrismaDutyDefinitionRepository,
  PrismaDutyPollRepository,
  PrismaDutyRuntimeStateRepository,
  PrismaDutyTaskRepository,
  PrismaPaymentMonthAmountRepository,
  PrismaPaymentSettingsRepository,
  PrismaRoomMemberRepository,
  PrismaRoomRepository,
  PrismaUserMonthlyDutyStatRepository,
  PrismaUserRepository,
  PrismaKitchenRepository,
};
