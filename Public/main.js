const socket = io();

// ==================== HOLAT ====================
function getSavedNickname() { return localStorage.getItem('imposter_nickname') || ''; }
function saveNickname(n) { localStorage.setItem('imposter_nickname', n); }

let nickname = getSavedNickname();
let currentRoomId = null;
let isHost = false;
let roomIsPublic = false;
let myPlayers = [];
let myRole = null;
let myTeam = null;
let iAmAlive = true;
let isMyTurn = false;
let turnTimerInterval = null, nightTimerInterval = null, voteTimerInterval = null;
let notes = [];
let roleInfoCache = [];
let roleTableCache = null;

const screens = {
  mainMenu: document.getElementById('main-menu'),
  imposterMenu: document.getElementById('imposter-menu'),
  lobby: document.getElementById('lobby-screen'),
  game: document.getElementById('game-screen')
};
function showScreen(n){ Object.values(screens).forEach(s=>s.classList.remove('active')); screens[n].classList.add('active'); }

function refreshNicknameBadge(){
  document.getElementById('nicknameDisplay').textContent = nickname || "O'yinchi";
  document.getElementById('nicknameInput').value = nickname;
}
function promptNicknameChange(){
  const v = prompt("Yangi nickname:", nickname||'');
  if(v===null) return;
  const t=v.trim(); if(!t) return;
  nickname=t; saveNickname(t); refreshNicknameBadge();
  if(currentRoomId) socket.emit('changeNickname',{roomId:currentRoomId,nickname:t});
}
document.getElementById('editNicknameBtn').addEventListener('click', promptNicknameChange);
document.getElementById('nicknameInput').addEventListener('change', e=>{
  const v=e.target.value.trim(); if(v){nickname=v;saveNickname(v);refreshNicknameBadge();}
});

// ==================== NAVIGATSIYA ====================
document.getElementById('goToImposter').addEventListener('click', ()=>{ showScreen('imposterMenu'); socket.emit('browsePublicRooms'); });
document.getElementById('backToMainFromMenu').addEventListener('click', ()=>{ showScreen('mainMenu'); socket.emit('stopBrowsing'); });
document.getElementById('refreshRoomsBtn').addEventListener('click', ()=>socket.emit('browsePublicRooms'));

socket.on('connect', ()=>socket.emit('getOnlineCount'));
socket.on('onlineCount', ({count, rooms})=>{
  const el=document.getElementById('onlineCountText'); if(!el) return;
  el.textContent = `${count} kishi onlayn` + (rooms>0?` · ${rooms} ta xona`:'');
});

document.getElementById('createLobbyBtn').addEventListener('click', ()=>{
  const v=document.getElementById('nicknameInput').value.trim();
  if(!v){alert('Nickname kiriting!');return;}
  nickname=v; saveNickname(v); refreshNicknameBadge();
  socket.emit('createLobby',{
    nickname,
    isPublic: document.getElementById('roomVisibility').value==='public',
    roomName: document.getElementById('roomNameInput').value.trim()
  });
});
document.getElementById('joinLobbyBtn').addEventListener('click', ()=>{
  const v=document.getElementById('nicknameInput').value.trim();
  const r=document.getElementById('roomIdInput').value.trim().toUpperCase();
  if(!v){alert('Nickname kiriting!');return;}
  if(!r){alert('Xona kodini kiriting!');return;}
  nickname=v; saveNickname(v); refreshNicknameBadge();
  socket.emit('joinLobby',{roomId:r,nickname});
});
socket.on('lobbyCreated', ({roomId})=>enterLobby(roomId));
socket.on('joinedLobby', ({roomId})=>enterLobby(roomId));
function enterLobby(id){ currentRoomId=id; document.getElementById('roomIdDisplay').textContent=id; showScreen('lobby'); }
socket.on('kicked', ()=>{ alert("Siz xonadan chiqarib yuborildingiz."); location.reload(); });
socket.on('errorMsg', m=>alert(m));

// ==================== OCHIQ XONALAR ====================
socket.on('publicRoomsUpdate', ({rooms:list})=>{
  const box=document.getElementById('publicRoomsList'); box.innerHTML='';
  if(!list||!list.length){ box.innerHTML='<p class="empty-note">Hozircha ochiq xona yo\'q — birinchi bo\'lib yarating!</p>'; return; }
  list.forEach(r=>{
    const card=document.createElement('div');
    card.className='room-card'+((r.started||r.isFull)?' room-busy':'');
    const top=document.createElement('div'); top.className='room-top';
    const nm=document.createElement('span'); nm.className='room-name'; nm.textContent=r.name; top.appendChild(nm);
    const st=document.createElement('span');
    st.className='room-status '+(r.started?'status-busy':(r.isFull?'status-full':'status-open'));
    st.textContent=r.started?"O'yin ketmoqda":(r.isFull?"To'lgan":'Kutmoqda');
    top.appendChild(st); card.appendChild(top);
    const meta=document.createElement('div'); meta.className='room-meta';
    meta.textContent=`👥 ${r.playerCount}/${r.maxPlayers} · 🏷️ ${r.category}`;
    card.appendChild(meta);
    const b=document.createElement('button'); b.className='btn btn-secondary room-join-btn';
    if(r.started){b.textContent='Band';b.disabled=true;}
    else if(r.isFull){b.textContent="To'lgan";b.disabled=true;}
    else{ b.textContent="➡️ Qo'shilish"; b.addEventListener('click',()=>{
      const v=document.getElementById('nicknameInput').value.trim();
      if(!v){alert('Avval nickname kiriting!');return;}
      nickname=v; saveNickname(v); refreshNicknameBadge();
      socket.emit('joinLobby',{roomId:r.roomId,nickname});
    });}
    card.appendChild(b); box.appendChild(card);
  });
});

// ==================== XONA TURI ====================
document.getElementById('toggleVisibilityBtn').addEventListener('click',()=>{
  socket.emit('toggleRoomVisibility',{roomId:currentRoomId,isPublic:!roomIsPublic});
});
function renderVisibility(pub,host){
  roomIsPublic=pub;
  const b=document.getElementById('visibilityBadge'), t=document.getElementById('toggleVisibilityBtn');
  b.textContent=pub?'🌍 Ochiq xona':'🔒 Yopiq xona';
  b.className='vis-badge '+(pub?'vis-public':'vis-private');
  t.style.display=host?'inline-block':'none';
  t.textContent=pub?'🔒 Yopiq qilish':'🌍 Ochiq qilish';
}

// ==================== LOBBY ====================
let catsLoaded=false, maxLoaded=false, rolesRendered=false;

socket.on('updatePlayers', ({players,hostId,settings,categories,leaderboard,isPublic,roleTable,roleInfo})=>{
  myPlayers=players; isHost=(socket.id===hostId);
  renderVisibility(!!isPublic,isHost);

  if(!catsLoaded && categories){
    const s=document.getElementById('setCategory'); s.innerHTML='';
    categories.forEach(c=>{const o=document.createElement('option');o.value=c.key;o.textContent=c.name;s.appendChild(o);});
    catsLoaded=true;
  }
  if(!maxLoaded){
    const s=document.getElementById('setMaxPlayers'); s.innerHTML='';
    for(let i=4;i<=15;i++){const o=document.createElement('option');o.value=String(i);o.textContent=i+' kishi';s.appendChild(o);}
    maxLoaded=true;
  }
  if(!rolesRendered && roleInfo){ roleInfoCache=roleInfo; roleTableCache=roleTable; renderRoleDocs(); rolesRendered=true; }

  if(settings){
    document.getElementById('setCategory').value=settings.category;
    document.getElementById('setMaxPlayers').value=String(settings.maxPlayers);
    document.getElementById('setTurnSeconds').value=String(settings.turnSeconds);
    document.getElementById('setNightSeconds').value=String(settings.nightSeconds);
    document.getElementById('setVoteSeconds').value=String(settings.voteSeconds);
  }
  document.querySelectorAll('.host-control').forEach(e=>e.disabled=!isHost);
  document.getElementById('hostOnlyNote').style.display=isHost?'none':'block';

  const list=document.getElementById('playerList'); list.innerHTML='';
  players.forEach(p=>{
    const li=document.createElement('li');
    const left=document.createElement('div'); left.className='player-name';
    const nm=document.createElement('span'); nm.textContent=p.nickname; left.appendChild(nm);
    if(p.id===hostId){const b=document.createElement('span');b.className='badge badge-host';b.textContent='HOST';left.appendChild(b);}
    const rb=document.createElement('span'); rb.className='badge '+(p.isReady?'badge-ready':'badge-waiting');
    rb.textContent=p.isReady?'Tayyor':'Kutmoqda'; left.appendChild(rb);
    if(p.id===socket.id){const e=document.createElement('button');e.className='icon-btn';e.textContent='✏️';e.addEventListener('click',promptNicknameChange);left.appendChild(e);}
    li.appendChild(left);
    if(isHost&&p.id!==hostId){const k=document.createElement('button');k.className='icon-btn';k.textContent='❌';
      k.addEventListener('click',()=>socket.emit('kickPlayer',{roomId:currentRoomId,playerId:p.id}));li.appendChild(k);}
    list.appendChild(li);
  });

  const cap=settings?settings.maxPlayers:10;
  const badge=document.getElementById('playerCountBadge');
  badge.textContent=`${players.length}/${cap}`;
  badge.className='count-badge'+(players.length>=cap?' count-full':'');

  document.getElementById('startGameBtn').style.display=isHost?'block':'none';
  renderLeaderboard(leaderboard, document.getElementById('leaderboardBox'));
  renderLivePlayers(players);
});

['setCategory','setMaxPlayers','setTurnSeconds','setNightSeconds','setVoteSeconds'].forEach(id=>{
  document.getElementById(id).addEventListener('change',()=>{
    if(!isHost) return;
    socket.emit('updateSettings',{roomId:currentRoomId,settings:{
      category:document.getElementById('setCategory').value,
      maxPlayers:document.getElementById('setMaxPlayers').value,
      turnSeconds:document.getElementById('setTurnSeconds').value,
      nightSeconds:document.getElementById('setNightSeconds').value,
      voteSeconds:document.getElementById('setVoteSeconds').value
    }});
  });
});

document.getElementById('readyBtn').addEventListener('click',()=>socket.emit('toggleReady',{roomId:currentRoomId}));
document.getElementById('startGameBtn').addEventListener('click',()=>socket.emit('startGame',{roomId:currentRoomId}));

function renderLeaderboard(lb,box){
  if(!box) return;
  if(!lb||!lb.length){box.innerHTML='<p class="empty-note">Hali o\'yin o\'ynalmadi</p>';return;}
  box.innerHTML='';
  lb.forEach((e,i)=>{
    const row=document.createElement('div'); row.className='lb-row';
    const r=document.createElement('span'); r.className='lb-rank';
    r.textContent=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';
    const n=document.createElement('span'); n.className='lb-name'; n.textContent=e.nickname;
    const s=document.createElement('span'); s.className='lb-score'; s.textContent=`${e.wins}/${e.games}`;
    row.appendChild(r);row.appendChild(n);row.appendChild(s); box.appendChild(row);
  });
}

function renderRoleDocs(){
  const box=document.getElementById('roleCardsBox'); box.innerHTML='';
  roleInfoCache.forEach(r=>{
    const c=document.createElement('div');
    c.className='role-card role-team-'+r.team;
    const h=document.createElement('div'); h.className='role-card-head';
    h.innerHTML=`${r.icon} <b>${r.name}</b> <span class="team-tag team-${r.team}">${r.team==='crew'?'jamoa':r.team==='josus'?'josus':'neytral'}</span>`;
    const p=document.createElement('p'); p.textContent=r.desc;
    c.appendChild(h); c.appendChild(p); box.appendChild(c);
  });

  const tb=document.getElementById('roleTableBox'); tb.innerHTML='';
  if(!roleTableCache) return;
  const iconOf={};
  roleInfoCache.forEach(r=>iconOf[r.key]=r.icon);
  Object.entries(roleTableCache).forEach(([n,d])=>{
    const row=document.createElement('div'); row.className='rt-row';
    const c=document.createElement('span'); c.className='rt-count'; c.textContent=n+' kishi';
    const v=document.createElement('span'); v.className='rt-roles';
    v.textContent=Object.entries(d).map(([k,q])=>`${iconOf[k]||''}${q>1?'×'+q:''}`).join(' ');
    row.appendChild(c); row.appendChild(v); tb.appendChild(row);
  });
}

// ==================== O'YIN BOSHLANISHI ====================
socket.on('gameStarted', ({role,roleName,roleIcon,roleDesc,team,word,category,totalPlayers,distribution})=>{
  showScreen('game');
  document.getElementById('chatBox').innerHTML='';
  myRole=role; myTeam=team; iAmAlive=true; isMyTurn=false; notes=[];
  renderNotes();

  const rd=document.getElementById('roleDisplay');
  rd.innerHTML = word
    ? `${roleIcon} <b>${roleName.toUpperCase()}</b> · So'z: <b>${word}</b>`
    : `${roleIcon} <b>${roleName.toUpperCase()}</b> · ${category}`;
  rd.className='role-badge role-team-'+team;

  appendMessage({type:'system', message:`${roleIcon} Siz ${roleName.toUpperCase()}siz! ${roleDesc}`, kind:'role'});
  if(word) appendMessage({type:'system', message:`🔑 Maxfiy so'z: "${word}" — uni to'g'ridan-to'g'ri yozmang!`, kind:'role'});
  else appendMessage({type:'system', message:`🎯 So'zni bilmaysiz. Topib chatga yozsangiz — darhol yutasiz!`, kind:'role'});

  const dist=Object.entries(distribution).map(([k,v])=>`${v}×${k}`).join(', ');
  appendMessage({type:'system', message:`👥 ${totalPlayers} o'yinchi: ${dist}`, kind:'info'});
});

// ==================== BOSQICHLAR ====================
socket.on('phaseChanged', ({phase,roundNumber})=>{
  const pb=document.getElementById('phaseBadge');
  if(phase==='discussion'){ pb.textContent=`☀️ Muhokama · ${roundNumber}-raund`; pb.className='phase-badge phase-day'; }
  else if(phase==='night'){ pb.textContent=`🌙 Tun · ${roundNumber}-raund`; pb.className='phase-badge phase-night'; }
  else if(phase==='voting'){ pb.textContent=`🗳️ Ovoz berish · ${roundNumber}-raund`; pb.className='phase-badge phase-vote'; }
});

socket.on('turnChanged', ({currentPlayerId,currentNickname,seconds,roundNumber,turnPosition,turnTotal})=>{
  isMyTurn=(currentPlayerId===socket.id);
  const banner=document.getElementById('turnBanner');
  const input=document.getElementById('messageInput'), btn=document.getElementById('sendMessageBtn');
  if(turnTimerInterval) clearInterval(turnTimerInterval);
  let rem=seconds;
  function paint(){
    if(!iAmAlive){ banner.textContent='👻 Siz o\'lgansiz — faqat arvohlar chatida yozasiz'; banner.className='turn-banner ghost-banner'; return; }
    banner.textContent = isMyTurn
      ? `✍️ SIZNING NAVBATINGIZ! (${rem}s) · ${turnPosition}/${turnTotal}`
      : `⏳ Navbat: ${currentNickname} (${rem}s) · ${turnPosition}/${turnTotal}`;
    banner.className='turn-banner'+(isMyTurn?' my-turn':'');
  }
  paint();
  turnTimerInterval=setInterval(()=>{rem--; if(rem<0){clearInterval(turnTimerInterval);return;} paint();},1000);

  if(!iAmAlive){ input.disabled=false; btn.disabled=false; input.placeholder="Arvohlar chatiga yozing..."; }
  else if(isMyTurn){ input.disabled=false; btn.disabled=false; input.placeholder="So'zingizni yozing..."; input.focus(); }
  else { input.disabled=true; btn.disabled=true; input.placeholder="Navbatingizni kuting..."; }
});

// ==================== TUN ====================
const NIGHT_UI = {
  kill:        {title:"🔪 Kimni o'ldirasiz?",       desc:"Nishonni tanlang."},
  heal:        {title:"⚕️ Kimni qutqarasiz?",       desc:"Har odamni faqat bir marta. O'zingizni ham tanlashingiz mumkin."},
  investigate: {title:"🔍 Kimni tekshirasiz?",      desc:"Josus yoki qotilni topsangiz, keyingi tunda uni o'ldira olasiz."},
  guard:       {title:"🛡️ Kimni qo'riqlaysiz?",    desc:"Unga hujum bo'lsa siz o'lasiz, lekin u hujumchini biladi."},
  visit:       {title:"🧳 Kimnikiga borasiz?",      desc:"O'sha odam o'ldirilsa, qotilni bilib olasiz."}
};

socket.on('nightPhase', ({seconds,action,killTarget,candidates,healedAlready,roleName})=>{
  document.getElementById('voteModal').classList.remove('active');
  if(!iAmAlive || (!action && !killTarget)){
    document.getElementById('turnBanner').textContent = iAmAlive
      ? '🌙 Tun — maxsus rollar harakat qilmoqda, kuting...'
      : '👻 Tun — siz arvohsiz';
    document.getElementById('turnBanner').className='turn-banner night-banner';
    document.getElementById('messageInput').disabled=iAmAlive;
    document.getElementById('sendMessageBtn').disabled=iAmAlive;
    return;
  }

  const ui=NIGHT_UI[action]||{title:'🌙 Tun',desc:''};
  document.getElementById('nightTitle').textContent=ui.title;
  document.getElementById('nightDesc').textContent=ui.desc;

  const list=document.getElementById('nightList'); list.innerHTML='';

  if(killTarget){
    const li=document.createElement('li');
    const b=document.createElement('button'); b.className='night-kill-btn';
    b.textContent=`⚔️ ${killTarget.nickname} ni o'ldirish`;
    b.addEventListener('click',()=>{
      socket.emit('nightAction',{roomId:currentRoomId,type:'detectiveKill',targetId:killTarget.id});
      document.getElementById('nightModal').classList.remove('active');
    });
    li.appendChild(b); list.appendChild(li);
    const sep=document.createElement('li'); sep.className='night-sep'; sep.textContent='— yoki tekshirish —'; list.appendChild(sep);
  }

  (candidates||[]).forEach(c=>{
    if(action==='heal' && healedAlready && healedAlready.includes(c.id)) return;
    if(c.id===socket.id && action!=='heal') return;
    const li=document.createElement('li');
    const b=document.createElement('button');
    b.textContent=(c.id===socket.id?'⭐ ':'')+c.nickname;
    b.addEventListener('click',()=>{
      socket.emit('nightAction',{roomId:currentRoomId,type:action,targetId:c.id});
      document.getElementById('nightModal').classList.remove('active');
    });
    li.appendChild(b); list.appendChild(li);
  });

  document.getElementById('nightModal').classList.add('active');

  let rem=seconds;
  const t=document.getElementById('nightTimer');
  t.textContent=`${rem} soniya qoldi`;
  if(nightTimerInterval) clearInterval(nightTimerInterval);
  nightTimerInterval=setInterval(()=>{
    rem--;
    if(rem<=0){clearInterval(nightTimerInterval);t.textContent='Vaqt tugadi';
      document.getElementById('nightModal').classList.remove('active');return;}
    t.textContent=`${rem} soniya qoldi`;
  },1000);
});

document.getElementById('nightSkipBtn').addEventListener('click',()=>{
  document.getElementById('nightModal').classList.remove('active');
});

socket.on('nightActionAccepted', ({type,targetNickname})=>{
  const map={kill:"o'ldirish uchun",heal:'qutqarish uchun',investigate:'tekshirish uchun',
             guard:"qo'riqlash uchun",visit:'borish uchun',detectiveKill:"o'ldirish uchun"};
  appendMessage({type:'system',message:`✅ ${targetNickname} ${map[type]||''} tanlandi.`,kind:'info'});
});

// ==================== MAXSUS NATIJALAR ====================
socket.on('detectiveResult', ({nickname:t,roleName,isThreat,canKillNextNight})=>{
  const msg = isThreat
    ? `🔍 TEKSHIRUV: ${t} — ${roleName}! ${canKillNextNight?'Keyingi tunda uni o\'ldira olasiz.':''}`
    : `🔍 TEKSHIRUV: ${t} — ${roleName}. Xavfsiz.`;
  addNote(msg, isThreat?'danger':'ok');
  appendMessage({type:'system',message:msg+' (faqat siz ko\'rasiz)',kind:'secret'});
});

socket.on('travelerWitness', ({victimNickname,killerNickname,killerRoleName})=>{
  const msg=`🧳 GUVOHLIK: ${victimNickname} ni ${killerNickname} o'ldirdi — u ${killerRoleName}!`;
  addNote(msg,'danger');
  appendMessage({type:'system',message:msg+' (faqat siz ko\'rasiz)',kind:'secret'});
});

socket.on('guardRevealed', ({guardNickname,attackerNickname,attackerRoleName})=>{
  const msg=`🛡️ ${guardNickname} sizni qutqardi! Sizga hujum qilgan: ${attackerNickname} — ${attackerRoleName}!`;
  addNote(msg,'danger');
  appendMessage({type:'system',message:msg+' (faqat siz ko\'rasiz)',kind:'secret'});
});

socket.on('wordRevealedToImposter', ({word,by})=>{
  const rd=document.getElementById('roleDisplay');
  rd.innerHTML=`🕵️ <b>JOSUS</b> · So'z fosh bo'ldi: <b>${word}</b>`;
  rd.className='role-badge role-team-josus role-revealed';
  addNote(`🎯 Maxfiy so'z: "${word}" (${by} oshkor qildi)`,'ok');
  appendMessage({type:'system',message:`🎯 ${by} maxfiy so'zni oshkor qildi! So'z: "${word}" — endi uni chatga yozsangiz yutasiz!`,kind:'secret'});
});

socket.on('youDied', ({role})=>{
  iAmAlive=false; isMyTurn=false;
  if(turnTimerInterval) clearInterval(turnTimerInterval);
  document.getElementById('nightModal').classList.remove('active');
  document.getElementById('voteModal').classList.remove('active');
  const b=document.getElementById('turnBanner');
  b.textContent='👻 Siz halok bo\'ldingiz! Endi faqat arvohlar bilan yozishasiz.';
  b.className='turn-banner ghost-banner';
  const i=document.getElementById('messageInput');
  i.disabled=false; i.placeholder='Arvohlar chatiga yozing...';
  document.getElementById('sendMessageBtn').disabled=false;
});

// ==================== ESLATMALAR ====================
function addNote(text,kind){ notes.push({text,kind}); renderNotes(); }
function renderNotes(){
  const box=document.getElementById('notesContent');
  if(!notes.length){ box.innerHTML='<p class="empty-note">Hali ma\'lumot yo\'q</p>'; return; }
  box.innerHTML='';
  notes.forEach(n=>{
    const d=document.createElement('div');
    d.className='note note-'+(n.kind||'ok');
    d.textContent=n.text; box.appendChild(d);
  });
}

// ==================== CHAT ====================
const EMOJIS=['👍','😂','🤔','😱','🧐'];
function appendMessage(p){
  const box=document.getElementById('chatBox');
  const div=document.createElement('div');
  if(p.type==='system'){
    div.className='chat-msg system'+(p.kind?' sys-'+p.kind:'');
    div.textContent=p.message;
  } else if(p.type==='ghost'){
    div.className='chat-msg ghost';
    const s=document.createElement('span'); s.className='sender'; s.textContent='👻 '+p.nickname+': ';
    div.appendChild(s); div.appendChild(document.createTextNode(p.message));
  } else {
    div.className='chat-msg'+(p.revealedWord?' msg-revealed':'');
    div.dataset.msgId=p.id;
    if(p.revealedWord){
      const w=document.createElement('div'); w.className='reveal-warning';
      w.textContent="⚠️ Maxfiy so'z oshkor qilindi — endi josus ham biladi!";
      div.appendChild(w);
    }
    const head=document.createElement('div');
    const s=document.createElement('span'); s.className='sender'; s.textContent=p.nickname+': ';
    head.appendChild(s); head.appendChild(document.createTextNode(p.message));
    div.appendChild(head);
    const bar=document.createElement('div'); bar.className='react-bar';
    EMOJIS.forEach(e=>{
      const b=document.createElement('button'); b.className='react-btn'; b.textContent=e;
      b.addEventListener('click',()=>socket.emit('reactToMessage',{roomId:currentRoomId,messageId:p.id,emoji:e}));
      bar.appendChild(b);
    });
    div.appendChild(bar);
    const sum=document.createElement('div'); sum.className='react-summary'; sum.dataset.summaryFor=p.id;
    div.appendChild(sum);
  }
  box.appendChild(div); box.scrollTop=box.scrollHeight;
}
socket.on('receiveMessage', appendMessage);
socket.on('reactionUpdate', ({messageId,reactions})=>{
  const el=document.querySelector(`[data-summary-for="${messageId}"]`); if(!el) return;
  el.innerHTML='';
  Object.entries(reactions).forEach(([e,c])=>{
    const chip=document.createElement('span'); chip.className='react-chip'; chip.textContent=`${e} ${c}`;
    el.appendChild(chip);
  });
});
function sendChat(){
  const i=document.getElementById('messageInput');
  const m=i.value.trim(); if(!m) return;
  socket.emit('sendMessage',{roomId:currentRoomId,message:m}); i.value='';
}
document.getElementById('sendMessageBtn').addEventListener('click',sendChat);
document.getElementById('messageInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});

// ==================== TIRIK O'YINCHILAR RO'YXATI ====================
function renderLivePlayers(players){
  const ul=document.getElementById('livePlayerList'); if(!ul) return;
  ul.innerHTML='';
  players.forEach(p=>{
    const li=document.createElement('li');
    li.className='live-player'+(p.isAlive===false?' dead':'');
    const n=document.createElement('span'); n.textContent=(p.isAlive===false?'💀 ':'')+p.nickname;
    li.appendChild(n);
    if(p.role){
      const r=document.createElement('span'); r.className='dead-role'; r.textContent=p.role;
      li.appendChild(r);
    }
    ul.appendChild(li);
  });
}

// ==================== OVOZ BERISH ====================
socket.on('openVoteModalForAll', ({players,seconds})=>{
  document.getElementById('nightModal').classList.remove('active');
  if(!iAmAlive) return;
  const list=document.getElementById('voteList'); list.innerHTML='';
  players.forEach(p=>{
    if(p.id===socket.id) return;
    const li=document.createElement('li');
    const b=document.createElement('button'); b.textContent=p.nickname;
    b.addEventListener('click',()=>{
      socket.emit('castVote',{roomId:currentRoomId,targetId:p.id});
      document.getElementById('voteModal').classList.remove('active');
      if(voteTimerInterval) clearInterval(voteTimerInterval);
    });
    li.appendChild(b); list.appendChild(li);
  });
  document.getElementById('voteModal').classList.add('active');
  let rem=seconds; const t=document.getElementById('voteTimer');
  t.textContent=`${rem} soniya qoldi`;
  if(voteTimerInterval) clearInterval(voteTimerInterval);
  voteTimerInterval=setInterval(()=>{
    rem--;
    if(rem<=0){clearInterval(voteTimerInterval);t.textContent='Vaqt tugadi';
      document.getElementById('voteModal').classList.remove('active');return;}
    t.textContent=`${rem} soniya qoldi`;
  },1000);
});
socket.on('voteResult', ({message})=>{
  document.getElementById('voteModal').classList.remove('active');
  if(voteTimerInterval) clearInterval(voteTimerInterval);
});

// ==================== O'YIN TUGADI ====================
socket.on('gameOver', ({winner,message,word,roleReveal,jesterWinners,recap,leaderboard})=>{
  ['nightModal','voteModal'].forEach(id=>document.getElementById(id).classList.remove('active'));
  [turnTimerInterval,nightTimerInterval,voteTimerInterval].forEach(t=>{if(t)clearInterval(t);});

  const titles={crew:'🎉 Jamoa yutdi!',josus:'🕵️ Josuslar yutdi!',qotil:'🔪 Qotil yutdi!',nobody:'💀 Hech kim yutmadi'};
  document.getElementById('gameOverTitle').textContent=titles[winner]||'O\'yin tugadi';
  document.getElementById('gameOverMessage').innerHTML=`${message}<br>Maxfiy so'z: <b>${word||'—'}</b>`;

  const jb=document.getElementById('jesterBox'); jb.innerHTML='';
  if(jesterWinners&&jesterWinners.length){
    const d=document.createElement('div'); d.className='jester-win';
    d.textContent=`🤪 Telba g'olibi: ${jesterWinners.join(', ')} — chiqarilib g'alaba qozondi!`;
    jb.appendChild(d);
  }

  const rc=document.getElementById('rolesContent'); rc.innerHTML='';
  (roleReveal||[]).forEach(r=>{
    const d=document.createElement('div'); d.className='reveal-row';
    d.innerHTML=`<span>${r.isAlive?'':'💀 '}${r.nickname}</span><span class="reveal-role">${r.icon} ${r.roleName}</span>`;
    rc.appendChild(d);
  });

  renderRecap(recap);
  renderLeaderboard(leaderboard, document.getElementById('boardContent'));
  document.getElementById('gameOverModal').classList.add('active');
});

function renderRecap(recap){
  const box=document.getElementById('recapContent'); box.innerHTML='';
  if(!recap||!recap.length){box.innerHTML='<p class="empty-note">Tarix bo\'sh</p>';return;}
  let last=null;
  recap.forEach(it=>{
    if(it.round&&it.round!==last){
      last=it.round;
      const h=document.createElement('div'); h.className='recap-round'; h.textContent=`— ${it.round}-raund —`;
      box.appendChild(h);
    }
    const d=document.createElement('div');
    if(it.type==='message'){
      d.className='recap-line'+(it.revealedWord?' recap-revealed':'');
      d.innerHTML=`<b>${escapeHtml(it.nickname)}:</b> ${escapeHtml(it.message)}${it.revealedWord?' ⚠️':''}`;
    } else if(it.type==='vote'){
      d.className='recap-vote';
      d.textContent='🗳️ '+(it.votes.map(v=>`${v.voter}→${v.target}`).join(' · ')||'ovoz yo\'q');
    } else if(it.type==='eliminate'){
      d.className='recap-elim'; d.textContent=`❌ ${it.nickname} chiqarildi (${it.role})`;
    } else {
      d.className='recap-system'; d.textContent=it.message;
    }
    box.appendChild(d);
  });
}
function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

document.querySelectorAll('.tab-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const map={roles:'rolesContent',recap:'recapContent',board:'boardContent'};
    document.getElementById(map[b.dataset.tab]).classList.add('active');
  });
});

document.getElementById('gameOverCloseBtn').addEventListener('click',()=>{
  document.getElementById('gameOverModal').classList.remove('active');
  resetGameUI(); showScreen('lobby');
});
socket.on('playerLeftGameOver', ({message})=>{
  alert(message);
  ['gameOverModal','nightModal','voteModal'].forEach(id=>document.getElementById(id).classList.remove('active'));
  resetGameUI(); showScreen('lobby');
});
function resetGameUI(){
  iAmAlive=true; isMyTurn=false; myRole=null; notes=[]; renderNotes();
  [turnTimerInterval,nightTimerInterval,voteTimerInterval].forEach(t=>{if(t)clearInterval(t);});
  const i=document.getElementById('messageInput');
  i.disabled=true; i.placeholder='Navbatingizni kuting...';
  document.getElementById('sendMessageBtn').disabled=true;
}

document.getElementById('rulesToggle').addEventListener('click',()=>{
  document.getElementById('rulesBody').classList.toggle('hidden');
  document.getElementById('rulesArrow').classList.toggle('collapsed');
});

refreshNicknameBadge();
