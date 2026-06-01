class CommandCatalogRepository {
  async findVisible(_visibility) {
    throw new Error("Not implemented");
  }

  async upsertByCommand(_command, _input) {
    throw new Error("Not implemented");
  }
}

module.exports = { CommandCatalogRepository };
