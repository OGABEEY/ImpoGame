const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { startTelegramBot } = require('./bot');
const { startDiscordBot } = require('./discord-bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ==================== SO'ZLAR ====================
const CATEGORIES = {
    aralash: { name: 'Aralash', words: ['Olma','Mashina','Sher','Shifokor','Futbol',"Tog'",'Telefon','Kitob','Dengiz','Qor','Non','Oyna','Chiroq','Kalit','Soat'] },
    hayvonlar: { name: 'Hayvonlar', words: ['Sher',"Yo'lbars",'Fil','Tulki',"Bo'ri",'Ayiq','Quyon','Ilon','Burgut','Delfin','Tuya','Maymun','Kirpi','Toshbaqa','Qurbaqa'] },
    kasblar: { name: 'Kasblar', words: ['Shifokor',"O'qituvchi",'Duradgor','Dehqon','Haydovchi','Uchuvchi','Sartarosh','Oshpaz','Politsiya',"O't o'chiruvchi",'Dasturchi','Rassom','Muhandis','Jurnalist',"Bog'bon"] },
    ovqatlar: { name: 'Ovqatlar', words: ['Osh','Somsa','Manti',"Lag'mon",'Shashlik','Chuchvara','Norin',"Sho'rva",'Non','Halva','Qaymoq','Dimlama','Kabob','Sambusa','Xonim'] },
    joylar: { name: 'Joylar', words: ['Maktab','Kasalxona','Bozor','Stadion','Kutubxona','Aeroport','Vokzal','Restoran','Muzey',"Bog'",'Masjid',"Do'kon",'Zavod','Plyaj','Qishloq'] },
    texnika: { name: 'Texnika', words: ['Telefon','Kompyuter','Televizor','Kamera','Muzlatgich','Quloqchin','Klaviatura','Printer','Dron','Robot','Mikrofon','Proyektor','Planshet','Zaryadlagich','Noutbuk'] }
};

// ==================== ROLLAR ====================
const ROLES = {
    oddiy:    { name: "Oddiy o'yinchi", icon: '👤', team: 'crew',    knowsWord: true,  night: null,
                desc: "Maxfiy so'zni bilasiz. So'zga bog'liq so'z aytib, josusni toping." },
    josus:    { name: 'Josus',          icon: '🕵️', team: 'josus',   knowsWord: false, night: 'kill',
                desc: "So'zni bilmaysiz. Har tunda birovni o'ldirasiz. So'zni topib chatga yozsangiz — darhol yutasiz!" },
    shifokor: { name: 'Shifokor',       icon: '⚕️', team: 'crew',    knowsWord: true,  night: 'heal',
                desc: "Har tunda birovni himoya qilasiz. Har odamni faqat bir marta, o'zingizni ham qutqarishingiz mumkin." },
    detektiv: { name: 'Detektiv',       icon: '🔍', team: 'crew',    knowsWord: true,  night: 'investigate',
                desc: "Har tunda birovni tekshirasiz. Josus yoki qotilni topsangiz — keyingi tunda uni o'ldira olasiz." },
    telba:    { name: 'Telba',          icon: '🤪', team: 'neutral', knowsWord: true,  night: null,
                desc: "Maqsadingiz — ovoz berishda chiqarilish! Shunda g'olib bo'lasiz. O'ldirilsangiz yutmaysiz." },
    sayyoh:   { name: 'Sayyoh',         icon: '🧳', team: 'crew',    knowsWord: true,  night: 'visit',
                desc: "Har tunda birovnikiga borasiz. Agar o'sha odam o'ldirilsa — qotilning kimligini bilib olasiz." },
    qoriqchi: { name: "Qo'riqchi",      icon: '🛡️', team: 'crew',    knowsWord: true,  night: 'guard',
                desc: "Har tunda birovni qo'riqlaysiz. Unga hujum bo'lsa — siz o'lasiz, lekin u hujumchining kimligini biladi." },
    qotil:    { name: 'Qotil',          icon: '🔪', team: 'neutral', knowsWord: true,  night: 'kill',
                desc: "Neytral qotil. Har tunda istalgan odamni o'ldirasiz — hattoki josusni ham. Oxirgi omon qolsangiz yutasiz." }
};

// ==================== ROL TAQSIMOTI ====================
const ROLE_DISTRIBUTION = {
    4:  { josus:1, shifokor:1, oddiy:2 },
    5:  { josus:1, shifokor:1, detektiv:1, oddiy:2 },
    6:  { josus:1, shifokor:1, detektiv:1, oddiy:3 },
    7:  { josus:1, shifokor:1, detektiv:1, oddiy:3, telba:1 },
    8:  { josus:1, shifokor:1, detektiv:1, oddiy:4, telba:1 },
    9:  { josus:1, shifokor:1, detektiv:1, oddiy:4, telba:1, sayyoh:1 },
    10: { josus:2, shifokor:1, detektiv:1, oddiy:4, telba:1, sayyoh:1 },
    11: { josus:2, shifokor:1, detektiv:1, oddiy:5, telba:1, sayyoh:1 },
    12: { josus:2, shifokor:1, detektiv:2, oddiy:5, telba:1, sayyoh:1 },
    13: { josus:2, shifokor:1, detektiv:2, oddiy:5, telba:1, sayyoh:1, qoriqchi:1 },
    14: { josus:2, shifokor:2, detektiv:2, oddiy:5, telba:1, sayyoh:1, qoriqchi:1 },
    15: { josus:2, shifokor:2, detektiv:2, oddiy:5, telba:1, sayyoh:1, qoriqchi:1, qotil:1 }
};

const MIN_ROOM_SIZE = 4;
const MAX_ROOM_SIZE = 15;
const DEFAULT_ROOM_SIZE = 10;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ==================== MAXFIY SO'ZNI ANIQLASH ====================
function normalizeUz(str) {
    return (str || '').toLowerCase()
        .replace(/[\u2018\u2019\u02BB\u02BC\u0060\u00B4]/g, "'")
        .replace(/\s+/g, ' ').trim();
}

function messageRevealsWord(message, secretWord) {
    const msg = normalizeUz(message);
    const word = normalizeUz(secretWord);
    if (!msg || !word) return false;
    if (word.includes(' ')) return msg.includes(word);
    const tokens = msg.split(/[^a-z0-9']+/).filter(Boolean);
    if (word.length <= 3) return tokens.includes(word);
    return tokens.some(t => t === word || t.startsWith(word));
}

// ==================== ONLAYN HISOB ====================
const ONLINE_ROOM = 'online-counter';
let onlineCount = 0;
function broadcastOnlineCount() {
    io.emit('onlineCount', { count: onlineCount, rooms: rooms.size });
}

const rooms = new Map();
const LOBBY_BROWSER = 'lobby-browser';

app.use(express.static(path.join(__dirname, 'Public')));

app.get('/healthz', (req, res) => {
    res.status(200).json({ ok: true, online: onlineCount, rooms: rooms.size, uptime: Math.floor(process.uptime()) });
});

// ==================== YORDAMCHILAR ====================
function generateRoomCode() {
    let code;
    do {
        code = '';
        for (let i = 0; i < 5; i++) code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
    } while (rooms.has(code));
    return code;
}

function defaultSettings() {
    return { turnSeconds: 30, nightSeconds: 30, voteSeconds: 30, category: 'aralash', maxPlayers: DEFAULT_ROOM_SIZE };
}

function alivePlayers(room) {
    return Array.from(room.players.entries()).filter(([, p]) => p.isAlive);
}

function aliveIds(room) {
    return alivePlayers(room).map(([id]) => id);
}

function countAliveByTeam(room, team) {
    return alivePlayers(room).filter(([, p]) => ROLES[p.role] && ROLES[p.role].team === team).length;
}

function getPlayersArray(room) {
    return Array.from(room.players.entries()).map(([id, p]) => ({
        id, nickname: p.nickname, isReady: p.isReady, isAlive: p.isAlive,
        // Rol faqat o'lgandan keyin yoki o'yin tugagach ochiladi
        role: (!p.isAlive && room.started) ? p.role : null
    }));
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
        roleTable: ROLE_DISTRIBUTION,
        roleInfo: Object.entries(ROLES).map(([key, r]) => ({ key, name: r.name, icon: r.icon, team: r.team, desc: r.desc })),
        leaderboard: getLeaderboardArray(room)
    });
}

function getPublicRoomsList() {
    const list = [];
    rooms.forEach((room, roomId) => {
        if (!room.isPublic) return;
        const host = room.players.get(room.hostId);
        list.push({
            roomId, name: room.roomName, hostName: host ? host.nickname : '?',
            playerCount: room.players.size, maxPlayers: room.settings.maxPlayers,
            isFull: room.players.size >= room.settings.maxPlayers,
            started: room.started, category: CATEGORIES[room.settings.category].name
        });
    });
    return list.sort((a, b) => (a.started - b.started) || (b.playerCount - a.playerCount));
}

function broadcastPublicRooms() {
    io.to(LOBBY_BROWSER).emit('publicRoomsUpdate', { rooms: getPublicRoomsList() });
    broadcastOnlineCount();
}

function getLeaderboardArray(room) {
    return Array.from(room.leaderboard.entries())
        .map(([nickname, s]) => ({ nickname, wins: s.wins, games: s.games }))
        .sort((a, b) => b.wins - a.wins || b.games - a.games);
}

function ensureLeaderboardEntry(room, nickname) {
    if (!room.leaderboard.has(nickname)) room.leaderboard.set(nickname, { wins: 0, games: 0 });
    return room.leaderboard.get(nickname);
}

function sendSystemMessage(roomId, message, kind) {
    const room = rooms.get(roomId);
    if (room) room.recap.push({ type: 'system', round: room.roundNumber, message, kind });
    io.to(roomId).emit('receiveMessage', { type: 'system', message, kind });
}

function emitTo(id, event, payload) {
    const s = io.sockets.sockets.get(id);
    if (s) s.emit(event, payload);
}

function clearRoomTimers(room) {
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
    if (room.nightTimer) { clearTimeout(room.nightTimer); room.nightTimer = null; }
    if (room.voteTimer) { clearTimeout(room.voteTimer); room.voteTimer = null; }
}

// ==================== ROL TARQATISH ====================
function assignRoles(room) {
    const ids = Array.from(room.players.keys());
    const dist = ROLE_DISTRIBUTION[ids.length];
    if (!dist) return false;

    const pool = [];
    Object.entries(dist).forEach(([role, count]) => {
        for (let i = 0; i < count; i++) pool.push(role);
    });

    // aralashtirish
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    ids.forEach((id, idx) => {
        const p = room.players.get(id);
        p.role = pool[idx];
        p.isAlive = true;
        p.healedTargets = new Set();     // shifokor uchun
        p.killUnlockedOn = null;         // detektiv uchun: kimni o'ldira oladi
        p.investigatedThisRound = false;
    });
    return true;
}

// ==================== NAVBAT (MUHOKAMA) ====================
function buildTurnOrder(room) {
    const ids = aliveIds(room);
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    // Josus birinchi gapirmasin
    const first = room.players.get(ids[0]);
    if (first && first.role === 'josus') {
        const others = ids.map((id, idx) => ({ id, idx })).filter(x => room.players.get(x.id).role !== 'josus');
        if (others.length) {
            const pick = others[Math.floor(Math.random() * others.length)];
            [ids[0], ids[pick.idx]] = [ids[pick.idx], ids[0]];
        }
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
    if (!room || room.phase !== 'discussion') return;

    while (room.turnIndex < room.turnOrder.length) {
        const p = room.players.get(room.turnOrder[room.turnIndex]);
        if (p && p.isAlive) break;
        room.turnIndex++;
    }

    if (room.turnIndex >= room.turnOrder.length) { startNightPhase(roomId); return; }

    const pid = currentTurnPlayerId(room);
    const player = room.players.get(pid);
    if (!player) { room.turnIndex++; startTurn(roomId); return; }

    io.to(roomId).emit('turnChanged', {
        currentPlayerId: pid, currentNickname: player.nickname,
        seconds: room.settings.turnSeconds, roundNumber: room.roundNumber,
        turnPosition: room.turnIndex + 1, turnTotal: room.turnOrder.length
    });

    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = setTimeout(() => {
        sendSystemMessage(roomId, `${player.nickname} vaqtida ulgurmadi, navbat o'tdi.`);
        advanceTurn(roomId);
    }, room.settings.turnSeconds * 1000);
}

function advanceTurn(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'discussion') return;
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
    room.turnIndex++;
    startTurn(roomId);
}

// ==================== TUN BOSQICHI ====================
function nightActorsOf(room) {
    return alivePlayers(room).filter(([, p]) => ROLES[p.role] && ROLES[p.role].night);
}

function startNightPhase(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }

    room.phase = 'night';
    room.night = { actions: new Map() };

    const candidates = alivePlayers(room).map(([id, p]) => ({ id, nickname: p.nickname }));

    sendSystemMessage(roomId, `🌙 Tun tushdi. Maxsus rollar o'z vazifasini bajarmoqda...`, 'night');

    alivePlayers(room).forEach(([id, p]) => {
        const roleDef = ROLES[p.role];
        const canAct = roleDef && roleDef.night;

        let action = canAct ? roleDef.night : null;
        let killTarget = null;

        // Detektiv: agar o'tgan tunda josus/qotilni topgan bo'lsa, o'ldirish imkoniyati
        if (p.role === 'detektiv' && p.killUnlockedOn) {
            const t = room.players.get(p.killUnlockedOn);
            if (t && t.isAlive) killTarget = { id: p.killUnlockedOn, nickname: t.nickname };
            else p.killUnlockedOn = null;
        }

        emitTo(id, 'nightPhase', {
            seconds: room.settings.nightSeconds,
            roundNumber: room.roundNumber,
            action,
            role: p.role,
            roleName: roleDef ? roleDef.name : '',
            killTarget,
            healedAlready: p.role === 'shifokor' ? Array.from(p.healedTargets) : [],
            candidates: candidates.filter(c => c.id !== id || p.role === 'shifokor')
        });
    });

    io.to(roomId).emit('phaseChanged', { phase: 'night', seconds: room.settings.nightSeconds, roundNumber: room.roundNumber });

    if (room.nightTimer) clearTimeout(room.nightTimer);
    room.nightTimer = setTimeout(() => resolveNight(roomId), room.settings.nightSeconds * 1000);
}

function maybeFinishNight(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'night' || !room.night) return;
    const actors = nightActorsOf(room).map(([id]) => id);
    const allActed = actors.every(id => room.night.actions.has(id));
    if (allActed) resolveNight(roomId);
}

function resolveNight(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'night' || !room.night) return;
    if (room.nightTimer) { clearTimeout(room.nightTimer); room.nightTimer = null; }

    const actions = room.night.actions;
    room.phase = 'resolving';

    const attacks = [];      // { attackerId, attackerRole, targetId, isDetectiveKill }
    const heals = new Map(); // targetId -> healerId
    const guards = new Map();// targetId -> guardId
    const visits = new Map();// travelerId -> targetId
    const investigations = [];

    actions.forEach((act, actorId) => {
        const actor = room.players.get(actorId);
        if (!actor || !actor.isAlive) return;
        const targetId = act.targetId;
        const target = room.players.get(targetId);
        if (!target) return;

        if (act.type === 'kill') {
            attacks.push({ attackerId: actorId, attackerRole: actor.role, targetId });
        } else if (act.type === 'detectiveKill') {
            attacks.push({ attackerId: actorId, attackerRole: 'detektiv', targetId, isDetectiveKill: true });
        } else if (act.type === 'heal') {
            if (!actor.healedTargets.has(targetId)) {
                heals.set(targetId, actorId);
                actor.healedTargets.add(targetId);
            }
        } else if (act.type === 'guard') {
            guards.set(targetId, actorId);
        } else if (act.type === 'visit') {
            visits.set(actorId, targetId);
        } else if (act.type === 'investigate') {
            investigations.push({ detectiveId: actorId, targetId });
        }
    });

    // --- Tekshiruvlar ---
    investigations.forEach(({ detectiveId, targetId }) => {
        const det = room.players.get(detectiveId);
        const target = room.players.get(targetId);
        if (!det || !target) return;
        const targetRole = ROLES[target.role];
        const isThreat = target.role === 'josus' || target.role === 'qotil';

        if (isThreat) det.killUnlockedOn = targetId;

        emitTo(detectiveId, 'detectiveResult', {
            nickname: target.nickname,
            role: target.role,
            roleName: targetRole.name,
            isThreat,
            canKillNextNight: isThreat
        });
    });

    // --- Hujumlar ---
    const deaths = [];   // { id, nickname, role, byRole, byId }
    const savedByDoctor = [];
    const guardDeaths = [];

    attacks.forEach(atk => {
        const target = room.players.get(atk.targetId);
        if (!target || !target.isAlive) return;
        if (deaths.some(d => d.id === atk.targetId)) return; // allaqachon o'ldi

        // Shifokor qutqardimi?
        if (heals.has(atk.targetId)) {
            savedByDoctor.push({ id: atk.targetId, nickname: target.nickname });
            return;
        }

        // Qo'riqchi himoya qildimi?
        if (guards.has(atk.targetId)) {
            const guardId = guards.get(atk.targetId);
            const guard = room.players.get(guardId);
            if (guard && guard.isAlive && guardId !== atk.targetId) {
                guard.isAlive = false;
                guardDeaths.push({ id: guardId, nickname: guard.nickname, savedNickname: target.nickname });
                // Qutqarilgan odam hujumchini biladi
                const attacker = room.players.get(atk.attackerId);
                if (attacker) {
                    emitTo(atk.targetId, 'guardRevealed', {
                        guardNickname: guard.nickname,
                        attackerNickname: attacker.nickname,
                        attackerRole: attacker.role,
                        attackerRoleName: ROLES[attacker.role].name
                    });
                }
                return;
            }
        }

        // O'ldi
        target.isAlive = false;
        deaths.push({
            id: atk.targetId, nickname: target.nickname, role: target.role,
            byRole: atk.attackerRole, byId: atk.attackerId, isDetectiveKill: !!atk.isDetectiveKill
        });
    });

    // --- Xabarlar ---
    savedByDoctor.forEach(() => {
        sendSystemMessage(roomId, `⚕️ Shifokor qiyin operatsiyadan so'ng qurbonni qutqarib qoldi.`, 'save');
    });

    guardDeaths.forEach(g => {
        sendSystemMessage(roomId, `🛡️ Qo'riqchi ${g.nickname} bir insonni qutqarib mardlarcha halok bo'ldi.`, 'death');
    });

    deaths.forEach(d => {
        const roleName = ROLES[d.role].name;
        if (d.isDetectiveKill) {
            const det = room.players.get(d.byId);
            const detName = det ? det.nickname : 'Detektiv';
            sendSystemMessage(roomId, `🔍 Detektiv ${detName} ${roleName.toLowerCase()} ${d.nickname} ni o'ldirdi.`, 'death');
        } else if (d.byRole === 'josus') {
            sendSystemMessage(roomId, `🕵️ Josus ${d.nickname} ni o'ldirdi, qurbon ${roleName} edi.`, 'death');
        } else if (d.byRole === 'qotil') {
            sendSystemMessage(roomId, `🔪 Qotil ${d.nickname} ni o'ldirdi, qurbon ${roleName} edi.`, 'death');
        }
        emitTo(d.id, 'youDied', { role: d.role });
    });

    // --- Sayyoh guvohligi ---
    visits.forEach((targetId, travelerId) => {
        const traveler = room.players.get(travelerId);
        if (!traveler || !traveler.isAlive) return;
        const death = deaths.find(d => d.id === targetId && !d.isDetectiveKill);
        if (!death) return;
        const killer = room.players.get(death.byId);
        if (!killer) return;
        sendSystemMessage(roomId, `🧳 Sayyoh qotillikka guvoh bo'ldi.`, 'info');
        emitTo(travelerId, 'travelerWitness', {
            victimNickname: death.nickname,
            killerNickname: killer.nickname,
            killerRole: killer.role,
            killerRoleName: ROLES[killer.role].name
        });
    });

    if (deaths.length === 0 && guardDeaths.length === 0 && savedByDoctor.length === 0) {
        sendSystemMessage(roomId, `🌅 Tun tinch o'tdi, hech kim halok bo'lmadi.`, 'info');
    }

    // Detektiv o'ldirish huquqini ishlatgan bo'lsa tozalaymiz
    actions.forEach((act, actorId) => {
        if (act.type === 'detectiveKill') {
            const det = room.players.get(actorId);
            if (det) det.killUnlockedOn = null;
        }
    });

    room.night = null;
    broadcastPlayers(roomId);

    const ended = checkWinConditions(roomId);
    if (!ended) startVotingPhase(roomId);
}

// ==================== OVOZ BERISH ====================
function startVotingPhase(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.phase = 'voting';
    room.voting = { votes: new Map() };

    const candidates = alivePlayers(room).map(([id, p]) => ({ id, nickname: p.nickname }));

    sendSystemMessage(roomId, `🗳️ Ovoz berish boshlandi! ${room.settings.voteSeconds} soniya vaqt bor.`, 'vote');

    alivePlayers(room).forEach(([id]) => {
        emitTo(id, 'openVoteModalForAll', { players: candidates, seconds: room.settings.voteSeconds });
    });
    io.to(roomId).emit('phaseChanged', { phase: 'voting', seconds: room.settings.voteSeconds, roundNumber: room.roundNumber });

    if (room.voteTimer) clearTimeout(room.voteTimer);
    room.voteTimer = setTimeout(() => tallyVotes(roomId), room.settings.voteSeconds * 1000);
}

function tallyVotes(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'voting' || !room.voting) return;
    if (room.voteTimer) { clearTimeout(room.voteTimer); room.voteTimer = null; }

    const snapshot = Array.from(room.voting.votes.entries()).map(([v, t]) => ({
        voter: room.players.get(v) ? room.players.get(v).nickname : '?',
        target: room.players.get(t) ? room.players.get(t).nickname : '?'
    }));
    room.recap.push({ type: 'vote', round: room.roundNumber, votes: snapshot });

    const tally = new Map();
    room.voting.votes.forEach(t => tally.set(t, (tally.get(t) || 0) + 1));

    let max = 0, top = [];
    tally.forEach((c, t) => {
        if (c > max) { max = c; top = [t]; }
        else if (c === max) top.push(t);
    });

    room.voting = null;
    room.phase = 'resolving';

    if (max === 0 || top.length !== 1) {
        io.to(roomId).emit('voteResult', { message: "Ovozlar teng bo'ldi. Hech kim chiqarilmadi." });
        sendSystemMessage(roomId, "⚖️ Ovozlar teng bo'ldi, hech kim chiqarilmadi.", 'vote');
        nextRound(roomId);
        return;
    }

    const targetId = top[0];
    const target = room.players.get(targetId);
    if (!target) { nextRound(roomId); return; }

    target.isAlive = false;
    const roleName = ROLES[target.role].name;
    room.recap.push({ type: 'eliminate', round: room.roundNumber, nickname: target.nickname, role: target.role });

    const msg = `🗳️ ${target.nickname} ovoz berish natijasida chiqarildi. U ${roleName} edi.`;
    io.to(roomId).emit('voteResult', { message: msg });
    sendSystemMessage(roomId, msg, 'vote');
    emitTo(targetId, 'youDied', { role: target.role });

    // Telba chiqarilsa — u g'olib, lekin o'yin davom etadi
    if (target.role === 'telba') {
        room.jesterWinners.push(target.nickname);
        sendSystemMessage(roomId, `🤪 ${target.nickname} TELBA edi — u o'z maqsadiga erishdi va G'OLIB bo'ldi! O'yin davom etadi.`, 'jester');
    }

    broadcastPlayers(roomId);

    const ended = checkWinConditions(roomId);
    if (!ended) nextRound(roomId);
}

// ==================== RAUND ====================
function nextRound(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.started) return;
    room.roundNumber++;
    room.phase = 'discussion';
    room.players.forEach(p => { p.investigatedThisRound = false; });
    sendSystemMessage(roomId, `☀️ ${room.roundNumber}-raund boshlandi. Navbat bilan so'z ayting.`, 'round');
    io.to(roomId).emit('phaseChanged', { phase: 'discussion', roundNumber: room.roundNumber });
    buildTurnOrder(room);
    startTurn(roomId);
}

// ==================== G'ALABA SHARTLARI ====================
function checkWinConditions(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.started) return false;

    const aliveSpies = countAliveByTeam(room, 'josus');
    const aliveCrew = countAliveByTeam(room, 'crew');
    const aliveQotil = alivePlayers(room).filter(([, p]) => p.role === 'qotil').length;
    const totalAlive = alivePlayers(room).length;

    // Qotil yolg'iz qolsa
    if (aliveQotil > 0 && totalAlive === aliveQotil) {
        endGame(roomId, 'qotil', `Qotil g'alaba qozondi — hamma halok bo'ldi!`);
        return true;
    }

    // Josuslar yo'q va qotil yo'q -> jamoa yutdi
    if (aliveSpies === 0 && aliveQotil === 0) {
        endGame(roomId, 'crew', `Jamoa g'alaba qozondi! Barcha josuslar fosh etildi.`);
        return true;
    }

    // Josuslar soni qolganlarga tenglashsa
    if (aliveSpies > 0 && aliveSpies >= (totalAlive - aliveSpies)) {
        endGame(roomId, 'josus', `Josuslar g'alaba qozondi! Ular ko'pchilikka aylandi.`);
        return true;
    }

    // Hech kim qolmasa
    if (totalAlive === 0) {
        endGame(roomId, 'nobody', `Hech kim omon qolmadi.`);
        return true;
    }

    return false;
}

function endGame(roomId, winner, message) {
    const room = rooms.get(roomId);
    if (!room) return;
    clearRoomTimers(room);

    const roleReveal = Array.from(room.players.values()).map(p => ({
        nickname: p.nickname, role: p.role, roleName: ROLES[p.role] ? ROLES[p.role].name : '?',
        icon: ROLES[p.role] ? ROLES[p.role].icon : '', isAlive: p.isAlive
    }));

    // Reyting
    room.players.forEach(p => {
        const e = ensureLeaderboardEntry(room, p.nickname);
        e.games += 1;
        const team = ROLES[p.role] ? ROLES[p.role].team : 'crew';
        let won = false;
        if (winner === 'crew' && team === 'crew') won = true;
        if (winner === 'josus' && team === 'josus') won = true;
        if (winner === 'qotil' && p.role === 'qotil') won = true;
        if (room.jesterWinners.includes(p.nickname)) won = true;
        if (won) e.wins += 1;
    });

    io.to(roomId).emit('gameOver', {
        winner, message,
        word: room.word,
        roleReveal,
        jesterWinners: room.jesterWinners,
        recap: room.recap,
        leaderboard: getLeaderboardArray(room)
    });

    room.started = false;
    room.phase = 'lobby';
    room.word = null;
    room.roundNumber = 0;
    room.turnOrder = [];
    room.turnIndex = 0;
    room.night = null;
    room.voting = null;
    room.jesterWinners = [];
    room.players.forEach(p => {
        p.isAlive = true; p.isReady = false; p.role = null;
        p.healedTargets = new Set(); p.killUnlockedOn = null;
    });
    broadcastPlayers(roomId);
    broadcastPublicRooms();
}

function resetRoomToLobby(roomId, reason) {
    const room = rooms.get(roomId);
    if (!room) return;
    clearRoomTimers(room);
    room.started = false;
    room.phase = 'lobby';
    room.word = null;
    room.roundNumber = 0;
    room.turnOrder = [];
    room.turnIndex = 0;
    room.night = null;
    room.voting = null;
    room.jesterWinners = [];
    room.players.forEach(p => {
        p.isAlive = true; p.isReady = false; p.role = null;
        p.healedTargets = new Set(); p.killUnlockedOn = null;
    });
    io.to(roomId).emit('playerLeftGameOver', { message: reason });
    broadcastPlayers(roomId);
    broadcastPublicRooms();
}

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
    onlineCount++;
    broadcastOnlineCount();

    socket.on('getOnlineCount', () => socket.emit('onlineCount', { count: onlineCount, rooms: rooms.size }));

    socket.on('browsePublicRooms', () => {
        socket.join(LOBBY_BROWSER);
        socket.emit('publicRoomsUpdate', { rooms: getPublicRoomsList() });
    });
    socket.on('stopBrowsing', () => socket.leave(LOBBY_BROWSER));

    socket.on('createLobby', ({ nickname, isPublic, roomName }) => {
        if (!nickname || !nickname.trim()) { socket.emit('errorMsg', "Nickname noto'g'ri!"); return; }
        const roomId = generateRoomCode();
        rooms.set(roomId, {
            hostId: socket.id,
            isPublic: !!isPublic,
            roomName: (roomName || '').trim().slice(0, 24) || `${nickname.trim()} xonasi`,
            players: new Map([[socket.id, {
                nickname: nickname.trim(), isReady: false, isAlive: true, role: null,
                healedTargets: new Set(), killUnlockedOn: null
            }]]),
            started: false, phase: 'lobby', word: null, wordRevealed: false,
            settings: defaultSettings(),
            turnOrder: [], turnIndex: 0, turnTimer: null,
            nightTimer: null, voteTimer: null,
            roundNumber: 0, night: null, voting: null,
            recap: [], messageCounter: 0, reactions: new Map(),
            leaderboard: new Map(), jesterWinners: []
        });
        socket.join(roomId);
        socket.leave(LOBBY_BROWSER);
        socket.emit('lobbyCreated', { roomId });
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    socket.on('joinLobby', ({ roomId, nickname }) => {
        const room = rooms.get(roomId);
        if (!room) { socket.emit('errorMsg', 'Bunday xona topilmadi!'); return; }
        if (room.started) { socket.emit('errorMsg', "O'yin allaqachon boshlangan!"); return; }
        if (room.players.size >= room.settings.maxPlayers) {
            socket.emit('errorMsg', `Xona to'lgan! (${room.players.size}/${room.settings.maxPlayers})`); return;
        }
        if (!nickname || !nickname.trim()) { socket.emit('errorMsg', "Nickname noto'g'ri!"); return; }
        const taken = Array.from(room.players.values()).some(p => p.nickname.toLowerCase() === nickname.trim().toLowerCase());
        if (taken) { socket.emit('errorMsg', 'Bu nickname band!'); return; }

        room.players.set(socket.id, {
            nickname: nickname.trim(), isReady: false, isAlive: true, role: null,
            healedTargets: new Set(), killUnlockedOn: null
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
        const p = room.players.get(socket.id);
        if (!p) return;
        const t = (nickname || '').trim();
        if (!t) return;
        if (Array.from(room.players.entries()).some(([id, x]) => id !== socket.id && x.nickname.toLowerCase() === t.toLowerCase())) {
            socket.emit('errorMsg', 'Bu nickname band!'); return;
        }
        const old = p.nickname;
        p.nickname = t;
        broadcastPlayers(roomId);
        sendSystemMessage(roomId, `${old} nickname'ini "${t}" ga o'zgartirdi.`);
    });

    socket.on('toggleRoomVisibility', ({ roomId, isPublic }) => {
        const room = rooms.get(roomId);
        if (!room || socket.id !== room.hostId) return;
        room.isPublic = !!isPublic;
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    socket.on('updateSettings', ({ roomId, settings }) => {
        const room = rooms.get(roomId);
        if (!room || room.started) return;
        if (socket.id !== room.hostId) { socket.emit('errorMsg', "Faqat host sozlamalarni o'zgartira oladi!"); return; }
        const s = room.settings;
        if (settings.turnSeconds !== undefined) s.turnSeconds = Math.max(10, Math.min(120, parseInt(settings.turnSeconds) || 30));
        if (settings.nightSeconds !== undefined) s.nightSeconds = Math.max(10, Math.min(120, parseInt(settings.nightSeconds) || 30));
        if (settings.voteSeconds !== undefined) s.voteSeconds = Math.max(10, Math.min(120, parseInt(settings.voteSeconds) || 30));
        if (settings.category !== undefined && CATEGORIES[settings.category]) s.category = settings.category;
        if (settings.maxPlayers !== undefined) {
            const c = Math.max(MIN_ROOM_SIZE, Math.min(MAX_ROOM_SIZE, parseInt(settings.maxPlayers) || DEFAULT_ROOM_SIZE));
            if (c < room.players.size) socket.emit('errorMsg', `Xonada ${room.players.size} kishi bor, limitni kamaytirib bo'lmaydi!`);
            else s.maxPlayers = c;
        }
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    socket.on('toggleReady', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || room.started) return;
        const p = room.players.get(socket.id);
        if (!p) return;
        p.isReady = !p.isReady;
        broadcastPlayers(roomId);
    });

    socket.on('kickPlayer', ({ roomId, playerId }) => {
        const room = rooms.get(roomId);
        if (!room || room.started || socket.id !== room.hostId || playerId === room.hostId) return;
        const t = io.sockets.sockets.get(playerId);
        room.players.delete(playerId);
        if (t) { t.emit('kicked'); t.leave(roomId); }
        broadcastPlayers(roomId);
        broadcastPublicRooms();
    });

    socket.on('startGame', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;
        if (socket.id !== room.hostId) { socket.emit('errorMsg', "Faqat host o'yinni boshlashi mumkin!"); return; }
        const n = room.players.size;
        if (n < MIN_ROOM_SIZE) { socket.emit('errorMsg', `Kamida ${MIN_ROOM_SIZE} ta o'yinchi kerak! (hozir ${n})`); return; }
        if (n > MAX_ROOM_SIZE) { socket.emit('errorMsg', `Ko'pi bilan ${MAX_ROOM_SIZE} ta o'yinchi!`); return; }
        if (Array.from(room.players.entries()).some(([id, p]) => id !== room.hostId && !p.isReady)) {
            socket.emit('errorMsg', "Barcha o'yinchilar Tayyor bo'lishi kerak!"); return;
        }

        if (!assignRoles(room)) { socket.emit('errorMsg', "Rol taqsimoti topilmadi!"); return; }

        const catKey = room.settings.category;
        const words = CATEGORIES[catKey].words;
        room.word = words[Math.floor(Math.random() * words.length)];
        room.started = true;
        room.phase = 'discussion';
        room.roundNumber = 1;
        room.recap = [];
        room.reactions = new Map();
        room.messageCounter = 0;
        room.wordRevealed = false;
        room.jesterWinners = [];

        room.players.forEach((p, id) => {
            const r = ROLES[p.role];
            emitTo(id, 'gameStarted', {
                role: p.role, roleName: r.name, roleIcon: r.icon, roleDesc: r.desc, team: r.team,
                word: r.knowsWord ? room.word : null,
                category: CATEGORIES[catKey].name,
                totalPlayers: n,
                distribution: ROLE_DISTRIBUTION[n]
            });
        });

        sendSystemMessage(roomId, `🎮 O'yin boshlandi! Kategoriya: ${CATEGORIES[catKey].name}. ${n} o'yinchi.`, 'round');
        io.to(roomId).emit('phaseChanged', { phase: 'discussion', roundNumber: 1 });
        buildTurnOrder(room);
        startTurn(roomId);
        broadcastPublicRooms();
    });

    // ---------- CHAT ----------
    socket.on('sendMessage', ({ roomId, message }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        const p = room.players.get(socket.id);
        if (!p) return;
        const text = (message || '').trim();
        if (!text) return;

        // O'lganlar — arvohlar chati
        if (!p.isAlive) {
            const ghost = { type: 'ghost', nickname: p.nickname, message: text };
            room.players.forEach((op, oid) => { if (!op.isAlive) emitTo(oid, 'receiveMessage', ghost); });
            return;
        }

        if (room.phase !== 'discussion') { socket.emit('errorMsg', 'Hozir gapirish vaqti emas!'); return; }
        if (currentTurnPlayerId(room) !== socket.id) { socket.emit('errorMsg', 'Hozir sizning navbatingiz emas!'); return; }

        room.messageCounter++;
        const msgId = 'm' + room.messageCounter;
        const saysWord = messageRevealsWord(text, room.word);

        // JOSUS so'zni topdi -> darhol g'alaba
        if (p.role === 'josus' && saysWord) {
            io.to(roomId).emit('receiveMessage', { type: 'player', id: msgId, nickname: p.nickname, message: text, round: room.roundNumber });
            room.recap.push({ type: 'message', round: room.roundNumber, nickname: p.nickname, message: text });
            sendSystemMessage(roomId, `🎯 ${p.nickname} maxfiy so'zni topdi! So'z: "${room.word}"`, 'spywin');
            endGame(roomId, 'josus', `Josuslar g'alaba qozondi! ${p.nickname} maxfiy so'zni topdi.`);
            return;
        }

        // Oddiy o'yinchi so'zni oshkor qildi
        const revealed = p.role !== 'josus' && saysWord;
        const firstReveal = revealed && !room.wordRevealed;
        if (firstReveal) room.wordRevealed = true;

        io.to(roomId).emit('receiveMessage', {
            type: 'player', id: msgId, nickname: p.nickname, message: text,
            round: room.roundNumber, revealedWord: revealed
        });
        room.recap.push({ type: 'message', round: room.roundNumber, nickname: p.nickname, message: text, revealedWord: revealed });

        if (firstReveal) {
            sendSystemMessage(roomId, `⚠️ ${p.nickname} maxfiy so'zni oshkor qildi! Endi josus ham so'zni biladi.`, 'reveal');
            room.players.forEach((op, oid) => {
                if (op.role === 'josus') emitTo(oid, 'wordRevealedToImposter', { word: room.word, by: p.nickname });
            });
        }

        advanceTurn(roomId);
    });

    socket.on('reactToMessage', ({ roomId, messageId, emoji }) => {
        const room = rooms.get(roomId);
        if (!room || !room.started) return;
        if (!room.players.has(socket.id)) return;
        if (!['👍','😂','🤔','😱','🧐'].includes(emoji)) return;
        if (!room.reactions.has(messageId)) room.reactions.set(messageId, new Map());
        const mr = room.reactions.get(messageId);
        if (!mr.has(emoji)) mr.set(emoji, new Set());
        const users = mr.get(emoji);
        if (users.has(socket.id)) users.delete(socket.id); else users.add(socket.id);
        const summary = {};
        mr.forEach((set, e) => { if (set.size) summary[e] = set.size; });
        io.to(roomId).emit('reactionUpdate', { messageId, reactions: summary });
    });

    // ---------- TUNGI HARAKAT ----------
    socket.on('nightAction', ({ roomId, type, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || room.phase !== 'night' || !room.night) return;
        const p = room.players.get(socket.id);
        if (!p || !p.isAlive) return;

        const roleDef = ROLES[p.role];
        if (!roleDef || !roleDef.night) return;

        const target = room.players.get(targetId);
        if (!target || !target.isAlive) { socket.emit('errorMsg', "Bu o'yinchini tanlab bo'lmaydi!"); return; }

        // Ruxsat etilgan harakat turlarini tekshiramiz
        if (type === 'detectiveKill') {
            if (p.role !== 'detektiv' || p.killUnlockedOn !== targetId) {
                socket.emit('errorMsg', "Siz bu odamni o'ldira olmaysiz!"); return;
            }
        } else if (type !== roleDef.night) {
            socket.emit('errorMsg', "Noto'g'ri harakat!"); return;
        }

        // O'ziga qarshi harakat cheklovlari
        if (targetId === socket.id && type !== 'heal') {
            socket.emit('errorMsg', "O'zingizni tanlay olmaysiz!"); return;
        }

        // Shifokor bir odamni ikki marta qutqara olmaydi
        if (type === 'heal' && p.healedTargets.has(targetId)) {
            socket.emit('errorMsg', "Bu odamni allaqachon qutqargansiz!"); return;
        }

        room.night.actions.set(socket.id, { type, targetId });
        socket.emit('nightActionAccepted', { type, targetId, targetNickname: target.nickname });
        maybeFinishNight(roomId);
    });

    socket.on('castVote', ({ roomId, targetId }) => {
        const room = rooms.get(roomId);
        if (!room || room.phase !== 'voting' || !room.voting) return;
        const voter = room.players.get(socket.id);
        const target = room.players.get(targetId);
        if (!voter || !voter.isAlive || !target || !target.isAlive) return;
        if (targetId === socket.id) return;
        room.voting.votes.set(socket.id, targetId);
        const eligible = alivePlayers(room).length;
        if (room.voting.votes.size >= eligible) tallyVotes(roomId);
    });

    socket.on('disconnect', () => {
        onlineCount = Math.max(0, onlineCount - 1);
        broadcastOnlineCount();

        for (const [roomId, room] of rooms.entries()) {
            if (!room.players.has(socket.id)) continue;
            const leaving = room.players.get(socket.id);
            const wasHost = socket.id === room.hostId;
            const wasTurn = currentTurnPlayerId(room) === socket.id;
            room.players.delete(socket.id);

            if (room.players.size === 0) { clearRoomTimers(room); rooms.delete(roomId); broadcastPublicRooms(); continue; }
            if (wasHost) room.hostId = room.players.keys().next().value;

            if (room.started) {
                if (alivePlayers(room).length < 3) {
                    resetRoomToLobby(roomId, `${leaving.nickname} chiqib ketdi. O'yin bekor qilindi.`);
                } else {
                    room.turnOrder = room.turnOrder.filter(id => id !== socket.id);
                    if (room.night) room.night.actions.delete(socket.id);
                    if (room.voting) room.voting.votes.delete(socket.id);
                    sendSystemMessage(roomId, `${leaving.nickname} o'yindan chiqib ketdi.`);
                    broadcastPlayers(roomId);
                    if (!checkWinConditions(roomId)) {
                        if (room.phase === 'discussion' && wasTurn) {
                            if (room.turnIndex >= room.turnOrder.length) startNightPhase(roomId);
                            else startTurn(roomId);
                        } else if (room.phase === 'night') maybeFinishNight(roomId);
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

function getLiveStats() {
    let waiting = 0, inGame = 0, playersInRooms = 0;
    rooms.forEach(r => { playersInRooms += r.players.size; if (r.started) inGame++; else waiting++; });
    return { online: onlineCount, totalRooms: rooms.size, waitingRooms: waiting, inGameRooms: inGame, playersInRooms };
}

startTelegramBot(getLiveStats);
startDiscordBot(getLiveStats);

module.exports = { ROLE_DISTRIBUTION, ROLES, messageRevealsWord };
