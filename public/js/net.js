// PeerJS ile oda bağlantısı: büyük ekran "sunucu", telefonlar "istemci".
(function () {
  const PREFIX = 'sokopop-';
  const PID_RE = /^[a-z0-9]{6,40}$/i;

  // Büyük ekran: odayı açar, gelen bağlantıları yönetir
  function hostRoom({ code, handle, onPeers, onStatus }) {
    const conns = new Set();
    let peer, retry;

    const onlinePids = () => new Set([...conns].filter(c => c.open && c.pid).map(c => c.pid));

    function open() {
      clearTimeout(retry);
      onStatus('connecting');
      peer = new Peer(PREFIX + code, { debug: 0 });
      peer.on('open', () => onStatus('open'));
      peer.on('connection', conn => {
        conn.on('data', msg => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.t === 'hello' && PID_RE.test(msg.pid || '')) {
            conn.pid = msg.pid;
            conns.add(conn);
            onPeers(onlinePids());
          } else if (msg.t === 'act' && conn.pid) {
            const error = handle(msg.a, conn.pid) || null;
            conn.send({ t: 'res', id: msg.id, error });
          }
        });
        const drop = () => { conns.delete(conn); onPeers(onlinePids()); };
        conn.on('close', drop);
        conn.on('error', drop);
      });
      peer.on('disconnected', () => { onStatus('connecting'); try { peer.reconnect(); } catch {} });
      peer.on('error', e => {
        // Sayfa yenilendiğinde eski oturum kimliği birkaç saniye meşgul kalabilir
        if (e.type === 'unavailable-id') onStatus('busy');
        else if (e.type === 'peer-unavailable') return;
        else onStatus('error');
        if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
          try { peer.destroy(); } catch {}
          retry = setTimeout(open, 3000);
        }
      });
    }
    open();

    return {
      broadcast(viewFor) {
        for (const c of conns) if (c.open && c.pid) {
          try { c.send({ t: 'state', s: viewFor(c.pid) }); } catch {}
        }
      },
    };
  }

  // Telefon: odaya bağlanır, kopunca kendiliğinden tekrar dener
  function joinRoom({ code, pid, onState, onStatus }) {
    const pending = new Map();
    let peer, conn, timer, reqId = 0;

    function schedule(ms = 2500) {
      clearTimeout(timer);
      timer = setTimeout(connect, ms);
    }

    function connect() {
      clearTimeout(timer);
      if (!peer || peer.destroyed) return start();
      if (peer.disconnected) { try { peer.reconnect(); } catch {} return schedule(); }
      if (conn) { try { conn.close(); } catch {} }
      onStatus('connecting');
      const c = peer.connect(PREFIX + code, { reliable: true });
      conn = c;
      c.on('open', () => { onStatus('open'); c.send({ t: 'hello', pid }); });
      c.on('data', msg => {
        if (!msg) return;
        if (msg.t === 'state') onState(msg.s);
        else if (msg.t === 'res' && pending.has(msg.id)) {
          pending.get(msg.id)(msg.error);
          pending.delete(msg.id);
        }
      });
      c.on('close', () => { if (conn === c) { onStatus('lost'); schedule(); } });
      c.on('error', () => { if (conn === c) { onStatus('lost'); schedule(); } });
      // Açılmayan bağlantıyı bekleme
      setTimeout(() => { if (conn === c && !c.open) schedule(0); }, 8000);
    }

    function start() {
      onStatus('connecting');
      peer = new Peer({ debug: 0 });
      peer.on('open', connect);
      peer.on('disconnected', () => schedule());
      peer.on('error', e => {
        if (e.type === 'peer-unavailable') onStatus('noroom');
        else onStatus('lost');
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
          try { peer.destroy(); } catch {}
        }
        schedule(3000);
      });
    }
    start();

    // Telefon arka plandan dönünce hemen yeniden bağlan
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !(conn && conn.open)) connect();
    });

    return {
      act(a) {
        return new Promise(resolve => {
          if (!conn || !conn.open) return resolve('Bağlantı yok, tekrar deneniyor…');
          const id = ++reqId;
          pending.set(id, resolve);
          conn.send({ t: 'act', id, a });
          setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve('Yanıt gelmedi'); } }, 6000);
        });
      },
    };
  }

  window.hostRoom = hostRoom;
  window.joinRoom = joinRoom;
})();
