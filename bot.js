const { Bot, InlineKeyboard } = require('grammy');

/**
 * Telegram botni ishga tushiradi.
 * Kerakli environment variable'lar (Render dashboard > Environment):
 *   BOT_TOKEN      - @BotFather bergan token
 *   BOT_USERNAME   - botning username'i, @ belgisisiz (masalan: ImposterUzBot)
 *   APP_SHORT_NAME - @BotFather /newapp orqali bergan qisqa nom (masalan: oyin)
 */
function startTelegramBot() {
    const token = process.env.BOT_TOKEN;
    const botUsername = process.env.BOT_USERNAME;
    const appShortName = process.env.APP_SHORT_NAME || 'oyin';

    if (!token || !botUsername) {
        console.log("BOT_TOKEN yoki BOT_USERNAME topilmadi — Telegram bot ishga tushmadi.");
        return;
    }

    const bot = new Bot(token);
    const gameLink = `https://t.me/${botUsername}/${appShortName}`;
    const inviteKeyboard = new InlineKeyboard().url("🎮 O'yinni ochish", gameLink);

    const inviteText =
        "🕵️ *Firibgarni top*\n\n" +
        "Guruhdagi do'stlaringiz bilan xona yarating, kalit so'zga bog'liq so'zlarni chatga yozib, orangizdagi firibgarni toping!\n\n" +
        "Boshlash uchun pastdagi tugmani bosing 👇";

    // ---------- /impogame buyrug'i (guruh yoki shaxsiy chatda) ----------
    bot.command('impogame', async (ctx) => {
        await ctx.reply(inviteText, { parse_mode: 'Markdown', reply_markup: inviteKeyboard });
    });

    // ---------- /start buyrug'i (faqat shaxsiy chatda javob beradi) ----------
    bot.command('start', async (ctx) => {
        if (ctx.chat.type !== 'private') return;
        await ctx.reply(inviteText, { parse_mode: 'Markdown', reply_markup: inviteKeyboard });
    });

    // ---------- Bot guruhga qo'shilganda avtomatik taklif xabari ----------
    bot.on('message:new_chat_members', async (ctx) => {
        const botWasAdded = ctx.message.new_chat_members.some(
            member => member.username && member.username.toLowerCase() === botUsername.toLowerCase()
        );
        if (!botWasAdded) return;

        const welcomeText =
            "👋 Salom hammaga!\n\n" +
            "Men *Firibgarni top* o'yiniga taklif qilaman — orangizda kim firibgar ekanini toping! 🕵️\n\n" +
            "Istalgan vaqt o'ynash uchun /impogame deb yozing yoki pastdagi tugmani bosing 👇";

        await ctx.reply(welcomeText, { parse_mode: 'Markdown', reply_markup: inviteKeyboard });
    });

    bot.catch((err) => console.error("Telegram bot xatosi:", err.message));

    bot.start().catch((err) => {
        console.error("Telegram botni ishga tushirib bo'lmadi:", err.message);
    });
    console.log(`Telegram bot ishga tushmoqda (@${botUsername})...`);
}

module.exports = { startTelegramBot };
