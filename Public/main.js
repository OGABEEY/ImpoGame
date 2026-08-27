const socket = io();

// ==================== HOLAT ====================
function getSavedNickname() { return localStorage.getItem('imposter_nickname') || ''; }
function saveNickname(name) { localStorage.setItem('imposter_nickname', name); }

let nickname = getSavedNickname();
let currentRoomId = null;
let isHost = false;
let isMuted = false;
let isMyTurn = false;
let isDetective = false;
let detectiveUsed = false;
let myPlayers = [];
let turnTimerInterval = null;
let voteTimerInterval = null;

const screens = {
  mainMenu: document.getElementById('main-menu'),
  imposterMenu: document.getElementById('imposter-menu'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen')
};
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function refreshNicknameBadge() {
  document.getElementById('nicknameDisplay').textContent = nickname || "O'yinchi";
  document.getElementById('nicknameInput').value = nickname;
}

function promptNicknameChange() {
  const newName = prompt("Yangi nickname kiriting:", nickname || '');
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  nickname = trimmed; saveNickname(trimmed); refreshNicknameBadge();
  if (currentRoomId) socket.emit('changeNickname', { roomId: currentRoomId, nickname: trimmed });
}
document.getElementById('editNicknameBtn').addEventListener('click', promptNicknameChange);
document.getElementById('nicknameInput').addEventListener('change', (e) => {
  const val = e.target.value.trim();
  if (val) { nickname = val; saveNickname(val); refreshNicknameBadge(); }
});

// ==================== NAVIGATSIYA ====================
document.getElementById('goToImposter').addEventListener('click', () => {
  showScreen('imposterMenu');
  socket.emit('browsePublicRooms');
});
document.getElementById('backToMainFromMenu').addEventListener('click', () => {
  showScreen('mainMenu');
  socket.emit('stopBrowsing');
});
document.getElementById('refreshRoomsBtn').addEventListener('click', () => socket.emit('browsePublicRooms'));

document.getElementById('createLobbyBtn').addEventListener('click', () => {
  const val = document.getElementById('nicknameInput').value.trim();
  if (!val) { alert('Nickname kiriting!'); return; }
  nickname = val; saveNickname(val); refreshNicknameBadge();
  const isPublic = document.getElementById('roomVisibility').value === 'public';
  const roomName = document.getElementById('roomNameInput').value.trim();
  socket.emit('createLobby', { nickname, isPublic, roomName });
});

document.getElementById('joinLobbyBtn').addEventListener('click', () => {
  const val = document.getElementById('nicknameInput').value.trim();
  const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
  if (!val) { alert('Nickname kiriting!'); return; }
  if (!roomId) { alert('Xona kodini kiriting!'); return; }
  nickname = val; saveNickname(val); refreshNicknameBadge();
  socket.emit('joinLobby', { roomId, nickname });
});

socket.on('lobbyCreated', ({ roomId }) => enterLobby(roomId));
socket.on('joinedLobby', ({ roomId }) => enterLobby(roomId));
function enterLobby(roomId) {
  currentRoomId = roomId;
  document.getElementById('roomIdDisplay').textContent = roomId;
  showScreen('lobby');
}

socket.on('kicked', () => { alert("Siz xonadan chiqarib yuborildingiz."); location.reload(); });
socket.on('errorMsg', (msg) => alert(msg));

// ==================== ONLAYN HISOBLAGICH ====================
socket.on('onlineCount', ({ count, rooms: roomCount }) => {
  const el = document.getElementById('onlineCountText');
  if (!el) return;
  const roomPart = roomCount > 0 ? ` · ${roomCount} ta xona` : '';
  el.textContent = `${count} kishi onlayn${roomPart}`;
});

// Noyob tashrifchi ID (brauzerда saqlanadi)
function getVisitorId() {
  let id = localStorage.getItem('imposter_visitor_id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'v_' + Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem('imposter_visitor_id', id);
  }
  return id;
}

socket.on('connect', () => {
  socket.emit('getOnlineCount');
  socket.emit('registerVisit', { visitorId: getVisitorId() });
});

// ==================== OCHIQ XONALAR RO'YXATI ====================
socket.on('publicRoomsUpdate', ({ rooms: list }) => {
  const box = document.getElementById('publicRoomsList');
  box.innerHTML = '';

  if (!list || list.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = "Hozircha ochiq xona yo'q — birinchi bo'lib yarating!";
    box.appendChild(p);
    return;
  }

  list.forEach(r => {
    const card = document.createElement('div');
    card.className = 'room-card' + ((r.started || r.isFull) ? ' room-busy' : '');

    const top = document.createElement('div');
    top.className = 'room-top';

    const nm = document.createElement('span');
    nm.className = 'room-name';
    nm.textContent = r.name;
    top.appendChild(nm);

    const status = document.createElement('span');
    const statusClass = r.started ? 'status-busy' : (r.isFull ? 'status-full' : 'status-open');
    status.className = 'room-status ' + statusClass;
    status.textContent = r.started ? "O'yin ketmoqda" : (r.isFull ? "To'lgan" : 'Kutmoqda');
    top.appendChild(status);
    card.appendChild(top);

    const meta = document.createElement('div');
    meta.className = 'room-meta';
    meta.textContent = `👥 ${r.playerCount}/${r.maxPlayers} · 🏷️ ${r.category} · 🕵️ ${r.imposterCount} ta` +
      (r.detectiveEnabled ? ' · 🔍 detektiv' : '');
    card.appendChild(meta);

    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary room-join-btn';
    if (r.started) {
      btn.textContent = 'Band';
      btn.disabled = true;
    } else if (r.isFull) {
      btn.textContent = "To'lgan";
      btn.disabled = true;
    } else {
      btn.textContent = '➡️ Qo\'shilish';
      btn.addEventListener('click', () => {
        const val = document.getElementById('nicknameInput').value.trim();
        if (!val) { alert('Avval nickname kiriting!'); return; }
        nickname = val; saveNickname(val); refreshNicknameBadge();
        socket.emit('joinLobby', { roomId: r.roomId, nickname });
      });
    }
    card.appendChild(btn);
    box.appendChild(card);
  });
});

// ==================== XONA TURINI O'ZGARTIRISH (host) ====================
let roomIsPublic = false;
document.getElementById('toggleVisibilityBtn').addEventListener('click', () => {
  socket.emit('toggleRoomVisibility', { roomId: currentRoomId, isPublic: !roomIsPublic });
});

function renderVisibility(isPublic, isHostNow) {
  roomIsPublic = isPublic;
  const badge = document.getElementById('visibilityBadge');
  const btn = document.getElementById('toggleVisibilityBtn');

  badge.textContent = isPublic ? '🌍 Ochiq xona' : '🔒 Yopiq xona';
  badge.className = 'vis-badge ' + (isPublic ? 'vis-public' : 'vis-private');

  btn.style.display = isHostNow ? 'inline-block' : 'none';
  btn.textContent = isPublic ? '🔒 Yopiq qilish' : '🌍 Ochiq qilish';
}

// ==================== LOBBY ====================
let categoriesLoaded = false;

socket.on('updatePlayers', ({ players, hostId, settings, categories, leaderboard, isPublic, roomName }) => {
  myPlayers = players;
  isHost = (socket.id === hostId);

  renderVisibility(!!isPublic, isHost);

  // Kategoriyalar ro'yxati
  if (!categoriesLoaded && categories) {
    const sel = document.getElementById('setCategory');
    sel.innerHTML = '';
    categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.key; opt.textContent = c.name;
      sel.appendChild(opt);
    });
    categoriesLoaded = true;
  }

  // Sozlamalarni ko'rsatish
  if (settings) {
    document.getElementById('setCategory').value = settings.category;
    document.getElementById('setMaxPlayers').value = String(settings.maxPlayers);
    document.getElementById('setImposterCount').value = String(settings.imposterCount);
    document.getElementById('setDetective').value = String(settings.detectiveEnabled);
    document.getElementById('setTurnSeconds').value = String(settings.turnSeconds);
    document.getElementById('setVoteSeconds').value = String(settings.voteSeconds);
  }

  document.querySelectorAll('.host-control').forEach(el => { el.disabled = !isHost; });
  document.getElementById('hostOnlyNote').style.display = isHost ? 'none' : 'block';

  // O'yinchilar ro'yxati
  const list = document.getElementById('playerList');
  list.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.className = 'player-name';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.nickname;
    left.appendChild(nameSpan);

    if (p.id === hostId) {
      const b = document.createElement('span');
      b.className = 'badge badge-host'; b.textContent = 'HOST';
      left.appendChild(b);
    }
    const rb = document.createElement('span');
    rb.className = 'badge ' + (p.isReady ? 'badge-ready' : 'badge-waiting');
    rb.textContent = p.isReady ? 'Tayyor' : 'Kutmoqda';
    left.appendChild(rb);

    if (p.id === socket.id) {
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn'; editBtn.textContent = '✏️';
      editBtn.addEventListener('click', promptNicknameChange);
      left.appendChild(editBtn);
    }
    li.appendChild(left);

    if (isHost && p.id !== hostId) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'icon-btn'; kickBtn.textContent = '❌';
      kickBtn.addEventListener('click', () => socket.emit('kickPlayer', { roomId: currentRoomId, playerId: p.id }));
      li.appendChild(kickBtn);
    }
    list.appendChild(li);
  });

  const cap = settings ? settings.maxPlayers : 10;
  const badge = document.getElementById('playerCountBadge');
  badge.textContent = `${players.length}/${cap}`;
  badge.className = 'count-badge' + (players.length >= cap ? ' count-full' : '');

  document.getElementById('startGameBtn').style.display = isHost ? 'block' : 'none';
  renderLeaderboard(leaderboard, document.getElementById('leaderboardBox'));
});

// Sozlama o'zgarishlari
['setCategory','setMaxPlayers','setImposterCount','setDetective','setTurnSeconds','setVoteSeconds'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    if (!isHost) return;
    socket.emit('updateSettings', {
      roomId: currentRoomId,
      settings: {
        category: document.getElementById('setCategory').value,
        maxPlayers: document.getElementById('setMaxPlayers').value,
        imposterCount: document.getElementById('setImposterCount').value,
        detectiveEnabled: document.getElementById('setDetective').value === 'true',
        turnSeconds: document.getElementById('setTurnSeconds').value,
        voteSeconds: document.getElementById('setVoteSeconds').value
      }
    });
  });
});

document.getElementById('readyBtn').addEventListener('click', () => socket.emit('toggleReady', { roomId: currentRoomId }));
document.getElementById('startGameBtn').addEventListener('click', () => socket.emit('startGame', { roomId: currentRoomId }));

function renderLeaderboard(leaderboard, container) {
  if (!container) return;
  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = '<p class="empty-note">Hali o\'yin o\'ynalmadi</p>';
    return;
  }
  container.innerHTML = '';
  leaderboard.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'lb-row';

    const rank = document.createElement('span');
    rank.className = 'lb-rank';
    rank.textContent = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + '.';

    const name = document.createElement('span');
    name.className = 'lb-name';
    name.textContent = entry.nickname;

    const score = document.createElement('span');
    score.className = 'lb-score';
    score.textContent = `${entry.wins}/${entry.games}`;

    row.appendChild(rank); row.appendChild(name); row.appendChild(score);
    container.appendChild(row);

    if (entry.achievements && entry.achievements.length) {
      const ach = document.createElement('div');
      ach.className = 'lb-achievements';
      entry.achievements.forEach(a => {
        const wrap = document.createElement('span');
        wrap.className = 'ach-wrap';

        const icon = document.createElement('span');
        icon.className = 'ach-icon';
        icon.textContent = a.icon;
        wrap.appendChild(icon);

        const tip = document.createElement('span');
        tip.className = 'ach-tooltip';
        const t = document.createElement('b');
        t.textContent = a.title;
        tip.appendChild(t);
        tip.appendChild(document.createElement('br'));
        tip.appendChild(document.createTextNode(a.desc));
        wrap.appendChild(tip);

        ach.appendChild(wrap);
      });
      container.appendChild(ach);
    }
  });
}

// ==================== O'YIN BOSHLANISHI ====================
socket.on('gameStarted', ({ role, isImposter, word, isDetective: det, category, totalImposters }) => {
  showScreen('game');
  document.getElementById('chatBox').innerHTML = '';
  isMuted = false; isMyTurn = false;
  isDetective = det; detectiveUsed = false;

  const roleDisplay = document.getElementById('roleDisplay');
  if (isImposter) {
    roleDisplay.innerHTML = `🕵️ <b>JOSUS</b> · ${category}` +
      (totalImposters > 1 ? ` · ${totalImposters} ta josus bor` : '');
    roleDisplay.className = 'role-badge role-imposter';
  } else if (det) {
    roleDisplay.innerHTML = `🔍 <b>DETEKTIV</b> · So'z: <b>${word}</b>`;
    roleDisplay.className = 'role-badge role-detective';
  } else {
    roleDisplay.innerHTML = `👤 Ishtirokchi · So'z: <b>${word}</b>`;
    roleDisplay.className = 'role-badge';
  }

  document.getElementById('detectiveBtn').style.display = det ? 'inline-block' : 'none';
  document.getElementById('detectiveBtn').disabled = false;

  // Shaxsiy rol xabari (faqat o'zi ko'radi)
  if (isImposter) {
    appendMessage({
      type: 'system',
      message: `🕵️ Siz JOSUSsiz! Maxfiy so'z sizga berilmaydi — boshqalarning gaplaridan uni topishga harakat qiling va fosh bo'lmang.`
    });
  } else if (det) {
    appendMessage({
      type: 'system',
      message: `🔍 Siz DETEKTIVsiz! Maxfiy so'z: "${word}". Bir marta istalgan o'yinchini tekshirib, uning josus ekanini bilib olishingiz mumkin.`
    });
  } else {
    appendMessage({
      type: 'system',
      message: `👤 Siz ISHTIROKCHIsiz! Maxfiy so'z: "${word}". So'zni to'g'ridan-to'g'ri yozmang — aks holda josus ham uni bilib oladi!`
    });
  }

  const voteBtn = document.getElementById('voteBtn');
  voteBtn.disabled = true;
  voteBtn.textContent = '🗳️ Ovoz berish';
});

// ==================== NAVBAT ====================
socket.on('turnChanged', ({ currentPlayerId, currentNickname, seconds, roundNumber, turnPosition, turnTotal }) => {
  isMyTurn = (currentPlayerId === socket.id);
  const banner = document.getElementById('turnBanner');
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendMessageBtn');

  if (turnTimerInterval) clearInterval(turnTimerInterval);
  let remaining = seconds;

  function paint() {
    if (isMuted) {
      banner.textContent = `👻 Siz arvohsiz — faqat arvohlar chatida yozasiz`;
      banner.className = 'turn-banner ghost-banner';
      return;
    }
    if (isMyTurn) {
      banner.textContent = `✍️ SIZNING NAVBATINGIZ! (${remaining}s) · Raund ${roundNumber} · ${turnPosition}/${turnTotal}`;
      banner.className = 'turn-banner my-turn';
    } else {
      banner.textContent = `⏳ Navbat: ${currentNickname} (${remaining}s) · Raund ${roundNumber} · ${turnPosition}/${turnTotal}`;
      banner.className = 'turn-banner';
    }
  }
  paint();

  turnTimerInterval = setInterval(() => {
    remaining--;
    if (remaining < 0) { clearInterval(turnTimerInterval); return; }
    paint();
  }, 1000);

  if (isMyTurn && !isMuted) {
    input.disabled = false; sendBtn.disabled = false;
    input.placeholder = "So'zingizni yozing...";
    input.focus();
  } else if (isMuted) {
    input.disabled = false; sendBtn.disabled = false;
    input.placeholder = "Arvohlar chatiga yozing...";
  } else {
    input.disabled = true; sendBtn.disabled = true;
    input.placeholder = "Navbatingizni kuting...";
  }
});

socket.on('roundFinished', () => {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  const banner = document.getElementById('turnBanner');
  banner.textContent = '✅ Raund tugadi! Ovoz berishni boshlashingiz mumkin.';
  banner.className = 'turn-banner round-done';
  isMyTurn = false;
  if (!isMuted) {
    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendMessageBtn').disabled = true;
  }
});

socket.on('voteUnlocked', () => {
  if (isMuted) return;
  const voteBtn = document.getElementById('voteBtn');
  voteBtn.disabled = false;
  voteBtn.textContent = '🗳️ Ovoz berish';
});

// ==================== CHAT ====================
const EMOJIS = ['👍', '😂', '🤔', '😱', '🧐'];

function appendMessage(payload) {
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');

  if (payload.type === 'system') {
    div.className = 'chat-msg system';
    div.textContent = payload.message;
  } else if (payload.type === 'ghost') {
    div.className = 'chat-msg ghost';
    const s = document.createElement('span');
    s.className = 'sender'; s.textContent = '👻 ' + payload.nickname + ': ';
    div.appendChild(s);
    div.appendChild(document.createTextNode(payload.message));
  } else {
    div.className = 'chat-msg';
    div.dataset.msgId = payload.id;

    if (payload.revealedWord) {
      const warn = document.createElement('div');
      warn.className = 'reveal-warning';
      warn.textContent = "⚠️ Maxfiy so'z oshkor qilindi — endi josus ham ushbu so'zni biladi!";
      div.appendChild(warn);
      div.classList.add('msg-revealed');
    }

    const head = document.createElement('div');
    const s = document.createElement('span');
    s.className = 'sender'; s.textContent = payload.nickname + ': ';
    head.appendChild(s);
    head.appendChild(document.createTextNode(payload.message));
    div.appendChild(head);

    // Reaksiya paneli
    const reactBar = document.createElement('div');
    reactBar.className = 'react-bar';
    EMOJIS.forEach(e => {
      const b = document.createElement('button');
      b.className = 'react-btn'; b.textContent = e;
      b.addEventListener('click', () => {
        socket.emit('reactToMessage', { roomId: currentRoomId, messageId: payload.id, emoji: e });
      });
      reactBar.appendChild(b);
    });
    div.appendChild(reactBar);

    const summary = document.createElement('div');
    summary.className = 'react-summary';
    summary.dataset.summaryFor = payload.id;
    div.appendChild(summary);
  }

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

socket.on('receiveMessage', appendMessage);

socket.on('reactionUpdate', ({ messageId, reactions }) => {
  const el = document.querySelector(`[data-summary-for="${messageId}"]`);
  if (!el) return;
  el.innerHTML = '';
  Object.entries(reactions).forEach(([emoji, count]) => {
    const chip = document.createElement('span');
    chip.className = 'react-chip';
    chip.textContent = `${emoji} ${count}`;
    el.appendChild(chip);
  });
});

function sendChatMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message) return;
  socket.emit('sendMessage', { roomId: currentRoomId, message });
  input.value = '';
}
document.getElementById('sendMessageBtn').addEventListener('click', sendChatMessage);
document.getElementById('messageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

// ==================== MAXFIY SO'Z OSHKOR BO'LDI (josus uchun) ====================
socket.on('wordRevealedToImposter', ({ word, by }) => {
  const roleDisplay = document.getElementById('roleDisplay');
  roleDisplay.innerHTML = `🕵️ <b>JOSUS</b> · So'z fosh bo'ldi: <b>${word}</b>`;
  roleDisplay.className = 'role-badge role-imposter role-revealed';
  appendMessage({
    type: 'system',
    message: `🎯 ${by} maxfiy so'zni oshkor qildi! So'z: "${word}" — endi siz ham bilasiz.`
  });
});

// ==================== ARVOH ====================
socket.on('playerMuted', () => {
  isMuted = true; isMyTurn = false;
  if (turnTimerInterval) clearInterval(turnTimerInterval);

  const banner = document.getElementById('turnBanner');
  banner.textContent = '👻 Siz arvohsiz! Faqat boshqa arvohlar bilan yozisha olasiz.';
  banner.className = 'turn-banner ghost-banner';

  const input = document.getElementById('messageInput');
  input.disabled = false;
  document.getElementById('sendMessageBtn').disabled = false;
  input.placeholder = "Arvohlar chatiga yozing...";

  const voteBtn = document.getElementById('voteBtn');
  voteBtn.disabled = true;
  voteBtn.textContent = '👻 Ovoz bera olmaysiz';
  document.getElementById('detectiveBtn').style.display = 'none';
});

// ==================== DETEKTIV ====================
document.getElementById('detectiveBtn').addEventListener('click', () => {
  if (detectiveUsed) { alert('Siz bu qobiliyatdan allaqachon foydalangansiz!'); return; }
  const list = document.getElementById('detectiveList');
  list.innerHTML = '';
  myPlayers.forEach(p => {
    if (p.id === socket.id || p.isMuted) return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = p.nickname;
    btn.addEventListener('click', () => {
      socket.emit('detectiveInvestigate', { roomId: currentRoomId, targetId: p.id });
      document.getElementById('detectiveModal').classList.remove('active');
    });
    li.appendChild(btn); list.appendChild(li);
  });
  document.getElementById('detectiveModal').classList.add('active');
});
document.getElementById('detectiveCancelBtn').addEventListener('click', () => {
  document.getElementById('detectiveModal').classList.remove('active');
});

socket.on('detectiveResult', ({ nickname: target, isImposter: imp }) => {
  detectiveUsed = true;
  document.getElementById('detectiveBtn').disabled = true;
  document.getElementById('detectiveBtn').textContent = '🔍 Ishlatildi';
  appendMessage({
    type: 'system',
    message: imp
      ? `🔍 TEKSHIRUV NATIJASI: ${target} — JOSUS! (faqat siz ko'rasiz)`
      : `🔍 TEKSHIRUV NATIJASI: ${target} — oddiy ishtirokchi. (faqat siz ko'rasiz)`
  });
});

// ==================== OVOZ BERISH ====================
document.getElementById('voteBtn').addEventListener('click', () => {
  socket.emit('startVotingProcess', { roomId: currentRoomId });
});

socket.on('openVoteModalForAll', ({ players, seconds }) => {
  const list = document.getElementById('voteList');
  list.innerHTML = '';
  players.forEach(p => {
    if (p.id === socket.id) return;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = p.nickname;
    btn.addEventListener('click', () => {
      socket.emit('castVote', { roomId: currentRoomId, targetId: p.id });
      document.getElementById('voteModal').classList.remove('active');
      if (voteTimerInterval) clearInterval(voteTimerInterval);
    });
    li.appendChild(btn); list.appendChild(li);
  });

  document.getElementById('voteModal').classList.add('active');

  let remaining = seconds;
  const timerEl = document.getElementById('voteTimer');
  timerEl.textContent = `${remaining} soniya qoldi`;
  if (voteTimerInterval) clearInterval(voteTimerInterval);
  voteTimerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) { clearInterval(voteTimerInterval); timerEl.textContent = 'Vaqt tugadi'; return; }
    timerEl.textContent = `${remaining} soniya qoldi`;
  }, 1000);
});

socket.on('voteResult', ({ message }) => {
  document.getElementById('voteModal').classList.remove('active');
  if (voteTimerInterval) clearInterval(voteTimerInterval);
  appendMessage({ type: 'system', message });
  const voteBtn = document.getElementById('voteBtn');
  voteBtn.disabled = true;
  voteBtn.textContent = '🗳️ Ovoz berish';
});

// ==================== O'YIN TUGASHI ====================
socket.on('gameOver', ({ winner, message, word, imposters, recap, newAchievements, leaderboard }) => {
  document.getElementById('voteModal').classList.remove('active');
  document.getElementById('detectiveModal').classList.remove('active');
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  if (voteTimerInterval) clearInterval(voteTimerInterval);

  document.getElementById('gameOverTitle').textContent =
    winner === 'imposter' ? '🕵️ Josus yutdi!' : '🎉 Jamoa yutdi!';
  document.getElementById('gameOverMessage').innerHTML =
    `${message}<br>Maxfiy so'z: <b>${word}</b>`;

  // Yangi yutuqlar
  const achBox = document.getElementById('newAchievementsBox');
  achBox.innerHTML = '';
  const mine = (newAchievements || []).filter(a => a.nickname === nickname);
  if (mine.length) {
    const title = document.createElement('div');
    title.className = 'ach-title'; title.textContent = '🎁 Yangi yutuqlar:';
    achBox.appendChild(title);
    mine.forEach(a => {
      const d = document.createElement('div');
      d.className = 'ach-new';
      d.textContent = `${a.icon} ${a.title} — ${a.desc}`;
      achBox.appendChild(d);
    });
  }

  renderRecap(recap, imposters);
  renderLeaderboard(leaderboard, document.getElementById('boardContent'));
  document.getElementById('gameOverModal').classList.add('active');
});

function renderRecap(recap, imposters) {
  const box = document.getElementById('recapContent');
  box.innerHTML = '';

  const impLine = document.createElement('div');
  impLine.className = 'recap-imposters';
  impLine.textContent = `🕵️ Josus${imposters.length > 1 ? 'lar' : ''}: ${imposters.join(', ')}`;
  box.appendChild(impLine);

  if (!recap || !recap.length) {
    const p = document.createElement('p');
    p.className = 'empty-note'; p.textContent = 'Tarix bo\'sh';
    box.appendChild(p);
    return;
  }

  let lastRound = null;
  recap.forEach(item => {
    if (item.round && item.round !== lastRound) {
      lastRound = item.round;
      const h = document.createElement('div');
      h.className = 'recap-round'; h.textContent = `— ${item.round}-raund —`;
      box.appendChild(h);
    }
    const d = document.createElement('div');
    if (item.type === 'message') {
      d.className = 'recap-line' + (item.revealedWord ? ' recap-revealed' : '');
      const isImp = imposters.includes(item.nickname);
      const flag = item.revealedWord ? ' ⚠️' : '';
      d.innerHTML = `<b>${isImp ? '🕵️ ' : ''}${item.nickname}:</b> ${escapeHtml(item.message)}${flag}`;
    } else if (item.type === 'vote') {
      d.className = 'recap-vote';
      const lines = item.votes.map(v => `${v.voter} → ${v.target}`).join(' · ');
      d.textContent = `🗳️ ${lines || 'Hech kim ovoz bermadi'}`;
    } else if (item.type === 'eliminate') {
      d.className = 'recap-elim';
      d.textContent = item.wasImposter
        ? `❌ ${item.nickname} chiqarildi — JOSUS edi!`
        : `❌ ${item.nickname} susdirildi — josus emas edi`;
    } else {
      d.className = 'recap-system';
      d.textContent = item.message;
    }
    box.appendChild(d);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Tab almashtirish
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab === 'recap' ? 'recapContent' : 'boardContent';
    document.getElementById(target).classList.add('active');
  });
});

document.getElementById('gameOverCloseBtn').addEventListener('click', () => {
  document.getElementById('gameOverModal').classList.remove('active');
  resetGameUI();
  showScreen('lobby');
});

socket.on('playerLeftGameOver', ({ message }) => {
  alert(message);
  document.getElementById('gameOverModal').classList.remove('active');
  document.getElementById('voteModal').classList.remove('active');
  document.getElementById('detectiveModal').classList.remove('active');
  resetGameUI();
  showScreen('lobby');
});

function resetGameUI() {
  isMuted = false; isMyTurn = false; isDetective = false; detectiveUsed = false;
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  if (voteTimerInterval) clearInterval(voteTimerInterval);
  const input = document.getElementById('messageInput');
  input.disabled = true; input.placeholder = "Navbatingizni kuting...";
  document.getElementById('sendMessageBtn').disabled = true;
  document.getElementById('detectiveBtn').style.display = 'none';
  document.getElementById('detectiveBtn').disabled = false;
  document.getElementById('detectiveBtn').textContent = '🔍 Tekshirish';
}

// ==================== QOIDALAR PANELI (ochish/yopish) ====================
document.getElementById('rulesToggle').addEventListener('click', () => {
  document.getElementById('rulesBody').classList.toggle('hidden');
  document.getElementById('rulesArrow').classList.toggle('collapsed');
});

refreshNicknameBadge();
