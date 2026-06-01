class PaymentMonthAmountRepository {
  async findByMonthKey(_monthKey) {
    throw new Error("Not implemented");
  }

  async findLatest() {
    throw new Error("Not implemented");
  }

  async upsertByMonthKey(_monthKey, _input) {
    throw new Error("Not implemented");
  }
}

module.exports = { PaymentMonthAmountRepository };
