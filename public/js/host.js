// Büyük ekran: oyun motorunu çalıştırır, odayı açar, sahneyi çizer
const CODE_CHARS = 'ABCDEFGHJKMNPRSTUVYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

let code = store.get('sokopop-room');
if (!code) { code = newCode(); store.set('sokopop-room', code); }
let saved = null;
try { saved = JSON.parse(store.get('sokopop-state') || 'null'); } catch {}

const NET = { connecting: 'Bağlanıyor…', open: 'Oda açık', busy: 'Oda kodu meşgul, tekrar deneniyor…', error: 'Bağlantı sorunu, tekrar deneniyor…' };
const CIRC_SMALL = 2 * Math.PI * 40;
const CIRC_BIG = 2 * Math.PI * 88;
let S = null, built = null, qKey = null, flushTimer = null, lastTick = null;

const engine = createEngine({ questions: QUESTIONS, cards: TABU_CARDS, saved, onChange: schedule });
const room = hostRoom({
  code,
  handle: (a, pid) => engine.handle(a, pid),
  onPeers: set => engine.setOnline(set),
  onStatus: setNet,
});

function schedule() {
  if (!flushTimer) flushTimer = setTimeout(flush, 30);
}
function flush() {
  flushTimer = null;
  store.set('sokopop-state', JSON.stringify(engine.state));
  room.broadcast(pid => engine.view(pid));
  const s = engine.view();
  const ev = newEvent(s);
  S = s;
  render();
  if (ev) onEvent(ev);
}
setInterval(() => engine.tick(), 200);
schedule();

const act = (type, data = {}) => {
  const err = engine.handle({ type, ...data });
  if (err) toast(err);
  return !err;
};
document.addEventListener('click', unlockAudio, { once: true });

// ───────── Oda & bağlantı ─────────
function setNet(st) {
  const el = $('#netStatus');
  el.className = 'status-pill ' + st;
  el.textContent = NET[st] || st;
}
$('#roomCode').innerHTML = `<small>ODA</small>${code}`;

function playUrl(team) {
  const u = new URL('play', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  if (team != null) u.searchParams.set('team', team);
  return u.href;
}
if (['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
  $('#warn').innerHTML = `<div class="warn">⚠️ Bu sayfa "localhost" üzerinden açık — telefonlar bu adrese ulaşamaz.
    Vercel'deki adresi ya da bilgisayarın ağ adresini (terminalde yazan) kullanın.</div>`;
}

function qrSvg(text) {
  if (typeof qrcode === 'undefined') return `<div class="muted">${esc(text)}</div>`;
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function newRoom() {
  if (!confirm('Yeni oda kodu oluşturulsun mu? Oyuncuların QR\'ı yeniden okutması gerekir.')) return;
  store.set('sokopop-room', newCode());
  store.del('sokopop-state');
  location.reload();
}

// ───────── Ortak parçalar ─────────
function memberChips(team, { kick = false, narrator = null } = {}) {
  const list = S.players.filter(p => p.team === team);
  if (!list.length) return '<span class="empty">Henüz kimse yok…</span>';
  return list.map(p => `<span class="chip ${p.online ? '' : 'off'} ${p.pid === narrator ? 'narr' : ''}">
      <span class="dot"></span>${p.pid === narrator ? '🎤 ' : ''}${esc(p.name)}
      ${kick ? `<button class="x" title="Çıkar" data-kick="${esc(p.pid)}">✕</button>` : ''}
    </span>`).join('');
}

function stageBar() {
  return `<div class="stagebar">
    <div class="mini-qr">${qrSvg(playUrl())}</div>
    <div>Geç kalan mı var? Okut, katıl!<br><span style="color:var(--yellow)">Oda kodu: ${code}</span></div>
    <div class="spacer"></div>
    <div id="autoInfo"></div>
    <div id="controls"></div>
    <button class="btn small" id="resetBtn">Oyunu bitir</button>
  </div>`;
}
function bindStageBar() {
  $('#resetBtn').onclick = () => { if (confirm('Oyun bitirilip lobiye dönülsün mü? Puanlar silinir.')) act('reset'); };
}

document.addEventListener('click', e => {
  const k = e.target.closest('[data-kick]');
  if (k) act('kick', { target: k.dataset.kick });
});

// ───────── Render ─────────
function render() {
  if (S.phase === 'lobby') {
    if (built !== 'lobby:' + S.settings.mode) buildLobby();
    updateLobby();
  } else if (S.mode === 'quiz') renderQuiz();
  else renderTabu();
}

function onEvent(ev) {
  if (ev.type === 'rename') return toast(`${ev.by ? ev.by + ' → ' : ''}Takımın yeni adı: “${ev.name}”`);
  if (S.mode === 'quiz') {
    if (ev.type === 'question') SFX.question();
    if (ev.type === 'reveal') SFX.reveal();
    if (ev.type === 'gameOver') SFX.win();
    return;
  }
  if (FLASH[ev.type]) flash(ev.type);
  (SFX[ev.type] || (() => {}))();
}

// ───────── Lobi ─────────
function buildLobby() {
  const st = S.settings;
  const quiz = st.mode === 'quiz';
  built = 'lobby:' + st.mode;
  const opts = (vals, cur, fmt = v => v) => vals.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${fmt(v)}</option>`).join('');
  const team = i => `
    <div class="team-panel box team${i}">
      <div class="band"><input class="tname" data-i="${i}" maxlength="24" value="${esc(S.teams[i].name)}" aria-label="Takım adı"></div>
      <div class="qr">${qrSvg(playUrl(i))}</div>
      <p class="qr-hint">📱 Okut, bu takıma katıl!</p>
      <div class="members" id="m${i}"></div>
    </div>`;

  const settings = quiz ? `
      <div class="row2">
        <label class="field">Soru sayısı<select id="qCount">${opts([10, 15, 20, 25, 30, 40], st.quiz.count)}</select></label>
        <label class="field">Süre / soru<select id="qTime">${opts([10, 15, 20, 25, 30], st.quiz.time, v => v + ' sn')}</select></label>
      </div>
      <label class="field">Takım puanı
        <select id="qTeamScore">
          <option value="avg" ${st.quiz.teamScore === 'avg' ? 'selected' : ''}>Üye ortalaması (kalabalık takım avantajı yok)</option>
          <option value="sum" ${st.quiz.teamScore === 'sum' ? 'selected' : ''}>Toplam puan</option>
        </select></label>
      <label class="field toggle"><input type="checkbox" id="qAuto" ${st.quiz.autoNext ? 'checked' : ''}> Sorular kendiliğinden ilerlesin</label>
      <div class="field">Kategoriler <span class="muted" id="qPool"></span>
        <div class="cats">${engine.categories.map(c => `<span class="chip" data-cat="${esc(c.name)}">${esc(c.name)} · ${c.count}</span>`).join('')}</div>
      </div>`
    : `
      <div class="row2">
        <label class="field">Süre<select id="tDuration">${opts([30, 45, 60, 75, 90, 120], st.tabu.duration, v => v + ' sn')}</select></label>
        <label class="field">Pas hakkı<select id="tPass">${opts([0, 1, 2, 3, 4, 5], st.tabu.passLimit)}</select></label>
      </div>
      <label class="field">Tur sayısı (her takım)<select id="tRounds">${opts([1, 2, 3, 4, 5, 6, 8], st.tabu.rounds)}</select></label>`;

  const rules = quiz ? `
      <li>Sorular ekranda, şıklar <b>herkesin telefonunda</b>.</li>
      <li>Doğru ve hızlı olan çok kazanır: 1000 puana kadar, <b>ilk doğruya +100</b>, üst üste doğruya seri bonusu.</li>
      <li>Sonunda <b>takım şampiyonu</b> ve <b>bireysel podyum</b> açıklanır.</li>`
    : `
      <li>Anlatıcı kartı <b>kendi telefonunda</b> görür.</li>
      <li>Rakip takım yasaklı kelimeleri izler, söylenirse <b>TABU!</b> basar.</li>
      <li>Doğru +1, Tabu −1, Pas 0 puan.</li>`;

  $('#main').innerHTML = `
    <div class="modes">
      <button class="btn ${quiz ? 'sel pink' : ''}" data-mode="quiz">🎤 Bilgi Yarışması</button>
      <button class="btn ${quiz ? '' : 'sel blue'}" data-mode="tabu">🤐 Magazin Tabu</button>
    </div>
    <section class="lobby">
      ${team(0)}
      <div class="box center-panel">
        <div class="burst sticker">ŞOK!<br>KİM DAHA<br>MAGAZİN?</div>
        ${settings}
        <button class="btn pink" id="startBtn">OYUNU BAŞLAT</button>
        <ul class="rules">${rules}</ul>
        <p class="muted" style="margin:0;font-size:13px">Takımlar adlarını telefonlarından da değiştirebilir.</p>
        <button class="linkbtn" id="newRoom">Yeni oda kodu oluştur</button>
      </div>
      ${team(1)}
    </section>`;

  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => act('settings', { mode: b.dataset.mode }));
  document.querySelectorAll('.tname').forEach(i => i.onchange = () => act('renameTeam', { team: +i.dataset.i, name: i.value }));
  $('#startBtn').onclick = () => { unlockAudio(); act('start'); };
  $('#newRoom').onclick = newRoom;

  if (quiz) {
    const sendQuiz = () => act('settings', {
      quiz: { count: +$('#qCount').value, time: +$('#qTime').value, teamScore: $('#qTeamScore').value, autoNext: $('#qAuto').checked },
    });
    ['#qCount', '#qTime', '#qTeamScore', '#qAuto'].forEach(id => $(id).onchange = sendQuiz);
    document.querySelectorAll('[data-cat]').forEach(ch => ch.onclick = () => {
      const cur = new Set(S.settings.quiz.categories);
      cur.has(ch.dataset.cat) ? cur.delete(ch.dataset.cat) : cur.add(ch.dataset.cat);
      act('settings', { quiz: { categories: [...cur] } });
    });
  } else {
    const sendTabu = () => act('settings', {
      tabu: { duration: +$('#tDuration').value, passLimit: +$('#tPass').value, rounds: +$('#tRounds').value },
    });
    ['#tDuration', '#tPass', '#tRounds'].forEach(id => $(id).onchange = sendTabu);
  }
}

function updateLobby() {
  for (const i of [0, 1]) {
    $('#m' + i).innerHTML = memberChips(i, { kick: true });
    const input = document.querySelector(`.tname[data-i="${i}"]`);
    if (document.activeElement !== input) input.value = S.teams[i].name;
  }
  if (S.settings.mode === 'quiz') {
    const cats = S.settings.quiz.categories;
    document.querySelectorAll('[data-cat]').forEach(ch => ch.classList.toggle('on', cats.includes(ch.dataset.cat)));
    const pool = engine.categories.filter(c => cats.includes(c.name)).reduce((n, c) => n + c.count, 0);
    $('#qPool').textContent = `(${pool} soruluk havuz)`;
  }
  const ready = [0, 1].every(t => S.players.some(p => p.team === t));
  $('#startBtn').disabled = !ready;
  $('#startBtn').textContent = ready ? 'OYUNU BAŞLAT' : 'HER TAKIMA OYUNCU BEKLENİYOR';
}

// ───────── Bilgi yarışması ─────────
function renderQuiz() {
  if (built !== 'quiz') {
    built = 'quiz';
    qKey = null;
    $('#main').innerHTML = `<section class="qhead" id="qhead"></section>
      <section class="box qbody" id="qbody"></section>${stageBar()}`;
    bindStageBar();
  }
  $('#qhead').innerHTML = `
    <div class="tscore team0"><span>${esc(S.teams[0].name)}</span><b>${S.scores[0]}</b></div>
    <div class="qnum">${S.phase === 'gameOver' ? 'FİNAL' : `SORU ${S.idx + 1} / ${S.total}`}</div>
    <div class="tscore team1"><span>${esc(S.teams[1].name)}</span><b>${S.scores[1]}</b></div>`;

  const key = S.phase + ':' + S.idx;
  if (key !== qKey) {
    qKey = key;
    $('#qbody').innerHTML = quizBody();
  } else if (S.phase === 'board' || S.phase === 'gameOver') {
    $('#qbody').innerHTML = quizBody(); // isim değişikliklerini yansıt
  }

  const ans = $('#answered');
  if (ans) ans.textContent = `${S.answered} / ${Math.max(S.expected, S.answered)} cevap`;

  const last = S.idx + 1 >= S.total;
  const label = { question: 'Cevabı göster ⏭', reveal: 'Sıralama ▶', board: last ? 'Finale geç 🏆' : 'Sonraki soru ▶' }[S.phase];
  $('#controls').innerHTML = S.phase === 'gameOver'
    ? '<button class="btn pink small" id="ctl">YENİ OYUN</button>'
    : label ? `<button class="btn small" id="ctl">${label}</button>` : '';
  const ctl = $('#ctl');
  if (ctl) ctl.onclick = () => act(S.phase === 'gameOver' ? 'reset' : 'next');
  tickQuiz();
}

function quizHeader(q) {
  return `<span class="cat-badge">${esc(q.c)}</span><div class="qtext">${esc(q.q)}</div>`;
}

function quizBody() {
  const q = S.q;
  const fig = !q ? '' : q.f ? figureHtml(q.f) : q.mystery ? mysteryFigureHtml() : '';
  const grid = inner => `<div class="qgrid ${fig ? '' : 'nofig'}">${fig}<div>${inner}</div></div>`;

  if (S.phase === 'countdown') {
    return grid(`${quizHeader(q)}
      <div class="qmeta"><div class="bigcount" id="cd"></div>
      <p style="font-weight:800;font-size:20px">Telefonlar hazır mı?<br>Şıklar geliyor…</p></div>`);
  }

  if (S.phase === 'question') {
    return grid(`${quizHeader(q)}
        <div class="qmeta">
          <div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/>
            <circle class="arc" id="ringArc" cx="50" cy="50" r="40" stroke-dasharray="${CIRC_SMALL}"/></svg>
            <div class="num" id="ringNum"></div></div>
          <div class="answered" id="answered"></div>
        </div>`) +
      `<div class="options">${q.a.map((t, i) => `<div class="option ${OPTION_STYLE[i].cls}">
          <span class="shape">${OPTION_STYLE[i].shape}</span>${esc(t)}</div>`).join('')}</div>`;
  }

  if (S.phase === 'reveal') {
    const r = S.results;
    const max = Math.max(1, ...r.counts);
    const fast = r.fastest.length
      ? `<ol class="fastlist">${r.fastest.map((f, i) => `<li class="team${f.team}"><span class="tdot"></span>${i + 1}. ${esc(f.name)}
          <span class="muted">${fmtSec(f.ms)}</span><span class="pts">+${f.pts}</span></li>`).join('')}</ol>`
      : '<p>Kimse bilemedi! 😱</p>';
    return grid(quizHeader(q)) +
      `<div class="options">${q.a.map((t, i) => `<div class="option ${OPTION_STYLE[i].cls} ${i === q.d ? 'right' : 'dim'}">
          <span class="shape">${i === q.d ? '✓' : OPTION_STYLE[i].shape}</span>${esc(t)}
          <span class="count">${r.counts[i]}</span>
          <span class="bar" style="transform:scaleX(${r.counts[i] / max})"></span></div>`).join('')}</div>
      <div class="infobox">
        <div><h4>📰 BİLİYOR MUYDUNUZ?</h4><p>${esc(q.x || '—')}</p></div>
        <div><h4>⚡ EN HIZLI PARMAKLAR</h4>${fast}</div>
      </div>`;
  }

  if (S.phase === 'board') {
    const top = S.board.slice(0, 10);
    return `<div class="board">
      <div><h2 class="headline" style="font-size:36px;margin-bottom:16px">MAGAZİN SIRALAMASI</h2>
        <ol class="lb">${top.map((p, i) => `<li class="team${p.team}" style="animation-delay:${i * 60}ms">
          <span class="rk">${i + 1}</span><span>${esc(p.name)}</span>
          <span class="gain">${p.last ? '+' + p.last : ''}</span><span class="sc">${p.score}</span></li>`).join('')}</ol>
      </div>
      <div class="team-totals">
        ${[0, 1].map(t => `<div class="tscore team${t}"><span>${esc(S.teams[t].name)}</span><b>${S.scores[t]}</b></div>`).join('')}
        <div class="scoremode muted">${S.settings.quiz.teamScore === 'sum' ? 'Takım puanı: üyelerin toplamı' : 'Takım puanı: üye ortalaması'}</div>
      </div></div>`;
  }

  if (S.phase === 'gameOver') {
    const aw = S.awards;
    const w = aw.teamWinner;
    const champ = w === null
      ? `<div class="burst champ tie">BERABERE!<br>${S.scores[0]} – ${S.scores[1]}</div>`
      : `<div class="burst champ team${w}">TAKIM<br>ŞAMPİYONU<br>${esc(S.teams[w].name)}<br>${S.scores[w]} puan</div>`;
    const order = [1, 0, 2];
    const heights = [210, 150, 110];
    const podium = order.filter(i => aw.podium[i]).map(i => {
      const p = aw.podium[i];
      return `<div class="step team${p.team}">
        <div class="fig-avatar" style="width:90px">${avatarSvg(p.name)}</div>
        <div class="pname">${esc(p.name)}</div><div class="pscore">${p.score} puan</div>
        <div class="block" style="height:${heights[i]}px">${i + 1}</div></div>`;
    }).join('');
    const awards = [
      aw.podium[0] && `<div class="award"><h4>👑 BİREYSEL ŞAMPİYON</h4>${esc(aw.podium[0].name)} — ${aw.podium[0].score} puan</div>`,
      aw.fastest && `<div class="award"><h4>⚡ FLAŞ MUHABİR</h4>${esc(aw.fastest.name)} — en hızlı doğru: ${fmtSec(aw.fastest.ms)}</div>`,
      aw.streak && `<div class="award"><h4>🔥 MANŞET SERİSİ</h4>${esc(aw.streak.name)} — üst üste ${aw.streak.best} doğru</div>`,
    ].filter(Boolean).join('');
    return `<div class="final">${champ}<h2 class="headline" style="font-size:34px">BİREYSEL PODYUM</h2>
      <div class="podium">${podium}</div><div class="awards">${awards}</div></div>`;
  }
  return '';
}

function tickQuiz() {
  if (!S || S.mode !== 'quiz') return;
  if (S.phase === 'countdown' && $('#cd')) {
    $('#cd').textContent = Math.max(1, Math.ceil(remainingMs(S.endsAt) / 1000));
  }
  if (S.phase === 'question' && $('#ring')) {
    const ms = remainingMs(S.endsAt);
    const sec = Math.ceil(ms / 1000);
    $('#ringNum').textContent = sec;
    $('#ringArc').style.strokeDashoffset = CIRC_SMALL * (1 - ms / (S.time * 1000));
    $('#ring').classList.toggle('hurry', sec <= 5);
    if (sec !== lastTick && sec <= 5 && sec > 0) SFX.tick();
    lastTick = sec;
  }
  const info = $('#autoInfo');
  if (info) {
    const auto = S.autoAt && (S.phase === 'reveal' || S.phase === 'board');
    const total = S.phase === 'reveal' ? 9000 : 6000;
    info.innerHTML = auto ? `<div class="autobar"><i style="width:${100 * remainingMs(S.autoAt) / total}%"></i></div>` : '';
  }
}

// ───────── Tabu ─────────
function renderTabu() {
  if (built !== 'tabu') {
    built = 'tabu';
    $('#main').innerHTML = `
      <section class="stage">
        <div class="score box team0" id="sc0"></div>
        <div class="box center" id="center"></div>
        <div class="score box team1" id="sc1"></div>
      </section>${stageBar()}`;
    bindStageBar();
  }
  const t = S.activeTeam, team = S.teams[t];
  for (const i of [0, 1]) {
    const active = i === t && ['ready', 'playing'].includes(S.phase);
    const el = $('#sc' + i);
    el.classList.toggle('active', active);
    el.innerHTML = `
      <div class="band">${esc(S.teams[i].name)}</div>
      ${active ? '<div class="ribbon">SIRA SİZDE</div>' : ''}
      <div class="pts">${S.scores[i]}</div>
      <div class="members">${memberChips(i, { narrator: active && S.narrator ? S.narrator.pid : null })}</div>`;
  }

  const center = $('#center');
  center.className = `box center team${t}`;
  const counts = r => S.log.filter(l => l.r === r).length;
  const feed = () => `<div class="feed">${S.log.slice().reverse().map(l =>
    `<span class="chip r-${l.r}">${LOG_ICON[l.r]} ${esc(l.w)}</span>`).join('')}</div>`;
  $('#controls').innerHTML = '';

  if (S.phase === 'ready') {
    center.innerHTML = `
      <div class="turnlabel">TUR ${S.turn + 1} / ${S.totalTurns}</div>
      <div class="big-team">${esc(team.name)}</div>
      ${S.narrator
        ? `<div class="narr-line">🎤 Anlatıcı: <b>${esc(S.narrator.name)}</b></div>
           <p>Anlatıcı telefonundan <b>BAŞLA</b>'ya basınca süre işlemeye başlar.<br>
           Rakip takım: telefonlarınızda kartı izleyin, yasaklı kelimede <b>TABU!</b></p>`
        : '<div class="narr-line">Bu takımda oyuncu yok! QR ile katılın.</div>'}
      <button class="btn small" id="skipN">Anlatıcıyı değiştir</button>`;
    $('#skipN').onclick = () => act('skipNarrator');
  } else if (S.phase === 'playing') {
    if (!center.querySelector('.timer')) {
      center.innerHTML = `
        <div class="timer" id="timer">
          <svg viewBox="0 0 200 200"><circle class="bg" cx="100" cy="100" r="96"/>
          <circle class="arc" id="arc" cx="100" cy="100" r="88" stroke-dasharray="${CIRC_BIG}" stroke-dashoffset="0"/></svg>
          <div class="num" id="timerNum"></div>
        </div>
        <div class="narr-line">🎤 <b>${esc(S.narrator ? S.narrator.name : '?')}</b> anlatıyor</div>
        <div id="live"></div>`;
    }
    $('#live').innerHTML = `
      <div class="stats">
        <span class="chip r-ok">✓ ${counts('ok')}</span>
        <span class="chip r-taboo">✗ ${counts('taboo')}</span>
        <span class="chip">Pas: ${Math.max(0, S.settings.tabu.passLimit - S.passes)}</span>
      </div>${feed()}`;
    $('#controls').innerHTML = '<button class="btn small" id="ctl">Turu bitir</button>';
    $('#ctl').onclick = () => act('endTurn');
    tickTabu();
  } else {
    const net = counts('ok') - counts('taboo');
    const summary = `
      <div class="big-team">${esc(team.name)} ${net >= 0 ? '+' : ''}${net}</div>
      ${S.log.length ? feed() : '<p class="muted">Bu turda hiç kart çözülmedi.</p>'}`;
    if (S.phase === 'turnEnd') {
      center.innerHTML = `<h2 class="headline">SÜRE BİTTİ!</h2>${summary}
        <button class="btn ink" id="nextT">Sıradaki: ${esc(S.teams[1 - t].name)} ▶</button>`;
      $('#nextT').onclick = () => act('next');
    } else {
      const [a, b] = S.scores;
      const w = a === b ? null : a > b ? 0 : 1;
      center.innerHTML = `
        <div class="burst champ ${w === null ? 'tie' : 'team' + w}">${w === null
          ? 'BERABERE!<br>MANŞETLER KARIŞTI'
          : `MANŞET:<br>${esc(S.teams[w].name)}<br>KAZANDI!`}</div>
        <div class="big-team">${a} — ${b}</div>
        <button class="btn pink" id="again">YENİ OYUN</button>`;
      $('#again').onclick = () => act('reset');
    }
  }
}

function tickTabu() {
  if (!S || S.mode !== 'tabu' || S.phase !== 'playing' || !$('#timer')) return;
  const ms = remainingMs(S.endsAt);
  const sec = Math.ceil(ms / 1000);
  $('#timerNum').textContent = sec;
  $('#arc').style.strokeDashoffset = CIRC_BIG * (1 - ms / (S.settings.tabu.duration * 1000));
  $('#timer').classList.toggle('hurry', sec <= 10);
  if (sec !== lastTick && sec <= 5 && sec > 0) SFX.tick();
  lastTick = sec;
}

setInterval(() => { if (!S) return; S.mode === 'quiz' ? tickQuiz() : tickTabu(); }, 200);
