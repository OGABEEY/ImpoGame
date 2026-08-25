const socket = io();

// ==================== CLIENT ID / NICKNAME (localStorage) ====================
function getClientId() {
  let id = localStorage.getItem('imposter_client_id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'c_' + Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem('imposter_client_id', id);
  }
  return id;
}
function getSavedNickname() {
  return localStorage.getItem('imposter_nickname') || '';
}
function saveNickname(name) {
  localStorage.setItem('imposter_nickname', name);
}

const clientId = getClientId();
let nickname = getSavedNickname();
let currentRoomId = null;
let currentPlayers = [];
let isHost = false;
let voteCooldownTimer = null;

// ==================== DOM ====================
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
  nickname = trimmed;
  saveNickname(trimmed);
  refreshNicknameBadge();
  if (currentRoomId) {
    socket.emit('changeNickname', { roomId: currentRoomId, nickname: trimmed });
  }
}

document.getElementById('editNicknameBtn').addEventListener('click', promptNicknameChange);

document.getElementById('nicknameInput').addEventListener('change', (e) => {
  const val = e.target.value.trim();
  if (val) { nickname = val; saveNickname(val); refreshNicknameBadge(); }
});

// ==================== NAVIGATSIYA ====================
document.getElementById('goToImposter').addEventListener('click', () => {
  showScreen('imposterMenu');
  socket.emit('getStats', { clientId });
});
document.getElementById('backToMainFromMenu').addEventListener('click', () => showScreen('mainMenu'));

// ==================== STATISTIKA ====================
socket.on('statsData', ({ wins, games }) => {
  document.getElementById('statWins').textContent = wins;
  document.getElementById('statGames').textContent = games;
  const rate = games > 0 ? Math.round((wins / games) * 100) : 0;
  document.getElementById('winrateFill').style.width = rate + '%';
  document.getElementById('winrateText').textContent = rate + '%';
});

// ==================== LOBBY YARATISH / QO'SHILISH ====================
document.getElementById('createLobbyBtn').addEventListener('click', () => {
  const val = document.getElementById('nicknameInput').value.trim();
  if (!val) { alert('Nickname kiriting!'); return; }
  nickname = val; saveNickname(val); refreshNicknameBadge();
  socket.emit('createLobby', { nickname, clientId });
});

document.getElementById('joinLobbyBtn').addEventListener('click', () => {
  const val = document.getElementById('nicknameInput').value.trim();
  const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();
  if (!val) { alert('Nickname kiriting!'); return; }
  if (!roomId) { alert('Xona kodini kiriting!'); return; }
  nickname = val; saveNickname(val); refreshNicknameBadge();
  socket.emit('joinLobby', { roomId, nickname, clientId });
});

socket.on('lobbyCreated', ({ roomId }) => enterLobby(roomId));
socket.on('joinedLobby', ({ roomId }) => enterLobby(roomId));

function enterLobby(roomId) {
  currentRoomId = roomId;
  document.getElementById('roomIdDisplay').textContent = roomId;
  showScreen('lobby');
}

socket.on('kicked', () => {
  alert("Siz xonadan chiqarib yuborildingiz.");
  location.reload();
});

socket.on('errorMsg', (msg) => alert(msg));

// ==================== LOBBY: PLAYER LIST ====================
socket.on('updatePlayers', ({ players, hostId }) => {
  currentPlayers = players;
  isHost = (socket.id === hostId);

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
    const readyBadge = document.createElement('span');
    readyBadge.className = 'badge ' + (p.isReady ? 'badge-ready' : 'badge-waiting');
    readyBadge.textContent = p.isReady ? 'Tayyor' : 'Kutmoqda';
    left.appendChild(readyBadge);

    if (p.id === socket.id) {
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.textContent = '✏️';
      editBtn.title = "Nickname o'zgartirish";
      editBtn.addEventListener('click', promptNicknameChange);
      left.appendChild(editBtn);
    }

    li.appendChild(left);

    if (isHost && p.id !== hostId) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'icon-btn';
      kickBtn.textContent = '❌';
      kickBtn.title = "Chiqarib yuborish";
      kickBtn.addEventListener('click', () => {
        socket.emit('kickPlayer', { roomId: currentRoomId, playerId: p.id });
      });
      li.appendChild(kickBtn);
    }

    list.appendChild(li);
  });

  document.getElementById('startGameBtn').style.display = isHost ? 'block' : 'none';
});

document.getElementById('readyBtn').addEventListener('click', () => {
  socket.emit('toggleReady', { roomId: currentRoomId });
});

document.getElementById('startGameBtn').addEventListener('click', () => {
  socket.emit('startGame', { roomId: currentRoomId });
});

// ==================== O'YIN BOSHLANISHI ====================
socket.on('gameStarted', ({ role, word }) => {
  showScreen('game');
  document.getElementById('chatBox').innerHTML = '';
  const roleDisplay = document.getElementById('roleDisplay');

  if (word) {
    roleDisplay.textContent = `👤 ${role} — Maxfiy so'z: ${word}`;
  } else {
    roleDisplay.textContent = `🕵️ Siz IMPOSTERSIZ! So'zni bilmaysiz, boshqalarni kuzating.`;
  }

  const voteBtn = document.getElementById('voteBtn');
  voteBtn.disabled = true;
  startVoteCooldownUI(30);

  document.getElementById('messageInput').disabled = false;
  document.getElementById('sendMessageBtn').disabled = false;
  document.getElementById('messageInput').placeholder = "Xabaringizni yozing...";
});

function startVoteCooldownUI(seconds) {
  const voteBtn = document.getElementById('voteBtn');
  voteBtn.disabled = true;
  let remaining = seconds;
  voteBtn.textContent = `🗳️ Ovoz berish (${remaining}s)`;
  if (voteCooldownTimer) clearInterval(voteCooldownTimer);
  voteCooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(voteCooldownTimer);
      voteBtn.disabled = false;
      voteBtn.textContent = '🗳️ Ovoz berish';
    } else {
      voteBtn.textContent = `🗳️ Ovoz berish (${remaining}s)`;
    }
  }, 1000);
}

socket.on('voteUnlocked', () => {
  const voteBtn = document.getElementById('voteBtn');
  if (voteCooldownTimer) clearInterval(voteCooldownTimer);
  voteBtn.disabled = false;
  voteBtn.textContent = '🗳️ Ovoz berish';
});

// ==================== CHAT ====================
function appendChatMessage(nick, message, isSystem) {
  const box = document.getElementById('chatBox');
  const div = document.createElement('div');
  div.className = 'chat-msg' + (isSystem ? ' system' : '');
  if (isSystem) {
    div.textContent = message;
  } else {
    const senderSpan = document.createElement('span');
    senderSpan.className = 'sender';
    senderSpan.textContent = nick + ': ';
    div.appendChild(senderSpan);
    div.appendChild(document.createTextNode(message));
  }
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

socket.on('receiveMessage', ({ nickname: nick, message }) => {
  appendChatMessage(nick, message, nick === 'Tizim');
});

document.getElementById('sendMessageBtn').addEventListener('click', sendChatMessage);
document.getElementById('messageInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message) return;
  socket.emit('sendMessage', { roomId: currentRoomId, message });
  input.value = '';
}

socket.on('playerMuted', () => {
  document.getElementById('messageInput').disabled = true;
  document.getElementById('sendMessageBtn').disabled = true;
  document.getElementById('messageInput').placeholder = "Siz chiqarib yuborildingiz";
});

// ==================== OVOZ BERISH ====================
document.getElementById('voteBtn').addEventListener('click', () => {
  socket.emit('startVotingProcess', { roomId: currentRoomId });
});

socket.on('openVoteModalForAll', ({ players }) => {
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
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
  document.getElementById('voteModal').classList.add('active');
});

socket.on('voteResult', ({ message }) => {
  document.getElementById('voteModal').classList.remove('active');
  appendChatMessage('Tizim', message, true);
  const voteBtn = document.getElementById('voteBtn');
  voteBtn.disabled = true;
  voteBtn.textContent = '🗳️ Kuting...';
});

// ==================== O'YIN TUGASHI ====================
socket.on('gameOver', ({ winner, message }) => {
  document.getElementById('voteModal').classList.remove('active');
  document.getElementById('gameOverTitle').textContent = winner === 'imposter' ? '🕵️ Imposter yutdi!' : "🎉 Jamoa yutdi!";
  document.getElementById('gameOverMessage').textContent = message;
  document.getElementById('gameOverModal').classList.add('active');
});

// O'yin tugaganda modalni yopib, XONA MENYUSIGA (Lobby) qaytarish
document.getElementById('gameOverCloseBtn').addEventListener('click', () => {
  document.getElementById('gameOverModal').classList.remove('active');
  socket.emit('getStats', { clientId }); // Statistikani yangilash
  showScreen('lobby');
});

socket.on('playerLeftGameOver', ({ message }) => {
  alert(message);
  showScreen('lobby');
});

// ==================== BOSHLANG'ICH YUKLASH ====================
refreshNicknameBadge();