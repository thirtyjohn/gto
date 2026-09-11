/* 翻前 GTO 训练器 · 界面与训练流程 */
(function () {
  'use strict';

  var ORDER = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var GROUPS = ['Open Raise', '3 Bet', '4 Bet', 'vs Limp'];
  var SUITS = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED = { h: 1, d: 1 };

  var BUILT = {};
  Range.buildAll(SCENARIOS).forEach(function (b) { BUILT[b.scenario.id] = b; });
  var BY_ID = {};
  SCENARIOS.forEach(function (s) { BY_ID[s.id] = s; });

  /* ---------------- 存储 ---------------- */
  var KEY = 'gto.preflop.v1';
  var store = loadStore();

  function blank() {
    return {
      stats: {}, mistakes: [],
      settings: { threshold: 30, feedback: 'exam', hands: 20 }
    };
  }
  function loadStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw || !raw.settings) return blank();
      var b = blank();
      raw.stats = raw.stats || {};
      raw.mistakes = raw.mistakes || [];
      for (var k in b.settings) if (raw.settings[k] == null) raw.settings[k] = b.settings[k];
      return raw;
    } catch (e) { return blank(); }
  }
  function saveStore() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }
  function statOf(id) {
    if (!store.stats[id]) store.stats[id] = { hands: 0, correct: 0, wrong: 0, byHand: {} };
    return store.stats[id];
  }
  function aggregate(ids) {
    var t = { hands: 0, correct: 0, wrong: 0 };
    ids.forEach(function (id) {
      var s = store.stats[id];
      if (!s) return;
      t.hands += s.hands; t.correct += s.correct; t.wrong += s.wrong;
    });
    return t;
  }

  /* ---------------- 小工具 ---------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function shuffled(a) {
    var c = a.slice();
    for (var i = c.length - 1; i > 0; i--) { var j = rand(i + 1); var t = c[i]; c[i] = c[j]; c[j] = t; }
    return c;
  }
  function num(x) { return (Math.round(x * 10) / 10).toString(); }

  // 自建确认框：Artifact 的 iframe 沙箱会拦掉 window.confirm
  function ask(msg, onYes) {
    var over = el('div', 'modal');
    var box = el('div', 'modalbox');
    box.appendChild(el('p', null, msg));
    var row = el('div', 'modalrow');
    var no = el('button', 'mbtn', '取消');
    var yes = el('button', 'mbtn danger', '确定');
    var close = function () { if (over.parentNode) document.body.removeChild(over); };
    no.onclick = close;
    yes.onclick = function () { close(); onYes(); };
    over.onclick = function (e) { if (e.target === over) close(); };
    row.appendChild(no); row.appendChild(yes);
    box.appendChild(row); over.appendChild(box);
    document.body.appendChild(over);
  }

  /* ---------------- 场景分组 ---------------- */
  function heroesOf(group) {
    var seen = [], out = [];
    SCENARIOS.forEach(function (s) {
      if (s.group !== group || seen.indexOf(s.hero) >= 0) return;
      seen.push(s.hero); out.push(s.hero);
    });
    return out.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
  }
  function scenariosOf(group, hero) {
    return SCENARIOS.filter(function (s) { return s.group === group && s.hero === hero; });
  }

  /* ---------------- 范围网格 ---------------- */
  function fillOf(g) {
    if (g.raise + g.call === 0) return '#33475c';
    var f = g.fold, c = g.call;
    return 'linear-gradient(to top, #33475c 0 ' + f + '%, var(--call) ' + f + '% ' +
      (f + c) + '%, var(--raise) ' + (f + c) + '% 100%)';
  }
  function renderGrid(built, onPick) {
    var box = el('div', 'gridbox');
    var grid = el('div', 'grid');
    Range.ALL_HANDS.forEach(function (h) {
      var g = built.grid[h.key];
      var cell = el('div', 'gcell' + (g.raise + g.call >= 50 ? ' lit' : ''), h.key);
      cell.style.background = fillOf(g);
      if (onPick) cell.addEventListener('click', function () { onPick(h, g); });
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    return box;
  }
  function legend(sc) {
    var wrap = el('div', 'legend');
    var items = sc.noFold
      ? [['var(--raise)', 'RAISE'], ['#33475c', 'CHECK']]
      : [['var(--raise)', sc.labels.raise.split(' ')[0].toUpperCase()],
         ['var(--call)', sc.labels.call.split(' ')[0].toUpperCase()],
         ['#33475c', 'FOLD']];
    items.forEach(function (p) {
      var s = el('span');
      var i = el('i'); i.style.background = p[0];
      s.appendChild(i); s.appendChild(el('b', null, p[1]));
      s.lastChild.style.fontWeight = '400';
      wrap.appendChild(s);
    });
    return wrap;
  }

  /* ---------------- 牌桌状态 ---------------- */
  function openSize(pos) { return pos === 'SB' ? 3 : 2.5; }

  function tableState(sc) {
    var idx = {};
    ORDER.forEach(function (p, i) { idx[p] = i; });
    var seats = ORDER.map(function (p) {
      return { pos: p, folded: false, bet: 0, hero: p === sc.hero };
    });
    seats[idx.SB].bet = 0.5;
    seats[idx.BB].bet = 1;
    var h = idx[sc.hero], i;

    if (sc.group === 'Open Raise') {
      for (i = 0; i < h; i++) seats[i].folded = true;
    } else if (sc.group === 'vs Limp') {
      for (i = 0; i < idx[sc.vs]; i++) seats[i].folded = true;
      seats[idx[sc.vs]].bet = 1;
    } else if (sc.group === '3 Bet') {
      var v = idx[sc.vs];
      for (i = 0; i < v; i++) seats[i].folded = true;
      seats[v].bet = openSize(sc.vs);
      for (i = v + 1; i < h; i++) seats[i].folded = true;
    } else if (sc.group === '4 Bet') {
      var w = idx[sc.vs];
      for (i = 0; i < h; i++) seats[i].folded = true;
      seats[h].bet = openSize(sc.hero);
      for (i = h + 1; i < w; i++) seats[i].folded = true;
      seats[w].bet = sc.sizing.call + openSize(sc.hero);
      for (i = w + 1; i < 6; i++) seats[i].folded = true;
    }
    var pot = seats.reduce(function (s, x) { return s + x.bet; }, 0);
    return { seats: seats, heroIdx: h, idx: idx, pot: pot };
  }

  // 座位坐标：slot 0 是英雄，逆时针依次是后面行动的位置。
  // x/y 是座位，bx/by 是下注筹码，dx/dy 是按钮位标记，都是牌桌的百分比。
  var SLOTS = [
    { x: 50, y: 91, bx: 50, by: 66, dx: 63, dy: 86 },
    { x: 22, y: 72, bx: 35, by: 60, dx: 31, dy: 80 },
    { x: 22, y: 40, bx: 35, by: 51, dx: 31, dy: 32 },
    { x: 50, y:  9, bx: 50, by: 24, dx: 36, dy: 14 },
    { x: 78, y: 40, bx: 65, by: 51, dx: 69, dy: 32 },
    { x: 78, y: 72, bx: 65, by: 60, dx: 69, dy: 80 }
  ];

  function renderTable(sc, cards) {
    var st = tableState(sc);
    var felt = el('div', 'felt');

    var pot = el('div', 'pot');
    pot.appendChild(el('small', null, 'Total Pot'));
    pot.appendChild(el('span', null, num(st.pot) + ' BB'));
    felt.appendChild(pot);

    for (var slot = 0; slot < 6; slot++) {
      var pos = ORDER[(st.heroIdx + slot) % 6];
      var seat = st.seats[st.idx[pos]];
      var S = SLOTS[slot];

      var node = el('div', 'seat' + (seat.folded ? ' folded' : '') + (seat.hero ? ' hero' : ''));
      node.style.left = S.x + '%';
      node.style.top = S.y + '%';
      node.appendChild(el('div', 'badge', pos));
      node.appendChild(el('div', 'stack', num(100 - seat.bet) + ' BB'));
      felt.appendChild(node);

      if (seat.bet > 0 && !seat.folded) {
        var bet = el('div', 'bet');
        bet.style.left = S.bx + '%';
        bet.style.top = S.by + '%';
        bet.appendChild(el('b'));
        bet.appendChild(el('span', null, num(seat.bet) + ' BB'));
        felt.appendChild(bet);
      }
      if (pos === 'BTN') {
        var d = el('div', 'dealer', 'D');
        d.style.left = S.dx + '%';
        d.style.top = S.dy + '%';
        felt.appendChild(d);
      }
    }

    var hole = el('div', 'hole');
    cards.forEach(function (c) { hole.appendChild(cardNode(c, 'pcard')); });
    felt.appendChild(hole);

    return felt;
  }

  function cardNode(c, cls) {
    var n = el('div', cls + (RED[c[1]] ? ' red' : ''));
    n.appendChild(el('div', 'r', c[0]));
    n.appendChild(el('div', 's', SUITS[c[1]]));
    return n;
  }

  function dealCards(key) {
    var r1 = key[0], r2 = key[1], type = key[2];
    var s = shuffled(['s', 'h', 'd', 'c']);
    if (!type) return [r1 + s[0], r2 + s[1]];
    if (type === 's') return [r1 + s[0], r2 + s[0]];
    return [r1 + s[0], r2 + s[1]];
  }

  /* ---------------- 导航 ---------------- */
  var view = { name: 'home' };
  var navLeft = document.getElementById('nav-left');
  var navRight = document.getElementById('nav-right');
  var navTitle = document.getElementById('nav-title');

  function show(name, opts) {
    view = { name: name, opts: opts || {} };
    ['home', 'sheet', 'train', 'result', 'settings', 'help'].forEach(function (n) {
      document.getElementById('screen-' + n).classList.toggle('on', n === name);
    });
    var s = document.getElementById('screen-' + name);
    s.scrollTop = 0;
    if (name === 'home') renderHome();
    if (name === 'sheet') renderSheet();
    if (name === 'settings') renderSettings();
    if (name === 'help') renderHelp();
  }

  function setNav(title, left, right) {
    navTitle.textContent = title;
    navLeft.style.fontSize = '';
    navLeft.textContent = left ? left.label : '';
    navLeft.onclick = left ? left.fn : null;
    navLeft.style.visibility = left ? 'visible' : 'hidden';
    navRight.textContent = right ? right.label : '';
    navRight.onclick = right ? right.fn : null;
    navRight.style.visibility = right ? 'visible' : 'hidden';
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    setNav('Home',
      { label: '⚙', fn: function () { show('settings'); } },
      { label: '?', fn: function () { show('help'); } });
    navLeft.className = 'icon-btn';
    navRight.className = 'icon-btn';

    var root = document.getElementById('screen-home');
    clear(root);

    GROUPS.forEach(function (group) {
      var heroes = heroesOf(group);
      if (!heroes.length) return;
      var sec = el('div', 'grp');
      sec.appendChild(el('h2', null, group));
      var cards = el('div', 'cards');
      heroes.forEach(function (hero) {
        var list = scenariosOf(group, hero);
        var ids = list.map(function (s) { return s.id; });
        var t = aggregate(ids);
        var card = el('button', 'poscard' + (t.hands ? '' : ' fresh'));
        card.appendChild(el('div', 'pos', hero));
        card.appendChild(el('div', 'sub',
          list.length > 1 ? list.length + ' 个对手位置' : (list[0].vs ? 'vs ' + list[0].vs : '')));
        card.appendChild(el('div', 'tot', 'Total Hands: ' + t.hands));
        var tally = el('div', 'tally');
        tally.appendChild(el('span', 'ok', '✔ ' + t.correct));
        tally.appendChild(el('span', 'sep', '/'));
        tally.appendChild(el('span', 'no', '✖ ' + t.wrong));
        card.appendChild(tally);
        var bar = el('div', 'pbar');
        var fill = el('i');
        fill.style.width = (t.hands ? (t.correct / t.hands * 100) : 0) + '%';
        bar.appendChild(fill);
        card.appendChild(bar);
        card.onclick = function () { show('sheet', { group: group, hero: hero, pick: 0 }); };
        cards.appendChild(card);
      });
      sec.appendChild(cards);
      root.appendChild(sec);
    });
  }

  /* ---------------- 场景面 ---------------- */
  function renderSheet() {
    var o = view.opts;
    var list = scenariosOf(o.group, o.hero);
    var mixed = list.length > 1;
    var pick = o.pick == null ? 0 : o.pick;
    var isMix = mixed && pick === list.length;

    setNav(o.group.toUpperCase() + ' - ' + o.hero,
      { label: '✕', fn: function () { show('home'); } }, null);
    navLeft.className = 'icon-btn';

    var root = document.getElementById('screen-sheet');
    clear(root);
    var wrap = el('div', 'sheetwrap');

    if (mixed) {
      var chips = el('div', 'chips');
      list.forEach(function (s, i) {
        var c = el('button', 'chip' + (pick === i ? ' on' : ''), 'vs ' + s.vs);
        c.onclick = function () { view.opts.pick = i; renderSheet(); };
        chips.appendChild(c);
      });
      var mixChip = el('button', 'chip' + (isMix ? ' on' : ''), '混合');
      mixChip.onclick = function () { view.opts.pick = list.length; renderSheet(); };
      chips.appendChild(mixChip);
      wrap.appendChild(chips);
    }

    var ids = isMix ? list.map(function (s) { return s.id; }) : [list[pick].id];
    var t = aggregate(ids);
    var sc = isMix ? null : list[pick];

    wrap.appendChild(el('p', 'facing', isMix
      ? '随机抽取上面 ' + list.length + ' 个子场景'
      : sc.facing + '　·　' + sc.labels.raise + '　/　' + sc.labels.call));

    var row = el('div', 'tally-row');
    row.appendChild(el('span', null, 'Total Hands: ' + t.hands));
    row.appendChild(el('span', 'ok', '✔ ' + t.correct));
    row.appendChild(el('span', 'sep', '/'));
    row.appendChild(el('span', 'no', '✖ ' + t.wrong));
    row.querySelector('.ok').style.color = 'var(--good)';
    row.querySelector('.no').style.color = 'var(--bad)';
    wrap.appendChild(row);

    if (isMix) {
      wrap.appendChild(el('div', 'mixnote', '混合练习不预览范围表。想先看表，点上面任一个对手位置。'));
    } else {
      var built = BUILT[sc.id];
      var readout = el('div', 'readout', '点格子查看频率');
      wrap.appendChild(renderGrid(built, function (h, g) {
        var parts = [h.key];
        if (g.raise) parts.push(word(sc.labels.raise) + ' ' + g.raise + '%');
        if (g.call) parts.push(word(sc.labels.call) + ' ' + g.call + '%');
        if (g.fold) parts.push((sc.noFold ? 'Check' : 'Fold') + ' ' + g.fold + '%');
        readout.textContent = parts.join('　/　');
      }));
      wrap.appendChild(legend(sc));
      wrap.appendChild(readout);
    }

    var go = el('button', 'cta', 'Start Training');
    go.onclick = function () { startSession(ids); };
    wrap.appendChild(go);
    root.appendChild(wrap);
  }

  function word(label) { return label.split(' ')[0]; }

  /* ---------------- 训练 ---------------- */
  var session = null;

  function startSession(ids) {
    session = {
      ids: ids, total: store.settings.hands, i: 0, answers: [],
      title: view.opts ? (view.opts.group.toUpperCase() + ' - ' + view.opts.hero) : 'TRAINING',
      back: view.opts
    };
    nextHand();
    show('train');
  }

  function nextHand() {
    var id = session.ids[rand(session.ids.length)];
    var built = BUILT[id];
    var key = Range.dealHand(built, {});
    session.cur = { id: id, key: key, cards: dealCards(key) };
    renderTrain();
  }

  function renderTrain() {
    var sc = BY_ID[session.cur.id];
    setNav(session.title,
      { label: '✕', fn: quitSession },
      { label: 'Table', fn: function () { toggleRange(sc); } });
    navLeft.className = 'icon-btn';
    navRight.className = 'txt-btn';

    var root = document.getElementById('screen-train');
    clear(root);

    var head = el('div', 'trainhead');
    head.appendChild(el('div', 'counter', (session.i + 1) + ' / ' + session.total));
    head.appendChild(el('div', 'counter', session.ids.length > 1 ? 'vs ' + sc.vs : ''));
    head.lastChild.style.fontSize = '14px';
    head.lastChild.style.color = 'var(--muted)';
    head.lastChild.style.fontWeight = '500';
    root.appendChild(head);

    var box = el('div', 'tablebox');
    box.appendChild(renderTable(sc, session.cur.cards));
    root.appendChild(box);

    var acts = el('div', 'actions' + (sc.noFold ? ' two' : ''));
    if (!sc.noFold) acts.appendChild(actBtn('fold', 'Fold', sc));
    acts.appendChild(actBtn('call', sc.labels.call, sc));
    acts.appendChild(actBtn('raise', sc.labels.raise, sc));
    root.appendChild(acts);
  }

  function actBtn(action, label, sc) {
    var b = el('button', 'act ' + action, label);
    b.onclick = function () { answer(action, sc); };
    return b;
  }

  function answer(action, sc) {
    if (!session || session.done) return;
    var built = BUILT[session.cur.id];
    var g = built.grid[session.cur.key];
    var freqs = sc.noFold
      ? { raise: g.raise, call: g.call + g.fold, fold: 0 }
      : g;
    var v = Range.judge(freqs, action, store.settings.threshold);

    session.answers.push({
      id: session.cur.id, key: session.cur.key, cards: session.cur.cards,
      chose: action, correct: v.correct, freqs: freqs
    });

    var s = statOf(session.cur.id);
    s.hands++;
    if (v.correct) s.correct++; else s.wrong++;
    var bh = s.byHand[session.cur.key] || (s.byHand[session.cur.key] = { n: 0, correct: 0 });
    bh.n++;
    if (v.correct) bh.correct++;
    else store.mistakes.push({ id: session.cur.id, key: session.cur.key, chose: action, ts: Date.now() });
    if (store.mistakes.length > 400) store.mistakes = store.mistakes.slice(-400);
    saveStore();

    var done = function () {
      session.i++;
      if (session.i >= session.total) finishSession();
      else nextHand();
    };

    if (store.settings.feedback === 'teach') {
      flash(v.correct, action, freqs, sc, done);
    } else done();
  }

  function flash(ok, chose, freqs, sc, done) {
    var root = document.getElementById('screen-train');
    root.querySelectorAll('.act').forEach(function (b) { b.disabled = true; });
    var f = el('div', 'flash ' + (ok ? 'ok' : 'no'));
    f.appendChild(el('div', 'verdict', ok ? '✔ 正确' : '✖ 错误'));
    f.appendChild(el('div', 'detail', describe(freqs, sc)));
    root.appendChild(f);
    setTimeout(function () { done(); }, ok ? 620 : 1500);
  }

  function describe(freqs, sc) {
    var out = [];
    if (freqs.raise) out.push(word(sc.labels.raise) + ' ' + freqs.raise + '%');
    if (freqs.call) out.push(word(sc.labels.call) + ' ' + freqs.call + '%');
    if (freqs.fold) out.push('Fold ' + freqs.fold + '%');
    return out.join('　/　');
  }

  function toggleRange(sc) {
    var root = document.getElementById('screen-train');
    var open = root.querySelector('.rangeover');
    if (open) { root.removeChild(open); return; }
    var over = el('div', 'rangeover');
    over.style.cssText = 'position:absolute;inset:0;background:rgba(8,20,34,.97);z-index:30;' +
      'padding:16px;overflow-y:auto;';
    var readout = el('div', 'readout', sc.title);
    over.appendChild(renderGrid(BUILT[sc.id], function (h, g) {
      readout.textContent = h.key + '　/　' + describe(g, sc);
    }));
    over.appendChild(legend(sc));
    over.appendChild(readout);
    var close = el('button', 'cta ghost', '关闭');
    close.onclick = function () { root.removeChild(over); };
    over.appendChild(close);
    root.appendChild(over);
  }

  function quitSession() {
    var done = function () { session = null; show('home'); };
    if (session && session.i > 0) {
      ask('退出会放弃本局成绩。已答的 ' + session.i + ' 手仍计入累计统计。', done);
    } else done();
  }

  /* ---------------- 结算 ---------------- */
  function ratingOf(pct) {
    if (pct >= 100) return 'Perfect';
    if (pct >= 90) return 'Excellent';
    if (pct >= 75) return 'Good';
    if (pct >= 60) return 'Fair';
    return 'Needs Work';
  }

  function finishSession() {
    var right = session.answers.filter(function (a) { return a.correct; });
    var wrong = session.answers.filter(function (a) { return !a.correct; });
    var pct = session.answers.length ? right.length / session.answers.length * 100 : 0;

    setNav(session.title, { label: '✕', fn: function () { show('home'); } }, null);
    navLeft.className = 'icon-btn';

    var root = document.getElementById('screen-result');
    clear(root);

    var head = el('div', 'resulthead');
    head.appendChild(el('div', 'score', right.length + ' / ' + session.answers.length));
    head.appendChild(el('div', 'rating', ratingOf(pct)));
    root.appendChild(head);

    var pad = el('div', 'rlist');
    var again = el('button', 'cta', '再来一局');
    var ids = session.ids.slice();
    again.onclick = function () { startSession(ids); };
    pad.appendChild(again);
    var close = el('button', 'cta ghost', 'Close');
    close.onclick = function () { show('home'); };
    pad.appendChild(close);

    if (wrong.length) pad.appendChild(listBlock('✖ INCORRECT', 'var(--bad)', wrong));
    if (right.length) pad.appendChild(listBlock('✔ CORRECT', 'var(--good)', right));
    root.appendChild(pad);

    session.done = true;
    show('result');
  }

  function listBlock(title, color, rows) {
    var wrap = el('div');
    var h = el('h3', null, title);
    h.style.color = color;
    wrap.appendChild(h);
    rows.forEach(function (a) {
      var sc = BY_ID[a.id];
      var r = el('div', 'rrow');
      var mini = el('div', 'mini');
      a.cards.forEach(function (c) { mini.appendChild(cardNode(c, 'mcard')); });
      r.appendChild(mini);

      var info = el('div', 'rinfo');
      var top = topAction(a.freqs);
      var gto = el('div', 'rgto');
      var dot = el('div', 'dot');
      dot.style.background = top.key === 'raise' ? 'var(--raise)'
        : top.key === 'call' ? 'var(--call)' : '#6b7f95';
      gto.appendChild(dot);
      gto.appendChild(el('span', null, actionLabel(top.key, sc).toUpperCase() + ' ' + top.freq + '%'));
      info.appendChild(gto);
      info.appendChild(el('div', 'rmine', '你选了 ' + actionLabel(a.chose, sc) +
        '，GTO 频率 ' + (a.freqs[a.chose] || 0) + '%'));
      if (session.ids.length > 1) info.appendChild(el('div', 'rsrc', sc.title));
      r.appendChild(info);
      wrap.appendChild(r);
    });
    return wrap;
  }

  function topAction(f) {
    var best = { key: 'fold', freq: f.fold };
    if (f.call > best.freq) best = { key: 'call', freq: f.call };
    if (f.raise > best.freq) best = { key: 'raise', freq: f.raise };
    return best;
  }
  function actionLabel(key, sc) {
    if (key === 'raise') return word(sc.labels.raise);
    if (key === 'call') return word(sc.labels.call);
    return sc.noFold ? 'Check' : 'Fold';
  }

  /* ---------------- 设置 ---------------- */
  function renderSettings() {
    setNav('设置', { label: '‹', fn: function () { show('home'); } }, null);
    navLeft.className = 'icon-btn';
    navLeft.style.fontSize = '28px';

    var root = document.getElementById('screen-settings');
    clear(root);
    var pad = el('div', 'pad');

    pad.appendChild(seg('每局手数', '一局练多少手', [10, 20, 50], store.settings.hands,
      function (v) { store.settings.hands = v; saveStore(); renderSettings(); }));

    pad.appendChild(seg('判定阈值', '所选动作频率达到多少算对',
      [['宽松', 15], ['标准', 30], ['严格', 'strict']],
      store.settings.threshold,
      function (v) { store.settings.threshold = v; saveStore(); renderSettings(); }));

    pad.appendChild(seg('反馈时机', '考试模式全程不提示，教学模式每手即时讲解',
      [['考试', 'exam'], ['教学', 'teach']], store.settings.feedback,
      function (v) { store.settings.feedback = v; saveStore(); renderSettings(); }));

    var wipe = el('button', 'cta ghost', '清空全部统计');
    wipe.style.marginTop = '28px';
    wipe.onclick = function () {
      ask('清空全部训练统计与错题记录，无法恢复。', function () {
        store = blank(); saveStore(); show('home');
      });
    };
    pad.appendChild(wipe);

    var t = aggregate(SCENARIOS.map(function (s) { return s.id; }));
    var sum = el('p', null, '累计 ' + t.hands + ' 手　正确 ' + t.correct + '　错误 ' + t.wrong +
      (t.hands ? '　正确率 ' + (t.correct / t.hands * 100).toFixed(1) + '%' : ''));
    sum.style.cssText = 'color:var(--muted);font-size:13.5px;text-align:center;margin-top:14px;';
    pad.appendChild(sum);

    root.appendChild(pad);
  }

  function seg(label, hint, opts, cur, onPick) {
    var row = el('div', 'row');
    var left = el('div');
    left.appendChild(el('div', 'lab', label));
    left.appendChild(el('div', 'hint', hint));
    row.appendChild(left);
    var s = el('div', 'seg');
    opts.forEach(function (o) {
      var text = Array.isArray(o) ? o[0] : String(o);
      var val = Array.isArray(o) ? o[1] : o;
      var b = el('button', val === cur ? 'on' : '', text);
      b.onclick = function () { onPick(val); };
      s.appendChild(b);
    });
    row.appendChild(s);
    return row;
  }

  /* ---------------- 说明 ---------------- */
  function renderHelp() {
    setNav('说明', { label: '‹', fn: function () { show('home'); } }, null);
    navLeft.className = 'icon-btn';
    navLeft.style.fontSize = '28px';

    var root = document.getElementById('screen-help');
    clear(root);
    var pad = el('div', 'pad help');
    var blocks = [
      ['这是什么', '6-max 100BB 现金局的翻前范围训练器。共 36 个场景，覆盖五个位置的开池、15 种 3bet、15 种 4bet，以及 BB 应对 SB 跛入。'],
      ['怎么练', '点任一张位置卡，先看完整范围表，再点 Start Training。每局默认 20 手，按组合数加权发牌，所以你看到的牌型分布和真实牌桌一致。'],
      ['怎么判对错', 'GTO 对边缘手牌给的是频率不是唯一答案。默认你选的动作只要频率达到 30% 就算对；纯策略的手牌自然只有一个正确答案。阈值可以在设置里改。'],
      ['为什么开池场景有 Call 按钮', '那是跛入。UTG 到 BTN 的跛入频率恒为 0，选了一律判错。SB 是唯一例外，它的跛入是有正频率的正解，所以 SB 的范围表是三色的。'],
      ['数据从哪来', '标准 6-max 100BB 解法，按低抽水条件整理。开池率依次是 UTG 16.7%、HJ 23.2%、CO 29.6%、BTN 45.2%、SB 加注 18.4% 加跛入 24.6%。'],
      ['数据存在哪', '全部存在这台手机的浏览器里，不上传，不需要注册。清空缓存或换手机会丢失。']
    ];
    blocks.forEach(function (b) {
      pad.appendChild(el('h3', null, b[0]));
      pad.appendChild(el('p', null, b[1]));
    });
    root.appendChild(pad);
  }

  /* ---------------- 启动 ---------------- */
  show('home');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
