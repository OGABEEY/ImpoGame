const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'Public')));

// ==================== SO'ZLAR RO'YXATI ====================
const WORD_LIST = [
    'Olma', 'Uzum', 'Behi', 'Tarvuz', 'Qovun',
    'Mashina', 'Velosiped', 'Samolyot', 'Poyezd', 'Kema',
    'Sher', "Yo'lbars", 'Fil', 'Tulki', "Bo'ri",
    'Shifokor', "O'qituvchi", 'Duradgor', 'Dehqon', 'Haydovchi',
    'Futbol', 'Basketbol', 'Shaxmat', 'Boks', 'Suzish',
    "Tog'", 'Dengiz', "Cho'l", "O'rmon", "Ko'l",
    'Telefon', 'Kompyuter', 'Televizor', 'Soat', 'Kamera'
];

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VOTE_DURATION_MS = 30000;
const VOTE_UNLOCK_DELAY_MS = 30000;
const STATS_FILE = path.join(__dirname, 'stats.json');

// ==================== STATISTIKA (fayl orqali saqlanadi) ====================
let statsStore = new Map();
try {
    const raw = fs.readFileSync(STATS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    statsStore = new Map(Object.entries(parsed));
} catch (e) {
    statsStore = new Map();
}

function saveStats() {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(Object.fromEntries(statsStore)));
    } catch (e) { /* diskka yozib bo'lmasa jim o'tkazamiz */ }
}

function getStats(clientId) {
    if (!clientId) return { wins: 0, games: 0 };
    if (!statsStore.has(clientId)) statsStore.set(clientId, { wins: 0, games: 0 });
    return statsStore.get(clientId);
}

function registerGameResult(clientIds, won) {
    clientIds.forEach(id => {
        const s = getStats(id);
        s.games += 1;
        if (won) s.wins += 1;
    });
    saveStats();
}

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

function getPlayersArray(room) {
    return Array.from(room.players.entries()).map(([id, p]) => ({
        id, nickname: p.nickname, isReady: p.isReady, isMuted: p.isMuted
    }));
}

function broadcastPlayers(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('updatePlayers', { players: getPlayersArray(room), hostId: room.hostId });
}

function sendSystemMessage(roomId, message) {
    io.to(roomId).emit('receiveMessage', { nickname: 'Tizim', message });
}

function clearRoomTimers(room) {
    if (room.voting && room.voting.timeout) clearTimeout(room.voting.timeout);
    if (room.voteLockTimeout) clearTimeout(room.voteLockTimeout);
}

function unlockVoting(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.voteLockTimeout = null;
    io.to(roomId).emit('voteUnlocked');
}

function scheduleVoteUnlock(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.voteLockTimeout) clearTimeout(room.voteLockTimeout);
    room.voteLockTimeout = setTimeout(() => unlockVoting(roomId), VOTE_UNLOCK_DELAY_MS);
}

function endGame(roomId, winner, message) {
    const room = rooms.get(roomId);
    if (!room) return;
    clearRoomTimers(room);

    const allClientIds = Array.from(room.players.values()).map(p => p.clientId).filter(Boolean);
    const winningClientIds = Array.from(room.players.values())
        .filter(p => (winner === 'imposter') === !!p.isImposter)
        .map(p => p.clientId)
        .filter(Boolean);
    const losingClientIds = allClientIds.filter(id => !winningClientIds.includes(id));

    registerGameResult(winningClientIds, true);
    registerGameResult(losingClientIds, false);

    io.to(roomId).emit('gameOver', { winner, message });
    rooms.delete(roomId);
}

function resetRoomToLobby(roomId, reasonMessage) {
    const room = rooms.get(roomId);
    if (!room) return;
    clearRoomTimers(room);

    room.started = false;
    room.word = null;
    room.imposterId = null;
    room.voting = null;
    room.players.forEach(p => { p.isMuted = false; p.isReady = false; p.isImposter = false; });

    io.to(roomId).emit('playerLeftGameOver', { message: reasonMessage });
    broadcastPlayers(roomId);
}

function tallyVotes(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.voting) return;
    if (room.voting.timeout) clearTimeout(room.voting.timeout);

    const tally = new Map();
    room.voting.votes.forEach(targetId => tally.set(targetId, (tally.get(targetId) || 0) + 1));

    let maxVotes = 0;
    let topCandidates = [];
    tally.forEach((count, targetId) => {
        if (count > maxVotes) { maxVotes = count; topCandidates = [targetId]; }
        else if (count === maxVotes) { topCandidates.push(targetId); }
    });

    room.voting = null;

    if (maxVotes === 0 || topCandidates.length !== 1) {
        io.to(roomId).emit('voteResult', { message: "Ovozlar teng bo'ldi. Vote jarayoni skip qilindi, hech kim susdirilmadi." });
        sendSystemMessage(roomId, "Vote skip qilindi: ovozlar teng bo'ldi.");
        scheduleVoteUnlock(roomId);
        return;
    }

    const targetId = topCandidates[0];
    const targetPlayer = room.players.get(targetId);
    if (!targetPlayer) { scheduleVoteUnlock(roomId); return; }

    if (targetPlayer.isImposter) {
        const msg = `${targetPlayer.nickname} eng ko'p ovoz oldi va u IMPOSTER edi! 🎉`;
        io.to(roomId).emit('voteResult', { message: msg });
        sendSystemMessage(roomId, msg);
        endGame(roomId, 'crew', `Jamoa g'alaba qozondi! Imposter (${targetPlayer.nickname}) topildi.`);
        return;
    }

    targetPlayer.isMuted = true;
    room.unmutedCrewCount -= 1;

    const msg = `${targetPlayer.nickname} eng ko'p ovoz oldi. Uning chatga yozish huquqi olib qo'yildi.`;
    io.to(roomId).emit('voteResult', { message: msg });
    sendSystemMessage(roomId, msg);

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) targetSocket.emit('playerMuted');

    broadcastPlayers(roomId);

    if (room.unmutedCrewCount <= 1) {
        const imposterPlayer = room.players.get(room.imposterId);
        endGame(roomId, 'imposter', `Imposter g'alaba qozondi! Imposter ${imposterPlayer ? imposterPlayer.nickname : ''} edi.`);
        return;
    }

    scheduleVoteUnlock(roomId);
}

// ==================== SOCKET.IO HODISALARI ====================

io.on('connection', (socket) => {

    socket.on('getStats', ({ clientId }) => {
        socket.emit('statsData', getStats(clientId));
    });

    socket.on('createLobby', ({ nickname, clientId }) => {
        if (!nickname || !nickname.trim()) { socket.emit('errorMsg', "Nickname noto'g'ri!"); return; }
        const roomId = generateRoomCode();
        rooms.set(roomId, {
            hostId: socket.id,
            players: new Map([[socket.id, { nickname: nickname.trim(), clientId, isReady: false, isMuted: false, isImposter: false }]]),
            started: false, word: null, imposterId: null, unmutedCrewCount: 0, voting: null, voteLockTimeout: null
        });
        socket.join(roomId);
        socket.emit('lobbyCreated', { roomId });
        broadcastPlayers(roomId);
    });

    socket.on('joinLobby', ({ roomId, nickname, clientId }) => {
        const room = rooms.get(roomId);
        if (!room) { socket.emit('errorMsg', 'Bunday xona topilmadi!'); return; }
        if (room.started) { socket.emit('errorMsg', "O'yin allaqachon boshlangan!"); return; }
        if (!nickname || !nickname.trim()) { socket.emit('errorMsg', "Nickname noto'g'ri!"); return; }
        const taken = Array.from(room.players.values()).some(p => p.nickname.toLowerCase() === nickname.trim().toLowerCase());
        if (taken) { socket.emit('errorMsg', 'Bu nickname band, boshqasini tanlang!'); return; }

        room.players.set(socket.id, { nickname: nickname.trim(), clientId, isReady: false, isMuted: false, isImposter: false });
        socket.join(roomId);
        socket.emit('joinedLobby', { roomId });
        broadcastPlayers(roomId);
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
    });

    socket.on('startGame', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (socket.id !== room.hostId) { socket.emit('errorMsg', "Faqat host o'yinni boshlashi mumkin!"); return; }
        if (room.players.size < 3) { socket.emit('errorMsg', "O'yinni boshlash uchun kamida 3 ta o'yinchi kerak!"); return; }
        const notReady = Array.from(room.players.entries()).some(([id, p]) => id !== room.hostId && !p.isReady);
        if (notReady) { socket.emit('errorMsg', 'Barcha o\'yinchilar Tayyor bo\'lishi kerak!'); return; }

        const playerIds = Array.from(room.players.keys());
        const imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
        const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];

        room.started = true;
        room.word = word;
        room.imposterId = imposterId;
        room.voting = null;
        room.unmutedCrewCount = playerIds.length - 1;
        room.players.forEach((p, id) => { p.isMuted = false; p.isImposter = (id === imposterId); });

        playerIds.forEach(id => {
            const s = io.sockets.sockets.get(id);
            if (!s) return;
            if (id === imposterId) s.emit('gameStarted', { role: 'IMPOSTER 🕵️', word: null });
            else s.emit('gameStarted', { role: 'Ishtirokchi', word });
        });

        sendSystemMessage(roomId, "O'yin boshlandi! So'zga bog'liq so'zlarni yozib, imposterni toping.");
        scheduleVoteUnlock(roomId);
    });

    socket.on('sendMessage', ({ roomId, message }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        const player = room.players.get(socket.id);
        if (!player || player.isMuted) return;
        const trimmed = (message || '').trim();
        if (!trimmed) return;
        io.to(roomId).emit('receiveMessage', { nickname: player.nickname, message: trimmed });
    });

    socket.on('startVotingProcess', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        const player = room.players.get(socket.id);
        
        // Mutelangan (chiqarilgan) o'yinchi ovoz berishni boshlay olmaydi
        if (!player || player.isMuted) { 
            socket.emit('errorMsg', "O'yindan chiqarilgansiz, ovoz berishni boshlay olmaysiz!"); 
            return; 
        }

        if (room.voting) { socket.emit('errorMsg', 'Ovoz berish allaqachon boshlangan!'); return; }
        if (room.voteLockTimeout) { socket.emit('errorMsg', 'Hali ovoz berishni boshlash vaqti kelmadi!'); return; }

        room.voting = { votes: new Map(), timeout: setTimeout(() => tallyVotes(roomId), VOTE_DURATION_MS) };
        io.to(roomId).emit('openVoteModalForAll', {
            players: getPlayersArray(room).filter(p => !p.isMuted)
        });
        sendSystemMessage(roomId, `${player.nickname} ovoz berishni boshladi! 30 soniya vaqt bor.`);
    });

    socket.on('castVote', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.voting) return;

        const voter = room.players.get(socket.id);
        const target = room.players.get(targetId);

        // Ovoz berayotgan yoki maqsad o'yinchi mutelangan bo'lsa ovoz qabul qilinmaydi
        if (!voter || voter.isMuted || !target || target.isMuted) return;
        if (targetId === socket.id) return;

        room.voting.votes.set(socket.id, targetId);

        // Faqat faol (mutelanmagan) o'yinchilar soniga qarab ovozlarni tekshirish
        const activePlayersCount = Array.from(room.players.values()).filter(p => !p.isMuted).length;

        if (room.voting.votes.size >= activePlayersCount) {
            tallyVotes(roomId);
        }
    });

    socket.on('disconnect', () => {
        for (const [roomId, room] of rooms.entries()) {
            if (!room.players.has(socket.id)) continue;
            const leavingPlayer = room.players.get(socket.id);
            const wasHost = socket.id === room.hostId;
            room.players.delete(socket.id);

            if (room.players.size === 0) { clearRoomTimers(room); rooms.delete(roomId); continue; }
            if (wasHost) room.hostId = room.players.keys().next().value;

            if (room.started) {
                resetRoomToLobby(roomId, `${leavingPlayer.nickname} o'yindan chiqib ketdi. O'yin bekor qilindi.`);
            } else {
                broadcastPlayers(roomId);
                sendSystemMessage(roomId, `${leavingPlayer.nickname} xonadan chiqib ketdi.`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ${PORT}-portda ishga tushdi`));