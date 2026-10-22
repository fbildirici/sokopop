// Şokopop oyun motoru — büyük ekranın tarayıcısında çalışır, telefonlar PeerJS ile bağlanır.
// Tüm durum JSON'a çevrilebilir; sayfa yenilense de localStorage'dan devam eder.
(function () {
  const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  const cleanName = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const COUNTDOWN_MS = 3500;
  const REVEAL_MS = 9000;
  const BOARD_MS = 6000;

  function createEngine({ questions, cards, saved, onChange }) {
    const CATS = [...new Set(questions.map(q => q.c))];
    const S = saved && saved.v === 2 ? saved : {
      v: 2,
      players: {},
      teams: [{ name: 'Pembe Rujlar' }, { name: 'Mavi Kasetler' }],
      settings: {
        mode: 'quiz',
        quiz: { count: 15, time: 20, teamScore: 'avg', autoNext: true, categories: CATS.slice() },
        tabu: { duration: 60, passLimit: 3, rounds: 3 },
      },
      game: null,
      event: null,
      seq: 0,
      usedQ: [],
      deck: [],
      cardSeq: 0,
    };
    let online = new Set();
    const now = () => Date.now();
    const changed = () => onChange && onChange();
    const emit = (type, extra = {}) => { S.event = { seq: ++S.seq, type, ...extra }; };
    const teamPids = t => Object.entries(S.players)
      .filter(([, p]) => p.team === t)
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
      .map(([pid]) => pid);
    const pname = pid => (S.players[pid] ? S.players[pid].name : '?');

    // ───────── Bilgi yarışması ─────────
    function quizPick() {
      const qs = S.settings.quiz;
      let pool = questions.map((_, i) => i).filter(i => qs.categories.includes(questions[i].c));
      if (!pool.length) pool = questions.map((_, i) => i);
      const count = Math.min(qs.count, pool.length);
      const used = new Set(S.usedQ);
      let list = shuffle(pool.filter(i => !used.has(i)));
      if (list.length < count) {
        // Arşiv bitti: kullanılmışları yeniden karıştır
        S.usedQ = S.usedQ.filter(i => !pool.includes(i));
        list = list.concat(shuffle(pool.filter(i => used.has(i))));
      }
      const chosen = list.slice(0, count);
      S.usedQ.push(...chosen);
      return chosen.map(i => {
        const q = questions[i];
        const order = shuffle([0, 1, 2, 3]);
        return { c: q.c, q: q.q, f: q.f || null, x: q.x || '', a: order.map(k => q.a[k]), d: order.indexOf(0) };
      });
    }

    function stat(g, pid) {
      return g.stats[pid] || (g.stats[pid] = { score: 0, correct: 0, streak: 0, best: 0, fastest: null, last: 0 });
    }

    function quizNext(g) {
      g.idx++;
      g.answers = {};
      g.results = null;
      g.autoAt = 0;
      if (g.idx >= g.qs.length) {
        g.phase = 'gameOver';
        emit('gameOver');
        return;
      }
      g.phase = 'countdown';
      g.endsAt = now() + COUNTDOWN_MS;
      emit('countdown');
    }

    function quizOpen(g) {
      g.phase = 'question';
      g.startedAt = now();
      g.endsAt = g.startedAt + S.settings.quiz.time * 1000;
      emit('question');
    }

    function quizReveal(g) {
      const T = S.settings.quiz.time * 1000;
      const q = g.qs[g.idx];
      const counts = [0, 0, 0, 0];
      const fastest = [];
      let first = true;
      for (const pid of Object.keys(S.players)) stat(g, pid).last = 0;
      const entries = Object.entries(g.answers).sort((a, b) => a[1].ms - b[1].ms);
      for (const [pid, a] of entries) {
        counts[a.choice]++;
        const s = stat(g, pid);
        if (a.choice === q.d) {
          s.streak++;
          s.best = Math.max(s.best, s.streak);
          s.correct++;
          if (s.fastest == null || a.ms < s.fastest) s.fastest = a.ms;
          // Hız puanı: anında 1000, son saniyede 500 + ilk doğruya 100 + seri bonusu
          const base = Math.round(1000 - 500 * Math.min(a.ms, T) / T);
          const bonusFirst = first ? 100 : 0;
          const bonusStreak = Math.min(s.streak - 1, 4) * 50;
          const pts = base + bonusFirst + bonusStreak;
          s.score += pts;
          s.last = pts;
          Object.assign(a, { ok: true, pts, first, streak: s.streak });
          if (fastest.length < 5) fastest.push({ pid, name: pname(pid), team: S.players[pid] ? S.players[pid].team : 0, ms: a.ms, pts });
          first = false;
        } else {
          s.streak = 0;
          Object.assign(a, { ok: false, pts: 0 });
        }
      }
      for (const pid of Object.keys(S.players)) if (!g.answers[pid]) stat(g, pid).streak = 0;
      g.results = { counts, fastest, total: entries.length };
      g.phase = 'reveal';
      g.autoAt = S.settings.quiz.autoNext ? now() + REVEAL_MS : 0;
      emit('reveal');
    }

    function quizBoard(g) {
      g.phase = 'board';
      g.autoAt = S.settings.quiz.autoNext ? now() + BOARD_MS : 0;
      emit('board');
    }

    function leaderboard(g) {
      return Object.entries(S.players)
        .map(([pid, p]) => {
          const s = g.stats[pid] || {};
          return { pid, name: p.name, team: p.team, score: s.score || 0, last: s.last || 0, correct: s.correct || 0 };
        })
        .sort((a, b) => b.score - a.score || b.correct - a.correct);
    }

    function teamScores(g) {
      return [0, 1].map(t => {
        const pids = teamPids(t);
        const sum = pids.reduce((acc, pid) => acc + (g.stats[pid] ? g.stats[pid].score : 0), 0);
        return S.settings.quiz.teamScore === 'sum' || !pids.length ? sum : Math.round(sum / pids.length);
      });
    }

    function awards(g) {
      const board = leaderboard(g);
      const scores = teamScores(g);
      let fastest = null, streak = null;
      for (const [pid, s] of Object.entries(g.stats)) {
        if (!S.players[pid]) continue;
        if (s.fastest != null && (!fastest || s.fastest < fastest.ms)) fastest = { name: pname(pid), team: S.players[pid].team, ms: s.fastest };
        if (s.best >= 2 && (!streak || s.best > streak.best)) streak = { name: pname(pid), team: S.players[pid].team, best: s.best };
      }
      return {
        teamWinner: scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1,
        podium: board.slice(0, 3),
        fastest,
        streak,
      };
    }

    function quizView(g, pid) {
      const q = g.qs[g.idx];
      const board = leaderboard(g);
      const v = {
        idx: g.idx,
        total: g.qs.length,
        endsAt: g.endsAt,
        autoAt: g.autoAt,
        time: S.settings.quiz.time,
        scores: teamScores(g),
        board,
        answered: Object.keys(g.answers).length,
        expected: Object.keys(S.players).filter(p => online.has(p)).length,
      };
      if (q && g.phase !== 'gameOver') {
        const revealed = g.phase === 'reveal' || g.phase === 'board';
        // Figür şıklardan biriyse cevabı ele vermesin: açıklanana kadar gizemli kart
        const spoiler = q.f && q.a.some(x => x.includes(q.f) || q.f.includes(x));
        v.q = { c: q.c, q: q.q, f: spoiler && !revealed ? null : q.f, mystery: !!spoiler && !revealed };
        if (g.phase !== 'countdown') v.q.a = q.a;
        if (revealed) {
          v.q.d = q.d;
          v.q.x = q.x;
          v.results = g.results;
        }
      }
      if (g.phase === 'gameOver') v.awards = awards(g);
      if (pid) {
        const a = g.answers[pid];
        const s = g.stats[pid];
        v.mine = {
          answer: a ? a.choice : null,
          result: a && (g.phase === 'reveal' || g.phase === 'board') ? { ok: a.ok, pts: a.pts, first: a.first, streak: a.streak } : null,
          score: s ? s.score : 0,
          rank: board.findIndex(b => b.pid === pid) + 1,
        };
      }
      return v;
    }

    // ───────── Tabu ─────────
    function draw() {
      if (!S.deck.length) S.deck = shuffle(cards.map((_, i) => i));
      return { id: ++S.cardSeq, ...cards[S.deck.pop()] };
    }

    function tabuPick(g) {
      const list = teamPids(g.activeTeam);
      return list.length ? list[g.rot[g.activeTeam] % list.length] : null;
    }

    function tabuPrepare(g) {
      g.phase = 'ready';
      g.narrator = tabuPick(g);
      g.passes = 0;
      g.log = [];
      g.card = null;
    }

    function tabuEnd(g) {
      if (g.card) g.log.push({ w: g.card.w, r: 'time' });
      g.card = null;
      g.rot[g.activeTeam]++;
      g.turn++;
      g.phase = g.turn >= S.settings.tabu.rounds * 2 ? 'gameOver' : 'turnEnd';
      emit('timeup', { team: g.activeTeam });
    }

    function tabuResolve(g, r) {
      g.log.push({ w: g.card.w, r });
      if (r === 'ok') g.scores[g.activeTeam]++;
      if (r === 'taboo') g.scores[g.activeTeam]--;
      if (r === 'pass') g.passes++;
      emit(r, { team: g.activeTeam, word: g.card.w });
      g.card = draw();
    }

    function tabuView(g, pid, me) {
      const v = {
        scores: g.scores,
        activeTeam: g.activeTeam,
        turn: g.turn,
        totalTurns: S.settings.tabu.rounds * 2,
        narrator: g.narrator && S.players[g.narrator] ? { pid: g.narrator, name: pname(g.narrator) } : null,
        passes: g.passes,
        endsAt: g.endsAt,
        log: g.log,
      };
      if (me) {
        let role = 'none';
        if (g.phase === 'ready' || g.phase === 'playing') {
          role = pid === g.narrator ? 'narrator' : me.team === g.activeTeam ? 'guesser' : 'watcher';
        }
        v.myRole = role;
        if (g.phase === 'playing' && (role === 'narrator' || role === 'watcher')) v.card = g.card;
      }
      return v;
    }

    // ───────── Aksiyonlar ─────────
    function act(a, pid) {
      const host = pid == null;
      const me = host ? null : S.players[pid];
      const g = S.game;
      const hostOnly = () => (host ? null : 'Bu işlemi sadece büyük ekran yapabilir');

      switch (a.type) {
        case 'join': {
          if (host) return 'Geçersiz';
          const name = cleanName(a.name, 20);
          if (!name) return 'İsim gerekli';
          const team = a.team === 1 ? 1 : 0;
          const prev = S.players[pid];
          S.players[pid] = { name, team, joinedAt: prev && prev.team === team ? prev.joinedAt : now() };
          if (g && g.mode === 'tabu' && g.phase === 'ready' && !g.narrator) g.narrator = tabuPick(g);
          return;
        }
        case 'leave':
          if (host) return 'Geçersiz';
          delete S.players[pid];
          if (g && g.mode === 'tabu' && g.phase === 'ready' && g.narrator === pid) g.narrator = tabuPick(g);
          return;
        case 'renameTeam': {
          const t = host ? (a.team === 1 ? 1 : 0) : me ? me.team : null;
          if (t == null) return 'Önce bir takıma katıl';
          const name = cleanName(a.name, 24);
          if (!name) return 'Takım adı boş olamaz';
          if (name === S.teams[t].name) return;
          S.teams[t].name = name;
          emit('rename', { team: t, name, by: host ? null : me.name });
          return;
        }
        case 'kick':
          if (hostOnly()) return hostOnly();
          delete S.players[a.target];
          if (g && g.mode === 'tabu' && g.phase === 'ready' && g.narrator === a.target) g.narrator = tabuPick(g);
          return;
        case 'settings': {
          if (hostOnly()) return hostOnly();
          if (g) return 'Ayarlar sadece lobide değişir';
          const st = S.settings;
          if (a.mode === 'quiz' || a.mode === 'tabu') st.mode = a.mode;
          if (a.quiz) {
            st.quiz.count = clamp(a.quiz.count, 5, 60, st.quiz.count);
            st.quiz.time = clamp(a.quiz.time, 5, 60, st.quiz.time);
            if (a.quiz.teamScore === 'sum' || a.quiz.teamScore === 'avg') st.quiz.teamScore = a.quiz.teamScore;
            if (typeof a.quiz.autoNext === 'boolean') st.quiz.autoNext = a.quiz.autoNext;
            if (Array.isArray(a.quiz.categories)) {
              const cats = a.quiz.categories.filter(c => CATS.includes(c));
              if (!cats.length) return 'En az bir kategori seçili olmalı';
              st.quiz.categories = cats;
            }
          }
          if (a.tabu) {
            st.tabu.duration = clamp(a.tabu.duration, 20, 180, st.tabu.duration);
            st.tabu.passLimit = clamp(a.tabu.passLimit, 0, 10, st.tabu.passLimit);
            st.tabu.rounds = clamp(a.tabu.rounds, 1, 10, st.tabu.rounds);
          }
          return;
        }
        case 'start': {
          if (hostOnly()) return hostOnly();
          if (g) return 'Oyun zaten başladı';
          if (!teamPids(0).length || !teamPids(1).length) return 'Her takımda en az bir oyuncu olmalı';
          if (S.settings.mode === 'quiz') {
            S.game = { mode: 'quiz', phase: 'countdown', qs: quizPick(), idx: -1, answers: {}, results: null, stats: {}, endsAt: 0, autoAt: 0, startedAt: 0 };
            quizNext(S.game);
          } else {
            S.game = { mode: 'tabu', scores: [0, 0], activeTeam: 0, turn: 0, rot: [0, 0], endsAt: 0 };
            tabuPrepare(S.game);
            emit('ready');
          }
          return;
        }
        case 'reset':
          if (hostOnly()) return hostOnly();
          S.game = null;
          emit('reset');
          return;
      }

      if (!g) return 'Oyun başlamadı';

      if (g.mode === 'quiz') {
        switch (a.type) {
          case 'answer': {
            if (!me) return 'Önce katıl';
            if (g.phase !== 'question' || a.idx !== g.idx) return 'Bu soru için süre doldu';
            if (g.answers[pid]) return 'Cevabın zaten kilitlendi';
            const choice = Number(a.choice);
            if (![0, 1, 2, 3].includes(choice)) return 'Geçersiz';
            g.answers[pid] = { choice, ms: now() - g.startedAt };
            const waiting = Object.keys(S.players).filter(p => online.has(p) && !g.answers[p]);
            if (!waiting.length) g.endsAt = Math.min(g.endsAt, now() + 700);
            return;
          }
          case 'next':
            if (hostOnly()) return hostOnly();
            if (g.phase === 'question') quizReveal(g);
            else if (g.phase === 'reveal') quizBoard(g);
            else if (g.phase === 'board') quizNext(g);
            else return 'Geçersiz';
            return;
        }
        return 'Geçersiz';
      }

      // Tabu
      const isNarrator = pid && pid === g.narrator;
      const cardOk = g.phase === 'playing' && g.card && a.cardId === g.card.id;
      switch (a.type) {
        case 'go':
          if (g.phase !== 'ready' || !isNarrator) return 'Şu an başlatamazsın';
          g.phase = 'playing';
          g.card = draw();
          g.endsAt = now() + S.settings.tabu.duration * 1000;
          emit('start', { team: g.activeTeam });
          return;
        case 'correct':
          if (!cardOk || !isNarrator) return 'Geçersiz';
          return tabuResolve(g, 'ok');
        case 'pass':
          if (!cardOk || !isNarrator) return 'Geçersiz';
          if (g.passes >= S.settings.tabu.passLimit) return 'Pas hakkın bitti';
          return tabuResolve(g, 'pass');
        case 'taboo':
          if (!cardOk || !(isNarrator || (me && me.team !== g.activeTeam))) return 'Geçersiz';
          return tabuResolve(g, 'taboo');
        case 'skipNarrator':
          if (hostOnly()) return hostOnly();
          if (g.phase !== 'ready') return 'Geçersiz';
          g.rot[g.activeTeam]++;
          g.narrator = tabuPick(g);
          return;
        case 'endTurn':
          if (hostOnly()) return hostOnly();
          if (g.phase !== 'playing') return 'Geçersiz';
          tabuEnd(g);
          return;
        case 'next':
          if (hostOnly()) return hostOnly();
          if (g.phase !== 'turnEnd') return 'Geçersiz';
          g.activeTeam = 1 - g.activeTeam;
          tabuPrepare(g);
          return;
      }
      return 'Geçersiz';
    }

    return {
      state: S,
      categories: CATS.map(c => ({ name: c, count: questions.filter(q => q.c === c).length })),

      handle(a, pid = null) {
        const err = act(a || {}, pid);
        if (!err) changed();
        return err;
      },

      // Süreye bağlı geçişler (sayfa yenilense de kaçırılmaz)
      tick() {
        const g = S.game;
        if (!g) return;
        const t = now();
        let ch = true;
        if (g.mode === 'quiz') {
          if (g.phase === 'countdown' && t >= g.endsAt) quizOpen(g);
          else if (g.phase === 'question' && t >= g.endsAt) quizReveal(g);
          else if (g.phase === 'reveal' && g.autoAt && t >= g.autoAt) quizBoard(g);
          else if (g.phase === 'board' && g.autoAt && t >= g.autoAt) quizNext(g);
          else ch = false;
        } else if (g.phase === 'playing' && t >= g.endsAt) tabuEnd(g);
        else ch = false;
        if (ch) changed();
      },

      setOnline(set) {
        online = set;
        const g = S.game;
        // Bağlı herkes cevapladıysa beklemeye gerek yok
        if (g && g.mode === 'quiz' && g.phase === 'question' && Object.keys(g.answers).length) {
          const waiting = Object.keys(S.players).filter(p => online.has(p) && !g.answers[p]);
          if (!waiting.length) g.endsAt = Math.min(g.endsAt, now() + 700);
        }
        changed();
      },

      view(pid = null) {
        const g = S.game;
        const me = pid ? S.players[pid] : null;
        const v = {
          mode: g ? g.mode : S.settings.mode,
          phase: g ? g.phase : 'lobby',
          teams: S.teams,
          settings: S.settings,
          event: S.event,
          now: now(),
          players: Object.entries(S.players).map(([id, p]) => ({ pid: id, name: p.name, team: p.team, online: online.has(id) })),
          me: me ? { pid, name: me.name, team: me.team } : null,
        };
        if (g) Object.assign(v, g.mode === 'quiz' ? quizView(g, pid) : tabuView(g, pid, me));
        return v;
      },
    };
  }

  window.createEngine = createEngine;
})();
