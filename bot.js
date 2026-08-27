const { Bot, InlineKeyboard } = require('grammy');

/**
 * Telegram botni ishga tushiradi.
 * Kerakli environment variable'lar (Render dashboard > Environment):
 *   BOT_TOKEN      - @BotFather bergan token
 *   BOT_USERNAME   - botning username'i, @ belgisisiz (masalan: ImposterUzBot)
 *   APP_SHORT_NAME - @BotFather /newapp orqali bergan qisqa nom (masalan: oyin)
 *
 * @param {Function} getStats - serverdan jonli statistika qaytaruvchi funksiya
 */
// O'zbekcha son + so'z
function plural(n, word) {
    return `${n} ta ${word}`;
}

/**
 * Jonli holat bloki matnini yasaydi.
 * @param {object|null} s - { online, totalRooms, waitingRooms, inGameRooms, playersInRooms }
 * @returns {string} Markdown matn (yoki bo'sh satr)
 */
function buildStatusBlock(s) {
    if (!s) return '';

    const lines = ['📊 *Hozirgi holat:*'];

    if (s.online > 0) {
        lines.push(`👥 ${plural(s.online, 'odam')} saytda onlayn`);
    } else {
        lines.push(`👥 Hozircha hech kim yo'q — birinchi bo'ling!`);
    }

    if (s.totalRooms === 0) {
        lines.push(`🚪 Ochiq xona yo'q — yangisini yarating`);
    } else {
        const parts = [];
        if (s.waitingRooms > 0) parts.push(`${s.waitingRooms} ta o'yinchi kutmoqda`);
        if (s.inGameRooms > 0) parts.push(`${s.inGameRooms} ta o'yin ketmoqda`);
        lines.push(`🚪 ${plural(s.totalRooms, 'xona')}: ${parts.join(', ')}`);
    }

    if (s.playersInRooms > 0) {
        lines.push(`🎮 ${plural(s.playersInRooms, "o'yinchi")} xonalarda`);
    }

    return '\n\n' + lines.join('\n');
}

/** getStats funksiyasini xavfsiz chaqiradi */
function safeStatusBlock(getStats) {
    if (typeof getStats !== 'function') return '';
    try {
        return buildStatusBlock(getStats());
    } catch (e) {
        console.error('Statistika olishda xato:', e.message);
        return '';
    }
}

const INVITE_BASE =
    "🕵️ *Josusni top*\n\n" +
    "Guruhdagi do'stlaringiz bilan xona yarating, kalit so'zga bog'liq so'zlarni chatga yozib, orangizdagi josusni toping!";

const INVITE_FOOTER = "\n\nBoshlash uchun pastdagi tugmani bosing 👇";

/** To'liq taklif matnini qaytaradi */
function buildInviteText(getStats) {
    return INVITE_BASE + safeStatusBlock(getStats) + INVITE_FOOTER;
}

/** Guruhga qo'shilganda yuboriladigan matn */
function buildWelcomeText(getStats) {
    return "👋 Salom hammaga!\n\n" +
        "Men *Josusni top* o'yiniga taklif qilaman — orangizda kim josus ekanini toping! 🕵️" +
        safeStatusBlock(getStats) +
        "\n\nIstalgan vaqt o'ynash uchun /impogame deb yozing yoki pastdagi tugmani bosing 👇";
}

function startTelegramBot(getStats) {
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

    // ---------- /impogame buyrug'i (guruh yoki shaxsiy chatda) ----------
    bot.command('impogame', async (ctx) => {
        await ctx.reply(buildInviteText(getStats), { parse_mode: 'Markdown', reply_markup: inviteKeyboard });
    });

    // ---------- /start buyrug'i (faqat shaxsiy chatda javob beradi) ----------
    bot.command('start', async (ctx) => {
        if (ctx.chat.type !== 'private') return;
        await ctx.reply(buildInviteText(getStats), { parse_mode: 'Markdown', reply_markup: inviteKeyboard });
    });

    // ---------- Bot guruhga qo'shilganda avtomatik taklif xabari ----------
    bot.on('message:new_chat_members', async (ctx) => {
        const botWasAdded = ctx.message.new_chat_members.some(
            member => member.username && member.username.toLowerCase() === botUsername.toLowerCase()
        );
        if (!botWasAdded) return;

        const welcomeText = buildWelcomeText(getStats);

        await ctx.reply(welcomeText, { parse_mode: 'Markdown', reply_markup: inviteKeyboard });
    });

    bot.catch((err) => console.error("Telegram bot xatosi:", err.message));

    bot.start().catch((err) => {
        console.error("Telegram botni ishga tushirib bo'lmadi:", err.message);
    });
    console.log(`Telegram bot ishga tushmoqda (@${botUsername})...`);
}

module.exports = { startTelegramBot, buildStatusBlock, buildInviteText, buildWelcomeText };
