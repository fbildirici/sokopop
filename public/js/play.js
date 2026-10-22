// Telefon: odaya bağlanır, cevap / tabu aksiyonlarını büyük ekrana yollar
const params = new URLSearchParams(location.search);
let code = (params.get('room') || store.get('sokopop-lastroom') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
let pid = store.get('sokopop-pid');
if (!pid || !/^[a-z0-9]{6,40}$/i.test(pid)) {
  pid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  store.set('sokopop-pid', pid);
}
let pickTeam = params.get('team') === '1' ? 1 : 0;
let S = null, net = null, netState = 'connecting';
let built = null, renderKey = null, editing = false, renaming = false, pending = null;

const NET = { connecting: 'Bağlanıyor', open: 'Bağlı', lost: 'Koptu', noroom: 'Oda yok', error: 'Hata' };

async function act(type, data = {}) {
  if (!net) return false;
  const err = await net.act({ type, ...data });
  if (err) toast(err);
  return !err;
}

function start() {
  store.set('sokopop-lastroom', code);
  net = joinRoom({
    code,
    pid,
    onState: s => {
      syncClock(s);
      const ev = newEvent(s);
      S = s;
      render();
      if (ev) onEvent(ev);
    },
    onStatus: st => {
      netState = st;
      const pill = $('#pill');
      if (pill) { pill.className = 'status-pill ' + st; pill.textContent = NET[st] || st; }
      if (!S) render();
    },
  });
}

function onEvent(ev) {
  const vib = p => navigator.vibrate && navigator.vibrate(p);
  if (S.mode === 'quiz') {
    if (ev.type === 'question') vib(60);
    if (ev.type === 'reveal') vib(S.mine && S.mine.result && S.mine.result.ok ? [40, 40, 40] : 200);
    return;
  }
  vib(ev.type === 'taboo' ? [80, 40, 80] : ev.type === 'timeup' ? 300 : 40);
  const mine = S.me && ev.team === S.me.team;
  if (ev.type === 'taboo' || ev.type === 'timeup' || (mine && ev.type === 'ok')) flash(ev.type);
}

const teamName = i => esc(S.teams[i].name);
const chips = team => S.players.filter(p => p.team === team)
  .map(p => `<span class="chip ${p.online ? '' : 'off'}"><span class="dot"></span>${esc(p.name)}</span>`).join('');

function header() {
  const score = S && S.scores
    ? `<div class="mini-score"><span class="team0">${S.scores[0]}</span><span class="team1">${S.scores[1]}</span></div>`
    : '';
  return `<div class="bar"><span class="logo">ŞOKOPOP</span>
    <div class="bar-right"><span class="status-pill ${netState}" id="pill">${NET[netState] || netState}</span>${score}</div></div>`;
}

// ───────── Render ─────────
function render() {
  const app = $('#app');
  if (!code) return renderRoomForm(app);
  if (!S) {
    built = null;
    document.body.className = '';
    const msg = netState === 'noroom'
      ? `<h2>Oda bulunamadı 🤔</h2><p><b>${esc(code)}</b> kodlu oda kapalı görünüyor. Büyük ekran açık mı? Tekrar deneniyor…</p>`
      : '<h2>Bağlanıyor…</h2><p>Büyük ekrana bağlanılıyor, birkaç saniye sürebilir.</p>';
    app.innerHTML = `${header()}<div class="box panel">${msg}
      <button class="link" onclick="changeRoom()">Oda kodunu değiştir</button></div>`;
    return;
  }
  if (!S.me || editing) {
    if (built === 'join') return; // yazarken formu bozma
    built = 'join';
    return renderJoin(app);
  }
  if (renaming) {
    if (built === 'rename') return;
    built = 'rename';
    return renderRename(app);
  }
  document.body.className = 'team' + S.me.team;

  if (S.phase === 'lobby') {
    built = 'lobby';
    return renderLobby(app);
  }
  if (S.mode === 'quiz') {
    // Cevap gelince her yayında ekranı baştan çizme
    const key = [S.phase, S.idx, S.mine && S.mine.answer, pending && pending.idx, S.event && S.event.seq, S.teams[0].name, S.teams[1].name].join('|');
    if (built === 'quiz' && key === renderKey) return tick();
    built = 'quiz';
    renderKey = key;
    return renderQuiz(app);
  }
  built = 'tabu';
  renderTabu(app);
}

function renderRoomForm(app) {
  app.innerHTML = `
    <div style="text-align:center;margin-top:10px">
      <h1 class="logo" style="font-size:52px">ŞOKOPOP</h1><br>
      <span class="tagline">90'lar Magazin Yarışması</span>
    </div>
    <div class="box panel">
      <h2>Oda kodu?</h2>
      <p>Büyük ekranın sağ üstündeki kodu yaz ya da QR'ı okut.</p>
      <input id="roomInput" maxlength="8" placeholder="ÖRN. K7MPA" autocomplete="off" style="text-align:center;font-size:24px;letter-spacing:4px;text-transform:uppercase">
      <button class="btn ink" id="roomBtn">BAĞLAN</button>
    </div>`;
  $('#roomBtn').onclick = () => {
    const v = $('#roomInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length < 4) return toast('Kodu kontrol et');
    location.href = `?room=${v}`;
  };
}

function changeRoom() {
  store.del('sokopop-lastroom');
  location.href = location.pathname;
}

function renderJoin(app) {
  document.body.className = '';
  if (S.me) pickTeam = S.me.team;
  app.innerHTML = `
    <div style="text-align:center;margin-top:10px">
      <h1 class="logo" style="font-size:52px">ŞOKOPOP</h1><br>
      <span class="tagline">90'lar Magazin Yarışması</span>
    </div>
    <div class="box panel">
      <h2>Kimsin sen?</h2>
      <input id="name" maxlength="20" placeholder="Adın / lakabın" autocomplete="off" value="${esc(S.me ? S.me.name : store.get('sokopop-name') || '')}">
      <p style="font-weight:800">Takımını seç:</p>
      <div class="teams">
        <button class="team-btn team0" data-t="0">${teamName(0)}</button>
        <button class="team-btn team1" data-t="1">${teamName(1)}</button>
      </div>
      <button class="btn ink" id="joinBtn">KATIL!</button>
      ${S.me ? '<button class="link" id="cancelBtn">Vazgeç</button>' : ''}
    </div>`;
  const sel = () => document.querySelectorAll('.team-btn').forEach(b => b.classList.toggle('sel', +b.dataset.t === pickTeam));
  document.querySelectorAll('.team-btn').forEach(b => b.onclick = () => { pickTeam = +b.dataset.t; sel(); });
  sel();
  if ($('#cancelBtn')) $('#cancelBtn').onclick = () => { editing = false; built = null; render(); };
  $('#joinBtn').onclick = async () => {
    const name = $('#name').value.trim();
    if (!name) return toast('Bir isim yaz!');
    store.set('sokopop-name', name);
    unlockAudio();
    if (await act('join', { name, team: pickTeam })) { editing = false; built = null; render(); }
  };
}

function renderRename(app) {
  app.innerHTML = `${header()}
    <div class="box panel team${S.me.team}">
      <h2>Takımın yeni adı</h2>
      <p>Tüm ekranlarda hemen değişir. Magazin manşeti gibi olsun!</p>
      <input id="tname" maxlength="24" value="${esc(S.teams[S.me.team].name)}" autocomplete="off">
      <div class="btnrow">
        <button class="btn" id="cancel">Vazgeç</button>
        <button class="btn team" id="save">KAYDET</button>
      </div>
    </div>`;
  $('#tname').focus();
  $('#cancel').onclick = () => { renaming = false; built = null; render(); };
  $('#save').onclick = async () => {
    if (await act('renameTeam', { name: $('#tname').value })) { renaming = false; built = null; render(); }
  };
}

function renderLobby(app) {
  const quiz = S.mode === 'quiz';
  app.innerHTML = `${header()}
    <div class="box panel team${S.me.team}">
      <h2>Selam ${esc(S.me.name)}!</h2>
      <div><span class="badge">${teamName(S.me.team)}</span></div>
      <div class="members">${chips(S.me.team)}</div>
      <p>Oyun birazdan başlıyor. Gözün büyük ekranda olsun! 📺</p>
      <div class="btnrow">
        <button class="btn small" onclick="renaming=true;built=null;render()">✏️ Takım adı</button>
        <button class="btn small" onclick="editing=true;built=null;render()">İsim / takım</button>
      </div>
    </div>
    <div class="box panel">
      <h2 style="font-size:20px">${quiz ? '🎤 Bilgi Yarışması' : '🤐 Magazin Tabu'}</h2>
      ${quiz
        ? `<p>Soru büyük ekranda, şıklar burada. <b>Ne kadar hızlı</b> doğru bilirsen o kadar çok puan: 1000'e kadar, ilk doğruya +100, üst üste doğrulara seri bonusu.</p>
           <p>Puanın hem sana hem takımına yazılır. Sonda takım ve bireysel şampiyonlar açıklanır!</p>`
        : `<p>Sıra sana gelince kart <b>senin telefonunda</b> çıkar. Yasaklı kelimeleri söylemeden takımına anlat.</p>
           <p>Rakip anlatırken kartı sen de görürsün — yasaklı kelime ağızdan kaçarsa <b>TABU!</b> bas.</p>`}
    </div>`;
}

// ───────── Bilgi yarışması ─────────
function renderQuiz(app) {
  const q = S.q;
  const head = `${header()}`;
  const timebar = `<div class="timebar" id="timebar"><i id="timefill"></i><b id="timetxt"></b></div>`;
  const qnum = `<div class="qnum">SORU ${S.idx + 1} / ${S.total} · ${esc(q ? q.c : '')}</div>`;

  if (S.phase === 'countdown') {
    app.innerHTML = `${head}
      <div class="box qcard">${qnum}<div class="qtext">${esc(q.q)}</div></div>
      <div class="bigcd" id="cd"></div>
      <p style="text-align:center;font-weight:800">Hazır ol, şıklar geliyor!</p>`;
  } else if (S.phase === 'question') {
    const mine = S.mine.answer != null ? S.mine.answer : pending && pending.idx === S.idx ? pending.choice : null;
    if (mine == null) {
      app.innerHTML = `${head}${timebar}
        <div class="box qcard">${qnum}<div class="qtext">${esc(q.q)}</div></div>
        <div class="answers">${q.a.map((t, i) => `<button class="option ${OPTION_STYLE[i].cls}" data-c="${i}">
          <span class="shape">${OPTION_STYLE[i].shape}</span>${esc(t)}</button>`).join('')}</div>`;
      document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => answer(+b.dataset.c));
    } else {
      app.innerHTML = `${head}${timebar}
        <div class="box panel">
          <h2>Cevabın kilitlendi! 🔒</h2>
          <div class="option ${OPTION_STYLE[mine].cls}"><span class="shape">${OPTION_STYLE[mine].shape}</span>${esc(q.a[mine])}</div>
          <p>Diğerleri bekleniyor… Bakalım doğru mu? 👀</p>
        </div>`;
    }
  } else if (S.phase === 'reveal') {
    const r = S.mine.result;
    const right = `<div class="option ${OPTION_STYLE[q.d].cls}"><span class="shape">✓</span>${esc(q.a[q.d])}</div>`;
    let verdict;
    if (r && r.ok) {
      verdict = `<div class="burst verdict ok">DOĞRU!<br>+${r.pts}</div>
        <div class="perks">${r.first ? '<span class="chip">⚡ İlk doğru +100</span>' : ''}
          ${r.streak >= 2 ? `<span class="chip">🔥 ${r.streak} seri</span>` : ''}</div>`;
    } else if (r) {
      verdict = `<div class="burst verdict no">YANLIŞ!</div><p style="text-align:center;font-weight:800">Doğru cevap:</p>${right}`;
    } else {
      verdict = `<div class="burst verdict late">SÜRE<br>DOLDU 😴</div><p style="text-align:center;font-weight:800">Doğru cevap:</p>${right}`;
    }
    app.innerHTML = `${head}${verdict}
      <div class="box panel"><p>Toplam puanın: <b>${S.mine.score}</b> · Sıran: <b>${S.mine.rank} / ${S.board.length}</b></p></div>`;
  } else if (S.phase === 'board') {
    const top = S.board.slice(0, 3);
    app.innerHTML = `${head}
      <div class="box panel team${S.me.team}">
        <p style="font-weight:800">SIRALAMADAKİ YERİN</p>
        <div class="bigrank">${S.mine.rank}.</div>
        <p><b>${S.mine.score}</b> puan</p>
      </div>
      <div class="box panel">
        <p style="font-weight:800">Zirvedekiler</p>
        ${top.map((p, i) => `<p>${['🥇', '🥈', '🥉'][i]} ${esc(p.name)} — ${p.score}</p>`).join('')}
        <p class="muted">${teamName(0)} ${S.scores[0]} · ${teamName(1)} ${S.scores[1]}</p>
      </div>`;
  } else if (S.phase === 'gameOver') {
    const aw = S.awards;
    const w = aw.teamWinner;
    const champ = aw.podium[0];
    const teamLine = w === null ? 'Takımlar berabere! 🤝' : w === S.me.team ? 'TAKIMINIZ ŞAMPİYON! 🏆' : `Şampiyon takım: ${teamName(w)}`;
    app.innerHTML = `${head}
      <div class="burst verdict ${w === S.me.team ? 'ok' : 'late'}">${S.mine.rank === 1 ? 'MANŞET<br>SENSİN!<br>👑' : `${S.mine.rank}.<br>OLDUN`}</div>
      <div class="box panel">
        <h2>${teamLine}</h2>
        <p>${teamName(0)} ${S.scores[0]} — ${S.scores[1]} ${teamName(1)}</p>
        ${champ ? `<p>👑 Bireysel şampiyon: <b>${esc(champ.name)}</b> (${champ.score})</p>` : ''}
        <p>Senin puanın: <b>${S.mine.score}</b></p>
      </div>`;
  }
  tick();
}

async function answer(choice) {
  if (pending && pending.idx === S.idx) return;
  pending = { idx: S.idx, choice };
  if (navigator.vibrate) navigator.vibrate(30);
  renderKey = null;
  render();
  const ok = await act('answer', { idx: S.idx, choice });
  if (!ok) { pending = null; renderKey = null; render(); }
}

// ───────── Tabu ─────────
function renderTabu(app) {
  const t = S.activeTeam;
  const st = S.settings.tabu;

  if (S.phase === 'ready') {
    const narr = S.narrator ? esc(S.narrator.name) : '?';
    app.innerHTML = header() + ({
      narrator: `<div class="box panel team${t}">
          <h2>🎤 SEN ANLATIYORSUN!</h2>
          <p>Hazır olunca bas, ${st.duration} saniye başlasın. Pas hakkın: ${st.passLimit}.</p>
        </div>
        <div class="grow"></div>
        <button class="btn team huge team${t}" onclick="unlockAudio();act('go')">BAŞLA!</button>`,
      guesser: `<div class="box panel team${t}">
          <h2>Tahmin etmeye hazır ol!</h2>
          <p><b>${narr}</b> anlatacak. Kulaklar açık! 👂</p></div>`,
      watcher: `<div class="box panel team${t}">
          <h2>Rakip sahnede 👀</h2>
          <p><b>${narr}</b> (${teamName(t)}) anlatacak.<br>Kart senin telefonunda da görünecek.
          Yasaklı kelime söylenirse <b>TABU!</b> bas.</p></div>`,
    }[S.myRole] || '');
    return;
  }

  if (S.phase === 'playing') {
    const timebar = `<div class="timebar team${t}" id="timebar"><i id="timefill"></i><b id="timetxt"></b></div>`;
    const card = c => c ? `<div class="box card team${t}">
        <div class="cat">90'lar magazin · ${esc(c.k)}</div>
        <div class="word">${esc(c.w)}</div>
        <div class="forbid-title">🚫 YASAK!</div>
        <ul>${c.t.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>` : '';
    const passLeft = st.passLimit - S.passes;
    if (S.myRole === 'narrator') {
      app.innerHTML = `${timebar}${card(S.card)}
        <div class="grow"></div>
        <div class="actions">
          <button class="btn red" onclick="act('taboo',{cardId:${S.card.id}})">TABU −1</button>
          <button class="btn" ${passLeft > 0 ? '' : 'disabled'} onclick="act('pass',{cardId:${S.card.id}})">PAS (${passLeft})</button>
          <button class="btn green ok" onclick="act('correct',{cardId:${S.card.id}})">DOĞRU! ✓</button>
        </div>`;
    } else if (S.myRole === 'watcher') {
      app.innerHTML = `${timebar}${card(S.card)}
        <div class="grow"></div>
        <button class="btn red taboo-big" onclick="act('taboo',{cardId:${S.card.id}})">TABU!</button>`;
    } else {
      const ok = S.log.filter(l => l.r === 'ok').length;
      app.innerHTML = `${timebar}
        <div class="guess"><div class="burst">TAHMİN<br>ET!<br>✓ ${ok}</div></div>
        <p style="text-align:center;font-weight:800">${S.narrator ? esc(S.narrator.name) : ''} anlatıyor — bağır bağır tahmin et!</p>`;
    }
    tick();
    return;
  }

  const feed = S.log.map(l => `<span class="chip r-${l.r}">${LOG_ICON[l.r]} ${esc(l.w)}</span>`).join('');
  if (S.phase === 'turnEnd') {
    app.innerHTML = `${header()}<div class="box panel team${t}">
        <h2>SÜRE BİTTİ!</h2>
        <div><span class="badge">${teamName(t)}</span></div>
        <div class="feed">${feed || '<span class="muted">Kart yok</span>'}</div>
        <p>Sıradaki tur: <b>${teamName(1 - t)}</b></p></div>`;
  } else {
    const [a, b] = S.scores;
    const w = a === b ? null : a > b ? 0 : 1;
    app.innerHTML = `${header()}<div class="box panel ${w === null ? '' : 'team' + w}">
        <h2>${w === null ? 'BERABERE!' : w === S.me.team ? 'KAZANDINIZ! 🏆' : 'KAYBETTİNİZ 😢'}</h2>
        <div><span class="badge team0">${a}</span> — <span class="badge team1">${b}</span></div>
        <p>${w === null ? 'Manşetler karıştı!' : `Yarının manşeti: <b>${teamName(w)}</b>`}</p></div>`;
  }
}

// ───────── Sayaç ─────────
let lastSec = null;
function tick() {
  if (!S) return;
  if (S.mode === 'quiz' && S.phase === 'countdown' && $('#cd')) {
    $('#cd').textContent = Math.max(1, Math.ceil(remainingMs(S.endsAt) / 1000));
  }
  const bar = $('#timebar');
  if (!bar) return;
  const total = S.mode === 'quiz' ? S.time * 1000 : S.settings.tabu.duration * 1000;
  const ms = remainingMs(S.endsAt), sec = Math.ceil(ms / 1000);
  $('#timefill').style.width = (100 * ms / total) + '%';
  $('#timetxt').textContent = sec + ' sn';
  bar.classList.toggle('hurry', sec <= 5);
  if (S.mode === 'tabu' && S.myRole === 'narrator' && sec !== lastSec && sec <= 5 && sec > 0) SFX.tick();
  lastSec = sec;
}
setInterval(tick, 250);

if (code) start();
render();
