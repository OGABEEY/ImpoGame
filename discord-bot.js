const {
    Client, GatewayIntentBits, Events, REST, Routes,
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle
} = require('discord.js');

// ==================== MATN YASOVCHI FUNKSIYALAR ====================

function plural(n, word) {
    return `${n} ta ${word}`;
}

/**
 * Jonli holat matnini yasaydi (Discord embed maydoni uchun).
 * @param {object|null} s
 * @returns {string}
 */
function buildStatusText(s) {
    if (!s) return '';

    const lines = [];

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

    return lines.join('\n');
}

function safeStatusText(getStats) {
    if (typeof getStats !== 'function') return '';
    try {
        return buildStatusText(getStats());
    } catch (e) {
        console.error('Discord: statistika olishda xato:', e.message);
        return '';
    }
}

/**
 * Taklif embed'ini yasaydi.
 * @param {Function} getStats
 * @param {string} gameUrl
 */
function buildInviteEmbed(getStats, gameUrl) {
    const embed = new EmbedBuilder()
        .setColor(0x7c5cff)
        .setTitle('🕵️ Josusni top')
        .setDescription(
            "Do'stlaringiz bilan xona yarating, kalit so'zga bog'liq so'zlarni yozib, " +
            "orangizdagi josusni toping!\n\n" +
            "⚠️ Maxfiy so'zni to'g'ridan-to'g'ri aytmang — josus darrov bilib oladi!"
        )
        .setURL(gameUrl);

    const status = safeStatusText(getStats);
    if (status) {
        embed.addFields({ name: '📊 Hozirgi holat', value: status });
    }

    embed.setFooter({ text: "Pastdagi tugmani bosib o'ynang" });
    return embed;
}

function buildQoidaEmbed() {
    return new EmbedBuilder()
        .setColor(0x7c5cff)
        .setTitle("📜 O'yin qoidalari")
        .addFields(
            { name: '👤 Ishtirokchi', value: "Maxfiy so'zni biladi. So'zga bog'liq so'z aytib, josusni topishi kerak." },
            { name: '🕵️ Josus', value: "So'zni bilmaydi. Boshqalarning gaplaridan so'zni topib, fosh bo'lmasligi kerak." },
            { name: '🔍 Detektiv', value: "Ishtirokchi, lekin bir marta istalgan o'yinchini tekshirib, josus yoki yo'qligini bilib oladi." },
            { name: '👻 Arvoh', value: "Ovozda chiqarilgan ishtirokchi. Chatga yoza olmaydi, lekin boshqa arvohlar bilan yozishadi." },
            { name: '🏆 G\'alaba', value: "Jamoa yutadi — josus fosh bo'lsa.\nJosus yutadi — tirik ishtirokchilar soni josuslar soniga tenglashsa." },
            { name: '⚠️ Diqqat', value: "Agar ishtirokchi maxfiy so'zni yozib yuborsa, josusga so'z ochib beriladi!" }
        );
}

function buildButtonRow(gameUrl) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("🎮 O'yinni ochish")
            .setStyle(ButtonStyle.Link)
            .setURL(gameUrl)
    );
}

// ==================== BOTNI ISHGA TUSHIRISH ====================

/**
 * Discord botni ishga tushiradi.
 * Kerakli environment variable'lar:
 *   DISCORD_TOKEN     - Discord Developer Portal > Bot > Token
 *   DISCORD_CLIENT_ID - Developer Portal > General Information > Application ID
 *   GAME_URL          - o'yin manzili (masalan https://impostergame-9uy1.onrender.com)
 *
 * @param {Function} getStats - serverdan jonli statistika qaytaruvchi funksiya
 */
function startDiscordBot(getStats) {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    const gameUrl = process.env.GAME_URL;

    if (!token || !clientId || !gameUrl) {
        console.log('DISCORD_TOKEN, DISCORD_CLIENT_ID yoki GAME_URL topilmadi — Discord bot ishga tushmadi.');
        return;
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    const commands = [
        new SlashCommandBuilder()
            .setName('impogame')
            .setDescription("Josusni top o'yinini ochish")
            .toJSON(),
        new SlashCommandBuilder()
            .setName('qoida')
            .setDescription("O'yin qoidalari va rollar")
            .toJSON(),
        new SlashCommandBuilder()
            .setName('holat')
            .setDescription("Saytda nechta odam va xona borligini ko'rish")
            .toJSON()
    ];

    client.once(Events.ClientReady, async (c) => {
        console.log(`Discord bot ishga tushdi (${c.user.tag}).`);
        try {
            const rest = new REST({ version: '10' }).setToken(token);
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.log('Discord: slash buyruqlar ro\'yxatdan o\'tkazildi.');
        } catch (err) {
            console.error('Discord: buyruqlarni ro\'yxatdan o\'tkazishda xato:', err.message);
        }
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        try {
            if (interaction.commandName === 'impogame') {
                await interaction.reply({
                    embeds: [buildInviteEmbed(getStats, gameUrl)],
                    components: [buildButtonRow(gameUrl)]
                });
                return;
            }

            if (interaction.commandName === 'qoida') {
                await interaction.reply({
                    embeds: [buildQoidaEmbed()],
                    components: [buildButtonRow(gameUrl)]
                });
                return;
            }

            if (interaction.commandName === 'holat') {
                const status = safeStatusText(getStats) || "Ma'lumot olinmadi.";
                const embed = new EmbedBuilder()
                    .setColor(0x34d399)
                    .setTitle('📊 Hozirgi holat')
                    .setDescription(status);
                await interaction.reply({ embeds: [embed], components: [buildButtonRow(gameUrl)] });
                return;
            }
        } catch (err) {
            console.error('Discord: buyruqni bajarishda xato:', err.message);
        }
    });

    // Bot serverga qo'shilganda birinchi matnli kanalga salom yozadi
    client.on(Events.GuildCreate, async (guild) => {
        try {
            const channel = guild.channels.cache.find(
                ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has('SendMessages')
            );
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(0x7c5cff)
                .setTitle('👋 Salom hammaga!')
                .setDescription(
                    "Men *Josusni top* o'yiniga taklif qilaman 🕵️\n\n" +
                    "Orangizda bitta josus bor — uni gaplaridan fosh eta olasizmi?\n\n" +
                    "O'ynash uchun `/impogame` deb yozing."
                );

            const status = safeStatusText(getStats);
            if (status) embed.addFields({ name: '📊 Hozirgi holat', value: status });

            await channel.send({ embeds: [embed], components: [buildButtonRow(gameUrl)] });
        } catch (err) {
            console.error('Discord: salomlashish xabarida xato:', err.message);
        }
    });

    client.on('error', (err) => console.error('Discord bot xatosi:', err.message));

    client.login(token).catch(err => {
        console.error("Discord botni ishga tushirib bo'lmadi:", err.message);
    });
}

module.exports = {
    startDiscordBot,
    buildStatusText,
    buildInviteEmbed,
    buildQoidaEmbed
};
