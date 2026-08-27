const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { startTelegramBot } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ==================== TASHRIFLAR STATISTIKASI ====================
// DIQQAT: bu ma'lumot server xotirasida saqlanadi. Render bepul tarifda
// server qayta ishga tushsa (deploy yoki uzoq uyqu) hisob nolga qaytadi.
const serverStartedAt = Date.now();
const visitStats = {
    totalVisits: 0,
    allVisitors: new Set(),      // barcha vaqt uchun noyob tashrifchilar
    peakOnline: 0,
    totalGames: 0,
    days: new Map()              // 'YYYY-MM-DD' -> { visits, visitors:Set, games, peakOnline }
};

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function getDayBucket(key = todayKey()) {
    if (!visitStats.days.has(key)) {
        visitStats.days.set(key, { visits: 0, visitors: new Set(), games: 0, peakOnline: 0 });
    }
    return visitStats.days.get(key);
}

function recordVisit(visitorId) {
    visitStats.totalVisits++;
    const day = getDayBucket();
    day.visits++;
    if (visitorId) {
        visitStats.allVisitors.add(visitorId);
        day.visitors.add(visitorId);
    }
}

function recordPeakOnline(count) {
    if (count > visitStats.peakOnline) visitStats.peakOnline = count;
    const day = getDayBucket();
    if (count > day.peakOnline) day.peakOnline = count;
}

function recordGamePlayed() {
    visitStats.totalGames++;
    getDayBucket().games++;
}

function buildStatsPayload() {
    const days = Array.from(visitStats.days.entries())
        .map(([date, d]) => ({
            date, visits: d.visits, uniqueVisitors: d.visitors.size,
            games: d.games, peakOnline: d.peakOnline
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30);

    const today = getDayBucket();
    return {
        online: onlineCount,
        activeRooms: rooms.size,
        today: { visits: today.visits, uniqueVisitors: today.visitors.size, games: today.games, peakOnline: today.peakOnline },
        allTime: {
            visits: visitStats.totalVisits,
            uniqueVisitors: visitStats.allVisitors.size,
            games: visitStats.totalGames,
            peakOnline: visitStats.peakOnline
        },
        serverUptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
        days
    };
}

app.use(express.static(path.join(__dirname, 'Public')));

// Uptime xizmatlari (UptimeRobot, cron-job.org) shu manzilni ping qiladi.
// Butun sahifani yuklamaydi — juda yengil javob qaytaradi.
app.get('/healthz', (req, res) => {
    res.status(200).json({
        ok: true,
        online: onlineCount,
        rooms: rooms.size,
        uptime: Math.floor(process.uptime())
    });
});

// Statistika (himoyalangan). ADMIN_KEY environment variable'ini o'rnating.
app.get('/stats.json', (req, res) => {
    const key = process.env.ADMIN_KEY;
    if (key && req.query.key !== key) {
        return res.status(403).json({ error: "Ruxsat yo'q. ?key=... ni qo'shing." });
    }
    res.json(buildStatsPayload());
});

// ==================== SO'ZLAR (KATEGORIYALAR BO'YICHA) ====================
const CATEGORIES = {
    aralash: {
        name: 'Aralash',
        words: ['Olma', 'Mashina', 'Sher', 'Shifokor', 'Futbol', "Tog'", 'Telefon', 'Kitob',
                'Dengiz', 'Qor', 'Non', 'Oyna', 'Chiroq', 'Kalit', 'Soat']
    },
    hayvonlar: {
        name: 'Hayvonlar',
        words: ['Sher', "Yo'lbars", 'Fil', 'Tulki', "Bo'ri", 'Ayiq', 'Quyon', 'Ilon',
                'Burgut', 'Delfin', 'Tuya', 'Maymun', 'Kirpi', 'Toshbaqa', 'Qurbaqa']
    },
    kasblar: {
        name: 'Kasblar',
        words: ['Shifokor', "O'qituvchi", 'Duradgor', 'Dehqon', 'Haydovchi', 'Uchuvchi',
                'Sartarosh', 'Oshpaz', 'Politsiya', "O't o'chiruvchi", 'Dasturchi', 'Rassom',
                'Muhandis', 'Jurnalist', 'Bog\'bon']
    },
    ovqatlar: {
        name: 'Ovqatlar',
        words: ['Osh', 'Somsa', 'Manti', 'Lag\'mon', 'Shashlik', 'Chuchvara', 'Norin',
                'Sho\'rva', 'Non', 'Halva', 'Qaymoq', 'Sutli kasha', 'Dimlama', 'Kabob', 'Plov']
    },
    joylar: {
        name: 'Joylar',
        words: ['Maktab', 'Kasalxona', 'Bozor', 'Stadion', 'Kutubxona', 'Aeroport', 'Vokzal',
                'Restoran', 'Muzey', 'Bog\'', 'Masjid', 'Do\'kon', 'Zavod', 'Plyaj', 'Tog\'']
    },
    texnika: {
        name: 'Texnika',
        words: ['Telefon', 'Kompyuter', 'Televizor', 'Kamera', 'Muzlatgich', 'Kir yuvish mashinasi',
                'Quloqchin', 'Klaviatura', 'Printer', 'Dron', 'Robot', 'Mikrofon', 'Proyektor',
                'Planshet', 'Zaryadlagich']
    }
};

// ==================== MAXFIY SO'Z OSHKOR BO'LISHINI ANIQLASH ====================
// O'zbek tilida turli apostrof belgilari ishlatiladi — hammasini bittaga keltiramiz
function normalizeUz(str) {
    return (str || '')
        .toLowerCase()
        .replace(/[\u2018\u2019\u02BB\u02BC\u0060\u00B4]/g, "'")  // ' ' ʻ ʼ ` ´  ->  '
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Xabarda maxfiy so'z aytilganmi?
 * - Ko'p so'zli kalit ("Kir yuvish mashinasi") uchun butun matndan qidiramiz
 * - Bir so'zli kalit uchun har bir so'zni tekshiramiz: qo'shimchali shakl ham hisoblanadi
 *   (olma -> olmalar, olmani, olmadan ...)
 */
function messageRevealsWord(message, secretWord) {
    const msg = normalizeUz(message);
    const word = normalizeUz(secretWord);
    if (!msg || !word) return false;

    // Ko'p so'zli kalit so'z
    if (word.includes(' ')) return msg.includes(word);

    // Juda qisqa so'zlar uchun faqat aniq moslik (noto'g'ri ishlamasligi uchun)
    const tokens = msg.split(/[^a-z0-9']+/).filter(Boolean);
    if (word.length <= 3) return tokens.includes(word);

    // Qo'shimchali shakllar ham oshkor hisoblanadi
    return tokens.some(t => t === word || t.startsWith(word));
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MIN_ROOM_SIZE = 3;
const MAX_ROOM_SIZE = 9;    // xonaga kira oladigan maksimal odam
const DEFAULT_ROOM_SIZE = 9;
const MAX_IMPOSTERS = 3;

// Har bir josus soni uchun kerakli minimal o'yinchi soni
const MIN_PLAYERS_FOR_IMPOSTERS = { 1: 3, 2: 5, 3: 7 };

// Saytdagi faol foydalanuvchilar
const ONLINE_ROOM = 'online-counter';
let onlineCount = 0;
function broadcastOnlineCount() {
    io.emit('onlineCount', { count: onlineCount, rooms: rooms.size });
}

// ==================== YUTUQLAR (ACHIEVEMENTS) ====================
const ACHIEVEMENTS = {
    firstWin:        { icon: '🎉', title: 'Birinchi g\'alaba',  desc: 'Birinchi marta g\'alaba qozondingiz' },
    imposterWin:     { icon: '🕵️', title: 'Mohir josus',    desc: 'Josus sifatida g\'alaba qozondingiz' },
    sherlock:        { icon: '🔍', title: 'Sherlock',           desc: 'Josusga to\'g\'ri ovoz berdingiz' },
    survivor:        { icon: '🛡️', title: 'Omon qolgan',       desc: 'Hech qachon susdirilmasdan g\'alaba qozondingiz' },
    hatTrick:        { icon: '🔥', title: 'Uch karra',          desc: 'Ketma-ket 3 marta g\'alaba qozondingiz' },
    ghostWhisperer:  { icon: '👻', title: 'Arvoh',              desc: 'Susdirilgan holda ham jamoangiz yutdi' },
    detective:       { icon: '🎖️', title: 'Detektiv ishi',     desc: 'Detektiv sifatida josusni tekshirdingiz' },
    veteran:         { icon: '⭐', title: 'Faxriy',             desc: 'Ushbu xonada 5 ta o\'yin o\'ynadingiz' }
};

/**
 * rooms: roomId -> {
 *   hostId,
 *   players: Map(socketId -> {
 *      nickname, isReady, isMuted, isImposter, isDetective,
 *      detectiveUsed, hasSpokenThisRound
 *   }),
 *   started, word, category, imposterIds: Set,
 *   settings: { imposterCount, detectiveEnabled, turnSeconds, voteSeconds, category },
 *   turnOrder: [socketId], turnIndex, turnTimer,
 *   roundNumber, voting, voteLockOpen,
 *   recap: [], messageCounter, reactions: Map(msgId -> Map(emoji -> Set(socketId))),
 *   leaderboard: Map(nickname -> { wins, games, achievements: Set, streak })
 * }
 */
const rooms = new Map();

// ==================== YORDAMCHI FUNKSIYALAR ====================

function generateRoomCode() {
    let code;
    do {
        code = '';
        for (let i = 0; i < 5; i++) code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
    } while (rooms.has(code));
    return code;
}

function defaultSettings() {
    return {
        imposterCount: 1,
        detectiveEnabled: true,
        turnSeconds: 30,
        voteSeconds: 30,
        category: 'aralash',
        maxPlayers: DEFAULT_ROOM_SIZE
    };
}

function getPlayersArray(room) {
    return Array.from(room.players.entries()).map(([id, p]) => ({
        id,
        nickname: p.nickname,
        isReady: p.isReady,
        isMuted: p.isMuted
    }));
}

const LOBBY_BROWSER = 'lobby-browser';

function getPublicRoomsList() {
    const list = [];
    rooms.forEach((room, roomId) => {
        if (!room.isPublic) return;
        const hostPlayer = room.players.get(room.hostId);
        list.push({
            roomId,
            name: room.roomName,
            hostName: hostPlayer ? hostPlayer.nickname : '?',
            playerCount: room.players.size,
            maxPlayers: room.settings.maxPlayers,
            isFull: room.players.size >= room.settings.maxPlayers,
            started: room.started,
            category: CATEGORIES[room.settings.category].name,
            imposterCount: room.settings.imposterCount,
            detectiveEnabled: room.settings.detectiveEnabled
        });
    });
    // Avval kutayotgan xonalar, keyin o'yinchilar soni bo'yicha
    return list.sort((a, b) => (a.started - b.started) || (b.playerCount - a.playerCount));
}

function broadcastPublicRooms() {
    io.to(LOBBY_BROWSER).emit('publicRoomsUpdate', { rooms: getPublicRoomsList() });
    broadcastOnlineCount();
}

function broadcastPlayers(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('updatePlayers', {
        players: getPlayersArray(room),
        hostId: room.hostId,
        isPublic: !!room.isPublic,
        roomName: room.roomName,
        settings: room.settings,
        categories: Object.entries(CATEGORIES).map(([key, c]) => ({ key, name: c.name })),
        leaderboard: getLeaderboardArray(room)
    });
}

function getLeaderboardArray(room) {
    return Array.from(room.leaderboard.entries())
        .map(([nickname, s]) => ({
            nickname,
            wins: s.wins,
            games: s.games,
            achievements: Array.from(s.achievements).map(k => ({ key: k, ...ACHIEVEMENTS[k] }))
        }))
        .sort((a, b) => b.wins - a.wins || b.games - a.games);
}

function ensureLeaderboardEntry(room, nickname) {    if (!room.leaderboard.has(nickname)) {
        room.leaderboard.set(nickname, { wins: 0, games: 0, achievements: new Set(), streak: 0 });
    }
    return room.leaderboard.get(nickname);
}

function grantAchievement(room, nickname, key) {
    const entry = ensureLeaderboardEntry(room, nickname);
    if (entry.achievements.has(key)) return null;
    entry.achievements.add(key);
    return { nickname, key, ...ACHIEVEMENTS[key] };
}

function sendSystemMessage(roomId, message) {
    const room = rooms.get(roomId);
    if (room) room.recap.push({ type: 'system', message });
    io.to(roomId).emit('receiveMessage', { type: 'system', message });
}

function clearRoomTimers(room) {
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
    if (room.voting && room.voting.timeout) { clearTimeout(room.voting.timeout); }
}

function aliveSpeakers(room) {
    // Susdirilmagan (arvoh bo'lmagan) o'yinchilar
    return Array.from(room.players.entries()).filter(([, p]) => !p.isMuted).map(([id]) => id);
}

// ==================== NAVBAT TIZIMI ====================

function buildTurnOrder(room) {
    const ids = aliveSpeakers(room);
    // aralashtirish
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    room.turnOrder = ids;
    room.turnIndex = 0;
}

function currentTurnPlayerId(room) {
    if (!room.turnOrder || room.turnIndex >= room.turnOrder.length) return null;
    return room.turnOrder[room.turnIndex];
}

function startTurn(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    if (room.voting) return; // ovoz berish paytida navbat to'xtaydi

    // Susdirilgan o'yinchilarni o'tkazib yuboramiz
    while (room.turnIndex < room.turnOrder.length) {
        const pid = room.turnOrder[room.turnIndex];
        const p = room.players.get(pid);
        if (p && !p.isMuted) break;
        room.turnIndex++;
    }

    if (room.turnIndex >= room.turnOrder.length) {
        finishRound(roomId);
        return;
    }

    const pid = currentTurnPlayerId(room);
    const player = room.players.get(pid);
    if (!player) { room.turnIndex++; startTurn(roomId); return; }

    io.to(roomId).emit('turnChanged', {
        currentPlayerId: pid,
        currentNickname: player.nickname,
        seconds: room.settings.turnSeconds,
        roundNumber: room.roundNumber,
        turnPosition: room.turnIndex + 1,
        turnTotal: room.turnOrder.length
    });

    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = setTimeout(() => {
        sendSystemMessage(roomId, `${player.nickname} vaqtida ulgurmadi, navbat o'tdi.`);
        advanceTurn(roomId);
    }, room.settings.turnSeconds * 1000);
}

function advanceTurn(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
    room.turnIndex++;
    startTurn(roomId);
}

function finishRound(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.voteLockOpen = true;
    io.to(roomId).emit('roundFinished', { roundNumber: room.roundNumber });
    sendSystemMessage(roomId, `${room.roundNumber}-raund tugadi! Endi ovoz berishni boshlash mumkin.`);
    io.to(roomId).emit('voteUnlocked');
}

function startNextRound(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    room.roundNumber++;
    room.voteLockOpen = false;
    buildTurnOrder(room);
    sendSystemMessage(roomId, `${room.roundNumber}-raund boshlandi.`);
    startTurn(roomId);
}

// ==================== O'YIN YAKUNI ====================

function endGame(roomId, winner, message) {
    const room = rooms.get(roomId);
    if (!room) return;
    clearRoomTimers(room);

    const newAchievements = [];

    room.players.forEach((p) => {
        const entry = ensureLeaderboardEntry(room, p.nickname);
        entry.games += 1;
        const playerWon = (winner === 'imposter') === !!p.isImposter;

        if (playerWon) {
            entry.wins += 1;
            entry.streak += 1;
            const a1 = grantAchievement(room, p.nickname, 'firstWin');
            if (a1) newAchievements.push(a1);
            if (p.isImposter) {
                const a2 = grantAchievement(room, p.nickname, 'imposterWin');
                if (a2) newAchievements.push(a2);
            }
            if (!p.isMuted) {
                const a3 = grantAchievement(room, p.nickname, 'survivor');
                if (a3) newAchievements.push(a3);
            } else {
                const a4 = grantAchievement(room, p.nickname, 'ghostWhisperer');
                if (a4) newAchievements.push(a4);
            }
            if (entry.streak >= 3) {
                const a5 = grantAchievement(room, p.nickname, 'hatTrick');
                if (a5) newAchievements.push(a5);
            }
        } else {
            entry.streak = 0;
        }

        if (entry.games >= 5) {
            const a6 = grantAchievement(room, p.nickname, 'veteran');
            if (a6) newAchievements.push(a6);
        }
    });

    const imposterNames = Array.from(room.players.values()).filter(p => p.isImposter).map(p => p.nickname);

    io.to(roomId).emit('gameOver', {
        winner,
        message,
        word: room.word,
        imposters: imposterNames,
        recap: room.recap,
        newAchievements,
        leaderboard: getLeaderboardArray(room)
    });

    // Xona saqlanadi — tez qayta o'ynash uchun lobby holatiga qaytamiz
    room.started = false;
    room.word = null;
    room.wordRevealed = false;
    room.imposterIds = new Set();
    room.voting = null;
    room.voteLockOpen = false;
    room.turnOrder = [];
    room.turnIndex = 0;
    room.roundNumber = 0;
    room.players.forEach(p => {
        p.isMuted = false; p.isReady = false; p.isImposter = false;
        p.isDetective = false; p.detectiveUsed = false;
    });
    broadcastPlayers(roomId);
    broadcastPublicRooms();
}

function resetRoomToLobby(roomId, reasonMessage) {
    const room = rooms.get(roomId);
    if (!room) return;
    clearRoomTimers(room);
    room.started = false;
    room.word = null;
    room.wordRevealed = false;
    room.imposterIds = new Set();
    room.voting = null;
    room.voteLockOpen = false;
    room.turnOrder = [];
    room.turnIndex = 0;
    room.roundNumber = 0;
    room.players.forEach(p => {
        p.isMuted = false; p.isReady = false; p.isImposter = false;
        p.isDetective = false; p.detectiveUsed = false;
    });
    io.to(roomId).emit('playerLeftGameOver', { message: reasonMessage });
    broadcastPlayers(roomId);
    broadcastPublicRooms();
}

// ==================== OVOZ BERISH ====================

function tallyVotes(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.voting) return;
    if (room.voting.timeout) clearTimeout(room.voting.timeout);

    const votesSnapshot = Array.from(room.voting.votes.entries()).map(([voterId, targetId]) => ({
        voter: room.players.get(voterId) ? room.players.get(voterId).nickname : '?',
        target: room.players.get(targetId) ? room.players.get(targetId).nickname : '?'
    }));

    const tally = new Map();
    room.voting.votes.forEach(targetId => tally.set(targetId, (tally.get(targetId) || 0) + 1));

    let maxVotes = 0;
    let topCandidates = [];
    tally.forEach((count, targetId) => {
        if (count > maxVotes) { maxVotes = count; topCandidates = [targetId]; }
        else if (count === maxVotes) { topCandidates.push(targetId); }
    });

    room.voting = null;

    room.recap.push({ type: 'vote', round: room.roundNumber, votes: votesSnapshot });

    if (maxVotes === 0 || topCandidates.length !== 1) {
        io.to(roomId).emit('voteResult', { message: "Ovozlar teng bo'ldi. Hech kim susdirilmadi." });
        sendSystemMessage(roomId, "Ovoz berish natijasiz tugadi.");
        startNextRound(roomId);
        return;
    }

    const targetId = topCandidates[0];
    const targetPlayer = room.players.get(targetId);
    if (!targetPlayer) { startNextRound(roomId); return; }

    // Josusga to'g'ri ovoz berganlarga yutuq
    if (targetPlayer.isImposter) {
        room.voting = null;
        room.recap.push({ type: 'eliminate', nickname: targetPlayer.nickname, wasImposter: true });
        const msg = `${targetPlayer.nickname} eng ko'p ovoz oldi va u JOSUS edi! 🎉`;
        io.to(roomId).emit('voteResult', { message: msg });
        sendSystemMessage(roomId, msg);

        // Sherlock yutug'i
        votesSnapshot.forEach(v => {
            if (v.target === targetPlayer.nickname) grantAchievement(room, v.voter, 'sherlock');
        });

        endGame(roomId, 'crew', `Jamoa g'alaba qozondi! Josus (${targetPlayer.nickname}) topildi.`);
        return;
    }

    targetPlayer.isMuted = true;
    room.recap.push({ type: 'eliminate', nickname: targetPlayer.nickname, wasImposter: false });

    const msg = `${targetPlayer.nickname} eng ko'p ovoz oldi, lekin u josus emas edi. Endi u arvoh! 👻`;
    io.to(roomId).emit('voteResult', { message: msg });
    sendSystemMessage(roomId, msg);

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) targetSocket.emit('playerMuted');

    broadcastPlayers(roomId);

    const remainingCrew = Array.from(room.players.values()).filter(p => !p.isImposter && !p.isMuted).length;
    const imposterCount = Array.from(room.players.values()).filter(p => p.isImposter).length;

    if (remainingCrew <= imposterCount) {
        const imposterNames = Array.from(room.players.values()).filter(p => p.isImposter).map(p => p.nickname);
        endGame(roomId, 'imposter', `Josus g'alaba qozondi! Josus: ${imposterNames.join(', ')}`);
        return;
    }

    startNextRound(roomId);
}

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {

    onlineCount++;
    recordPeakOnline(onlineCount);
    broadcastOnlineCount();

    // Klient sahifani ochganda bir marta yuboradi
    socket.on('registerVisit', ({ visitorId }) => {
        if (socket.data && socket.data.visitCounted) return;
        socket.data = socket.data || {};
        socket.data.visitCounted = true;
        recordVisit(visitorId);
    });

    socket.on('getOnlineCount', () => {
        socket.emit('onlineCount', { count: onlineCount, rooms: rooms.size });
    });


    socket.on('createLobby', ({ nickname, isPublic, roomName }) => {
        if (!nickname || !nickname.trim()) { socket.emit('errorMsg', "Nickname noto'g'ri!"); return; }
        const roomId = generateRoomCode();
        const cleanName = (roomName || '').trim().slice(0, 24) || `${nickname.trim()} xonasi`;
        rooms.set(roomId, {
            hostId: socket.id,
            isPublic: !!isPublic,
            roomName: cleanName,
            players: new Map([[socket.id, {
                nickname: nickname.trim(), isReady: false, isMuted: false,
                isImposter: false, isDetective: false, detectiveUsed: false
            }]]),
            started: false, word: null, imposterIds: new Set(), wordRevealed: false,
            settings: defaultSettings(),
            turnOrder: [], turnIndex: 0, turnTimer: null,
            roundNumber: 0, voting: null, voteLockOpen: false,
            recap: [], messageCounter: 0, reactions: new Map(),
            leaderboard: new Map()
        });
        socket.join(roomId);
        socket.leave(LOBBY_BROWSER);
        socket.emit('lobbyCreated', { roomId });
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    // ---------- OCHIQ XONALAR RO'YXATI ----------
    socket.on('browsePublicRooms', () => {
        socket.join(LOBBY_BROWSER);
        socket.emit('publicRoomsUpdate', { rooms: getPublicRoomsList() });
    });

    socket.on('stopBrowsing', () => {
        socket.leave(LOBBY_BROWSER);
    });

    socket.on('toggleRoomVisibility', ({ roomId, isPublic }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (socket.id !== room.hostId) { socket.emit('errorMsg', "Faqat host o'zgartira oladi!"); return; }
        room.isPublic = !!isPublic;
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    socket.on('joinLobby', ({ roomId, nickname }) => {
        const room = rooms.get(roomId);
        if (!room) { socket.emit('errorMsg', 'Bunday xona topilmadi!'); return; }
        if (room.started) { socket.emit('errorMsg', "O'yin allaqachon boshlangan!"); return; }
        if (room.players.size >= room.settings.maxPlayers) {
            socket.emit('errorMsg', `Xona to'lgan! (${room.players.size}/${room.settings.maxPlayers})`);
            return;
        }
        if (!nickname || !nickname.trim()) { socket.emit('errorMsg', "Nickname noto'g'ri!"); return; }
        const taken = Array.from(room.players.values()).some(p => p.nickname.toLowerCase() === nickname.trim().toLowerCase());
        if (taken) { socket.emit('errorMsg', 'Bu nickname band, boshqasini tanlang!'); return; }

        room.players.set(socket.id, {
            nickname: nickname.trim(), isReady: false, isMuted: false,
            isImposter: false, isDetective: false, detectiveUsed: false
        });
        socket.join(roomId);
        socket.leave(LOBBY_BROWSER);
        socket.emit('joinedLobby', { roomId });
        broadcastPlayers(roomId);
        broadcastPublicRooms();
        sendSystemMessage(roomId, `${nickname.trim()} xonaga qo'shildi.`);
    });

    socket.on('changeNickname', ({ roomId, nickname }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;
        const trimmed = (nickname || '').trim();
        if (!trimmed) { socket.emit('errorMsg', "Nickname noto'g'ri!"); return; }
        const taken = Array.from(room.players.entries()).some(([id, p]) => id !== socket.id && p.nickname.toLowerCase() === trimmed.toLowerCase());
        if (taken) { socket.emit('errorMsg', 'Bu nickname band!'); return; }
        const oldName = player.nickname;
        player.nickname = trimmed;
        broadcastPlayers(roomId);
        sendSystemMessage(roomId, `${oldName} nickname'ini "${trimmed}" ga o'zgartirdi.`);
    });

    // ---------- HOST SOZLAMALARI ----------
    socket.on('updateSettings', ({ roomId, settings }) => {
        const room = rooms.get(roomId);
        if (!room || room.started) return;
        if (socket.id !== room.hostId) { socket.emit('errorMsg', 'Faqat host sozlamalarni o\'zgartira oladi!'); return; }

        const s = room.settings;
        if (settings.imposterCount !== undefined) {
            s.imposterCount = Math.max(1, Math.min(MAX_IMPOSTERS, parseInt(settings.imposterCount) || 1));
        }
        if (settings.detectiveEnabled !== undefined) s.detectiveEnabled = !!settings.detectiveEnabled;
        if (settings.turnSeconds !== undefined) {
            s.turnSeconds = Math.max(10, Math.min(120, parseInt(settings.turnSeconds) || 30));
        }
        if (settings.voteSeconds !== undefined) {
            s.voteSeconds = Math.max(10, Math.min(120, parseInt(settings.voteSeconds) || 30));
        }
        if (settings.category !== undefined && CATEGORIES[settings.category]) {
            s.category = settings.category;
        }
        if (settings.maxPlayers !== undefined) {
            const requested = parseInt(settings.maxPlayers) || DEFAULT_ROOM_SIZE;
            const clamped = Math.max(MIN_ROOM_SIZE, Math.min(MAX_ROOM_SIZE, requested));
            // Xonada hozir turgan o'yinchilardan kam qilib bo'lmaydi
            if (clamped < room.players.size) {
                socket.emit('errorMsg', `Hozir xonada ${room.players.size} kishi bor, limitni bundan kam qilib bo'lmaydi!`);
            } else {
                s.maxPlayers = clamped;
            }
        }
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    socket.on('toggleReady', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.started) return;
        const player = room.players.get(socket.id);
        if (!player) return;
        player.isReady = !player.isReady;
        broadcastPlayers(roomId);
    });

    socket.on('kickPlayer', ({ roomId, playerId }) => {
        const room = rooms.get(roomId);
        if (!room || room.started) return;
        if (socket.id !== room.hostId) { socket.emit('errorMsg', "Faqat host o'yinchilarni chiqara oladi!"); return; }
        if (playerId === room.hostId) return;
        const targetSocket = io.sockets.sockets.get(playerId);
        room.players.delete(playerId);
        if (targetSocket) { targetSocket.emit('kicked'); targetSocket.leave(roomId); }
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    socket.on('startGame', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (socket.id !== room.hostId) { socket.emit('errorMsg', "Faqat host o'yinni boshlashi mumkin!"); return; }

        const minPlayers = MIN_PLAYERS_FOR_IMPOSTERS[room.settings.imposterCount] || MIN_ROOM_SIZE;
        if (room.players.size < minPlayers) {
            socket.emit('errorMsg', `Bu sozlamalar uchun kamida ${minPlayers} ta o'yinchi kerak!`);
            return;
        }
        if (room.players.size > room.settings.maxPlayers) {
            socket.emit('errorMsg', `Xonada limitdan ko'p o'yinchi bor!`);
            return;
        }
        const notReady = Array.from(room.players.entries()).some(([id, p]) => id !== room.hostId && !p.isReady);
        if (notReady) { socket.emit('errorMsg', "Barcha o'yinchilar Tayyor bo'lishi kerak!"); return; }

        const playerIds = Array.from(room.players.keys());
        const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

        const imposterIds = new Set(shuffled.slice(0, room.settings.imposterCount));
        const crewIds = shuffled.filter(id => !imposterIds.has(id));

        let detectiveId = null;
        if (room.settings.detectiveEnabled && crewIds.length >= 2) {
            detectiveId = crewIds[Math.floor(Math.random() * crewIds.length)];
        }

        const catKey = room.settings.category;
        const words = CATEGORIES[catKey].words;
        const word = words[Math.floor(Math.random() * words.length)];

        room.started = true;
        room.word = word;
        room.wordRevealed = false;
        room.imposterIds = imposterIds;
        room.voting = null;
        room.voteLockOpen = false;
        room.roundNumber = 1;
        room.recap = [];
        room.reactions = new Map();
        room.messageCounter = 0;

        room.players.forEach((p, id) => {
            p.isMuted = false;
            p.isImposter = imposterIds.has(id);
            p.isDetective = (id === detectiveId);
            p.detectiveUsed = false;
        });

        playerIds.forEach(id => {
            const s = io.sockets.sockets.get(id);
            if (!s) return;
            const p = room.players.get(id);
            if (p.isImposter) {
                s.emit('gameStarted', {
                    role: 'JOSUS', isImposter: true, word: null,
                    isDetective: false, category: CATEGORIES[catKey].name,
                    totalImposters: room.settings.imposterCount
                });
            } else {
                s.emit('gameStarted', {
                    role: p.isDetective ? 'DETEKTIV' : 'Ishtirokchi',
                    isImposter: false, word,
                    isDetective: p.isDetective, category: CATEGORIES[catKey].name,
                    totalImposters: room.settings.imposterCount
                });
            }
        });

        recordGamePlayed();
        sendSystemMessage(roomId, `O'yin boshlandi! Kategoriya: ${CATEGORIES[catKey].name}. Navbat bilan so'z ayting.`);
        buildTurnOrder(room);
        startTurn(roomId);
        broadcastPublicRooms();
    });

    // ---------- NAVBAT BILAN XABAR ----------
    socket.on('sendMessage', ({ roomId, message }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        const player = room.players.get(socket.id);
        if (!player) return;
        const trimmed = (message || '').trim();
        if (!trimmed) return;

        // Arvohlar faqat arvohlar chatiga yozadi
        if (player.isMuted) {
            const ghostMsg = { type: 'ghost', nickname: player.nickname, message: trimmed };
            room.players.forEach((p, id) => {
                if (!p.isMuted) return;
                const s = io.sockets.sockets.get(id);
                if (s) s.emit('receiveMessage', ghostMsg);
            });
            return;
        }

        if (room.voting) { socket.emit('errorMsg', 'Ovoz berish davom etmoqda!'); return; }
        if (currentTurnPlayerId(room) !== socket.id) {
            socket.emit('errorMsg', 'Hozir sizning navbatingiz emas!');
            return;
        }

        room.messageCounter++;
        const msgId = 'm' + room.messageCounter;

        // Maxfiy so'z oshkor bo'ldimi?
        const revealsWord = !player.isImposter && messageRevealsWord(trimmed, room.word);
        const firstReveal = revealsWord && !room.wordRevealed;
        if (firstReveal) room.wordRevealed = true;

        const payload = {
            type: 'player', id: msgId, nickname: player.nickname,
            message: trimmed, round: room.roundNumber,
            revealedWord: revealsWord
        };
        room.recap.push({
            type: 'message', round: room.roundNumber,
            nickname: player.nickname, message: trimmed,
            revealedWord: revealsWord
        });
        io.to(roomId).emit('receiveMessage', payload);

        if (firstReveal) {
            sendSystemMessage(roomId,
                `⚠️ ${player.nickname} maxfiy so'zni oshkor qildi! Endi josus ham so'zni biladi.`);
            // Josuslarga so'zni ochamiz
            room.players.forEach((p, id) => {
                if (!p.isImposter) return;
                const s = io.sockets.sockets.get(id);
                if (s) s.emit('wordRevealedToImposter', { word: room.word, by: player.nickname });
            });
        }

        advanceTurn(roomId);
    });

    // ---------- REAKSIYA EMOJI ----------
    socket.on('reactToMessage', ({ roomId, messageId, emoji }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        const player = room.players.get(socket.id);
        if (!player) return;
        const allowed = ['👍', '😂', '🤔', '😱', '🧐'];
        if (!allowed.includes(emoji)) return;

        if (!room.reactions.has(messageId)) room.reactions.set(messageId, new Map());
        const msgReactions = room.reactions.get(messageId);
        if (!msgReactions.has(emoji)) msgReactions.set(emoji, new Set());
        const users = msgReactions.get(emoji);

        if (users.has(socket.id)) users.delete(socket.id);
        else users.add(socket.id);

        const summary = {};
        msgReactions.forEach((set, e) => { if (set.size > 0) summary[e] = set.size; });
        io.to(roomId).emit('reactionUpdate', { messageId, reactions: summary });
    });

    // ---------- DETEKTIV QOBILIYATI ----------
    socket.on('detectiveInvestigate', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        const player = room.players.get(socket.id);
        if (!player || !player.isDetective) { socket.emit('errorMsg', 'Siz detektiv emassiz!'); return; }
        if (player.detectiveUsed) { socket.emit('errorMsg', 'Siz bu qobiliyatdan allaqachon foydalangansiz!'); return; }
        if (player.isMuted) { socket.emit('errorMsg', 'Arvoh tekshira olmaydi!'); return; }
        const target = room.players.get(targetId);
        if (!target || targetId === socket.id) { socket.emit('errorMsg', "Noto'g'ri tanlov!"); return; }

        player.detectiveUsed = true;
        socket.emit('detectiveResult', {
            nickname: target.nickname,
            isImposter: !!target.isImposter
        });

        if (target.isImposter) grantAchievement(room, player.nickname, 'detective');
        sendSystemMessage(roomId, `🔍 Detektiv o'z qobiliyatidan foydalandi...`);
    });

    // ---------- OVOZ BERISH ----------
    socket.on('startVotingProcess', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        const player = room.players.get(socket.id);
        if (!player) return;
        if (player.isMuted) { socket.emit('errorMsg', 'Arvohlar ovoz berishni boshlay olmaydi!'); return; }
        if (room.voting) { socket.emit('errorMsg', 'Ovoz berish allaqachon boshlangan!'); return; }
        if (!room.voteLockOpen) { socket.emit('errorMsg', 'Avval raund tugashi kerak!'); return; }

        if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

        room.voting = {
            votes: new Map(),
            timeout: setTimeout(() => tallyVotes(roomId), room.settings.voteSeconds * 1000)
        };

        const candidates = getPlayersArray(room).filter(p => !p.isMuted);
        room.players.forEach((p, id) => {
            if (p.isMuted) return;
            const s = io.sockets.sockets.get(id);
            if (s) s.emit('openVoteModalForAll', { players: candidates, seconds: room.settings.voteSeconds });
        });
        sendSystemMessage(roomId, `${player.nickname} ovoz berishni boshladi!`);
    });

    socket.on('castVote', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.voting) return;
        const voter = room.players.get(socket.id);
        const target = room.players.get(targetId);
        if (!voter || voter.isMuted || !target || target.isMuted) return;
        if (targetId === socket.id) return;

        room.voting.votes.set(socket.id, targetId);
        const eligible = Array.from(room.players.values()).filter(p => !p.isMuted).length;
        if (room.voting.votes.size >= eligible) tallyVotes(roomId);
    });

    socket.on('disconnect', () => {
        onlineCount = Math.max(0, onlineCount - 1);
        broadcastOnlineCount();

        for (const [roomId, room] of rooms.entries()) {
            if (!room.players.has(socket.id)) continue;
            const leaving = room.players.get(socket.id);
            const wasHost = socket.id === room.hostId;
            const wasTheirTurn = currentTurnPlayerId(room) === socket.id;
            room.players.delete(socket.id);

            if (room.players.size === 0) { clearRoomTimers(room); rooms.delete(roomId); broadcastPublicRooms(); continue; }
            if (wasHost) room.hostId = room.players.keys().next().value;

            if (room.started) {
                const crewLeft = Array.from(room.players.values()).filter(p => !p.isImposter && !p.isMuted).length;
                const impLeft = Array.from(room.players.values()).filter(p => p.isImposter).length;

                if (impLeft === 0 || room.players.size < MIN_ROOM_SIZE || crewLeft < 1) {
                    resetRoomToLobby(roomId, `${leaving.nickname} chiqib ketdi. O'yin bekor qilindi.`);
                } else {
                    room.turnOrder = room.turnOrder.filter(id => id !== socket.id);
                    sendSystemMessage(roomId, `${leaving.nickname} o'yindan chiqib ketdi.`);
                    broadcastPlayers(roomId);
                    if (wasTheirTurn) {
                        if (room.turnIndex >= room.turnOrder.length) finishRound(roomId);
                        else startTurn(roomId);
                    }
                }
            } else {
                broadcastPlayers(roomId);
                sendSystemMessage(roomId, `${leaving.nickname} xonadan chiqib ketdi.`);
            }
            broadcastPublicRooms();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishga tushdi`));
startTelegramBot(() => {
    let waiting = 0;
    let inGame = 0;
    let playersInRooms = 0;
    rooms.forEach(room => {
        playersInRooms += room.players.size;
        if (room.started) inGame++;
        else waiting++;
    });
    return {
        online: onlineCount,
        totalRooms: rooms.size,
        waitingRooms: waiting,
        inGameRooms: inGame,
        playersInRooms
    };
});
