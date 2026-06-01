class UserMonthlyDutyStatRepository {
  async findByMonthKey(_monthKey) {
    throw new Error("Not implemented");
  }

  async incrementBadDuty(_userId, _monthKey) {
    throw new Error("Not implemented");
  }

  async findOffenders(_monthKey, _threshold) {
    throw new Error("Not implemented");
  }
}

module.exports = { UserMonthlyDutyStatRepository };
