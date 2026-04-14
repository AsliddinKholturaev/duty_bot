function registerCommands({ bot, db, save, dutyService, dayjs }) {
  const {
    addUserToDuty,
    ensureAdmin,
    isAdmin,
    removeUserFromDuty,
    sendDutyMessage,
  } = dutyService;

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    if (!db.data.chatId) {
      db.data.chatId = chatId;

      if (!isAdmin(msg.from.id)) {
        db.data.admins.push(msg.from.id);
      }

      save();

      bot.sendMessage(chatId, "✅ Bot ishga tushdi. Siz admin bo'ldingiz.");
    } else {
      bot.sendMessage(chatId, "Bot allaqachon ishga tushirilgan.");
    }
  });

  bot.onText(/\/add(?:\s+(.+))?/, (msg) => {
    if (!ensureAdmin(msg)) {
      return;
    }

    let user = msg.reply_to_message?.from;

    if (!user && Array.isArray(msg.entities)) {
      const mentionEntity = msg.entities.find((e) => e.type === "text_mention");
      user = mentionEntity?.user;
    }

    if (!user) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ Foydalanuvchini aniqlab bo'lmadi. Quyidagilardan birini ishlating:\n1. Foydalanuvchi xabariga reply qilib /add yozing\n2. Foydalanuvchi /join yuborsin\n3. Admin /addid <telegram_user_id> ishlatsin",
      );
    }

    const result = addUserToDuty(user);

    if (result.added) {
      bot.sendMessage(
        msg.chat.id,
        `✅ @${result.username} navbatchilar ro'yxatiga qo'shildi.`,
      );
    } else {
      bot.sendMessage(
        msg.chat.id,
        "ℹ️ Bu foydalanuvchi allaqachon ro'yxatda bor.",
      );
    }
  });

  bot.onText(/\/join/, (msg) => {
    const result = addUserToDuty(msg.from);

    if (result.added) {
      bot.sendMessage(
        msg.chat.id,
        `✅ Siz navbatchilar ro'yxatiga qo'shildingiz: @${result.username}`,
      );
    } else {
      bot.sendMessage(
        msg.chat.id,
        "ℹ️ Siz allaqachon navbatchilar ro'yxatidasiz.",
      );
    }
  });

  bot.onText(/\/addid\s+(\d+)/, async (msg, match) => {
    if (!ensureAdmin(msg)) {
      return;
    }

    const userId = Number(match[1]);

    try {
      const member = await bot.getChatMember(msg.chat.id, userId);
      const user = member?.user;

      if (!user) {
        return bot.sendMessage(
          msg.chat.id,
          "Bu foydalanuvchi ushbu guruhda topilmadi.",
        );
      }

      const result = addUserToDuty(user);

      if (result.added) {
        bot.sendMessage(
          msg.chat.id,
          `✅ @${result.username} navbatchilar ro'yxatiga qo'shildi.`,
        );
      } else {
        bot.sendMessage(
          msg.chat.id,
          "ℹ️ Bu foydalanuvchi allaqachon ro'yxatda bor.",
        );
      }
    } catch (error) {
      bot.sendMessage(
        msg.chat.id,
        "ID orqali qo'shib bo'lmadi. Foydalanuvchi guruhda borligini tekshiring.",
      );
    }
  });

  bot.onText(/\/remove(?:\s+(\d+))?/, (msg, match) => {
    if (!ensureAdmin(msg)) {
      return;
    }

    let user = msg.reply_to_message?.from;

    if (!user && Array.isArray(msg.entities)) {
      const mentionEntity = msg.entities.find(
        (entity) => entity.type === "text_mention",
      );
      user = mentionEntity?.user;
    }

    const userId = user?.id || (match?.[1] ? Number(match[1]) : null);

    if (!userId) {
      return bot.sendMessage(
        msg.chat.id,
        "❌ O'chiriladigan foydalanuvchini aniqlab bo'lmadi. Quyidagilardan birini ishlating:\n1. Foydalanuvchi xabariga reply qilib /remove yozing\n2. Admin /remove <telegram_user_id> ishlatsin",
      );
    }

    const result = removeUserFromDuty(userId);

    if (!result.removed) {
      return bot.sendMessage(
        msg.chat.id,
        "ℹ️ Bu foydalanuvchi navbatchilar ro'yxatida topilmadi.",
      );
    }

    bot.sendMessage(
      msg.chat.id,
      `🗑 @${result.username} navbatchilar ro'yxatidan o'chirildi.`,
    );
  });

  bot.onText(/\/list/, (msg) => {
    if (!ensureAdmin(msg)) {
      return;
    }

    if (db.data.users.length === 0) {
      return bot.sendMessage(msg.chat.id, "Hali navbatchilar ro'yxati bo'sh.");
    }

    const text = db.data.users
      .map((u, i) => {
        const mark = i === db.data.currentIndex ? "👉" : " ";
        return `${mark} @${u.username} (ID: ${u.id})`;
      })
      .join("\n");

    bot.sendMessage(msg.chat.id, `📋 Navbatchilar ro'yxati:\n\n${text}`);
  });

  bot.onText(/\/duty/, (msg) => {
    sendDutyMessage(msg.chat.id, "🧹 Hozirgi navbatchi:");
  });

  bot.onText(/\/skip/, (msg) => {
    if (!ensureAdmin(msg)) {
      return;
    }

    const users = db.data.users;
    if (users.length === 0) {
      return bot.sendMessage(msg.chat.id, "Hali navbatchilar ro'yxati bo'sh.");
    }

    db.data.currentIndex = (db.data.currentIndex + 1) % users.length;
    db.data.lastUpdated = dayjs().format();

    save();

    sendDutyMessage(msg.chat.id, "⏭ Navbatchi o'tkazib yuborildi.");
  });

  bot.onText(/\/swap/, (msg) => {
    if (!ensureAdmin(msg)) {
      return;
    }

    const { users, currentIndex } = db.data;

    if (users.length < 2) {
      return bot.sendMessage(
        msg.chat.id,
        "🔁 Almashtirish uchun kamida 2 ta navbatchi kerak.",
      );
    }

    const nextIndex = (currentIndex + 1) % users.length;

    [users[currentIndex], users[nextIndex]] = [
      users[nextIndex],
      users[currentIndex],
    ];

    db.data.lastUpdated = dayjs().format();

    save();

    sendDutyMessage(msg.chat.id, "🔄 Navbatchi o'zgartirildi!");
  });
}

module.exports = {
  registerCommands,
};
