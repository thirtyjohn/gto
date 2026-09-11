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

  /* 错题本：同一手牌只留一条，答错重新计数，连续答对两次移出 */
  function findMistake(id, key) {
    for (var i = 0; i < store.mistakes.length; i++) {
      var m = store.mistakes[i];
      if (m.id === id && m.key === key) return i;
    }
    return -1;
  }
  function noteMistake(id, key, chose) {
    var i = findMistake(id, key);
    if (i >= 0) {
      store.mistakes[i].cleared = 0;
      store.mistakes[i].chose = chose;
      store.mistakes[i].ts = Date.now();
      return;
    }
    store.mistakes.push({ id: id, key: key, chose: chose, ts: Date.now(), cleared: 0 });
    if (store.mistakes.length > 300) store.mistakes.shift();
  }
  function clearMistake(id, key) {
    var i = findMistake(id, key);
    if (i < 0) return;
    store.mistakes[i].cleared = (store.mistakes[i].cleared || 0) + 1;
    if (store.mistakes[i].cleared >= 2) store.mistakes.splice(i, 1);
  }
  function mistakesFor(ids) {
    return store.mistakes.filter(function (m) {
      return ids.indexOf(m.id) >= 0 && BY_ID[m.id];
    });
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
  // 个人错误热力图：练过的格子按错误率着色，没练过的留空
  function heatFill(rec) {
    if (!rec || !rec.n) return '#243347';
    var err = 1 - rec.correct / rec.n;
    if (err <= 0) return 'rgba(47,168,119,.5)';
    return 'rgba(229,83,61,' + (0.3 + err * 0.6).toFixed(2) + ')';
  }

  function renderGrid(built, onPick, heat) {
    var box = el('div', 'gridbox');
    var grid = el('div', 'grid');
    Range.ALL_HANDS.forEach(function (h) {
      var g = built.grid[h.key];
      var rec = heat ? heat[h.key] : null;
      var lit = heat ? (rec && rec.n && rec.correct < rec.n) : (g.raise + g.call >= 50);
      var cell = el('div', 'gcell' + (lit ? ' lit' : ''), h.key);
      cell.style.background = heat ? heatFill(rec) : fillOf(g);
      if (onPick) cell.addEventListener('click', function () { onPick(h, g, rec); });
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    return box;
  }

  function heatLegend() {
    var wrap = el('div', 'legend');
    [['rgba(47,168,119,.5)', '全对'], ['rgba(229,83,61,.45)', '偶尔错'],
     ['rgba(229,83,61,.9)', '常错'], ['#243347', '没练过']].forEach(function (p) {
      var s = el('span');
      var i = el('i'); i.style.background = p[0];
      s.appendChild(i); s.appendChild(el('b', null, p[1]));
      s.lastChild.style.fontWeight = '400';
      wrap.appendChild(s);
    });
    return wrap;
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
  // x/y 是座位中心，bx/by 是下注筹码，都是牌桌的百分比。
  // dside 是按钮位标记贴在座位的哪一侧，它是座位的子元素，跟着座位走，不会因缩放而错位。
  var SLOTS = [
    { x: 50, y: 89, bx: 50, by: 62, dside: 'l' },
    { x: 20, y: 60, bx: 34, by: 50, dside: 'r' },
    { x: 20, y: 33, bx: 34, by: 43, dside: 'r' },
    { x: 50, y: 10, bx: 50, by: 18, dside: 'l' },
    { x: 80, y: 33, bx: 66, by: 43, dside: 'l' },
    { x: 80, y: 60, bx: 66, by: 50, dside: 'l' }
  ];

  // 牌桌尺寸由 JS 量算：填满可用区域，但不允许比宽度的 1.67 倍更高。
  // --u 是牌桌宽度的百分之一，桌上所有元素都按它缩放。
  function fitTable(felt, retried) {
    var box = felt.parentNode;
    if (!box) return;
    var cs = window.getComputedStyle(box);
    var W = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var H = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (W <= 0 || H <= 0) {
      // 容器还没拿到尺寸（比如所在页面刚切换过来），下一帧再量一次
      if (!retried) requestAnimationFrame(function () { fitTable(felt, true); });
      return;
    }
    var w = Math.min(W, 560);
    var h = Math.min(H, w / 0.6);
    felt.style.width = Math.round(w) + 'px';
    felt.style.height = Math.round(h) + 'px';
    // 元素尺寸取宽高里更紧的那一维，桌子被压扁时元素跟着缩，不会互相压到
    felt.style.setProperty('--u', (Math.min(w, h * 0.68) / 100) + 'px');
  }

  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
  function refit() {
    var felt = document.querySelector('#screen-train .felt');
    if (felt) fitTable(felt);
  }

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
      // 已弃牌的人剩多少筹码与决策无关，只留一个变暗的位置圆圈，桌面才干净
      if (!seat.folded) node.appendChild(el('div', 'stack', num(100 - seat.bet) + ' BB'));
      if (pos === 'BTN') node.appendChild(el('div', 'dealer ' + S.dside, 'D'));
      felt.appendChild(node);

      if (seat.bet > 0 && !seat.folded) {
        var bet = el('div', 'bet');
        bet.style.left = S.bx + '%';
        bet.style.top = S.by + '%';
        bet.appendChild(el('b'));
        bet.appendChild(el('span', null, num(seat.bet) + ' BB'));
        felt.appendChild(bet);
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

    if (store.mistakes.length) {
      var wrap = el('div', 'grp');
      var bar = el('button', 'redobar');
      var left = el('div');
      left.appendChild(el('div', 'redotitle', '错题本'));
      left.appendChild(el('div', 'redosub',
        store.mistakes.length + ' 手待清　·　连续答对两次自动移出'));
      bar.appendChild(left);
      bar.appendChild(el('div', 'redogo', '开始复盘'));
      bar.onclick = function () {
        var q = shuffled(store.mistakes).slice(0, 30);
        startSession(q.map(function (m) { return m.id; }), q, '错题复盘');
      };
      wrap.appendChild(bar);
      root.appendChild(wrap);
    }

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
      var st = store.stats[sc.id];
      var heatOn = !!o.heat;

      var tabs = el('div', 'seg wide');
      [['GTO 范围', false], ['我的错误', true]].forEach(function (p) {
        var b = el('button', heatOn === p[1] ? 'on' : '', p[0]);
        b.onclick = function () { view.opts.heat = p[1]; renderSheet(); };
        tabs.appendChild(b);
      });
      wrap.appendChild(tabs);

      var readout = el('div', 'readout', heatOn ? '点格子查看你的战绩' : '点格子查看频率');
      wrap.appendChild(renderGrid(built, function (h, g, rec) {
        if (heatOn) {
          readout.textContent = rec && rec.n
            ? h.key + '　练过 ' + rec.n + ' 次　对 ' + rec.correct + '　错 ' + (rec.n - rec.correct)
            : h.key + '　还没练到过';
          return;
        }
        var parts = [h.key];
        if (g.raise) parts.push(word(sc.labels.raise) + ' ' + g.raise + '%');
        if (g.call) parts.push(word(sc.labels.call) + ' ' + g.call + '%');
        if (g.fold) parts.push((sc.noFold ? 'Check' : 'Fold') + ' ' + g.fold + '%');
        readout.textContent = parts.join('　/　');
      }, heatOn ? (st && st.byHand) || {} : null));
      wrap.appendChild(heatOn ? heatLegend() : legend(sc));
      wrap.appendChild(readout);
    }

    var go = el('button', 'cta', 'Start Training');
    go.onclick = function () { startSession(ids); };
    wrap.appendChild(go);

    var wrongList = mistakesFor(ids);
    if (wrongList.length) {
      var redo = el('button', 'cta ghost', '只练错题 · ' + wrongList.length + ' 手');
      redo.onclick = function () {
        startSession(ids, shuffled(wrongList).slice(0, 30), '错题复盘 · ' + o.hero);
      };
      wrap.appendChild(redo);
    }
    root.appendChild(wrap);
  }

  function word(label) { return label.split(' ')[0]; }

  /* ---------------- 训练 ---------------- */
  var session = null;

  // queue 非空时是错题复盘：按给定的牌逐手发，而不是随机抽
  function startSession(ids, queue, title) {
    session = {
      ids: ids, queue: queue || null, i: 0, answers: [],
      total: queue ? queue.length : store.settings.hands,
      title: title || (view.opts && view.opts.group
        ? view.opts.group.toUpperCase() + ' - ' + view.opts.hero : 'TRAINING')
    };
    show('train');   // 先让牌桌所在的页面可见，容器有了尺寸才量得出牌桌大小
    nextHand();
  }

  function nextHand() {
    var id, key;
    if (session.queue) {
      id = session.queue[session.i].id;
      key = session.queue[session.i].key;
    } else {
      id = session.ids[rand(session.ids.length)];
      key = Range.dealHand(BUILT[id], {});
    }
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
    var felt = renderTable(sc, session.cur.cards);
    box.appendChild(felt);
    root.appendChild(box);

    var acts = el('div', 'actions' + (sc.noFold ? ' two' : ''));
    if (!sc.noFold) acts.appendChild(actBtn('fold', 'Fold', sc));
    acts.appendChild(actBtn('call', sc.labels.call, sc));
    acts.appendChild(actBtn('raise', sc.labels.raise, sc));
    root.appendChild(acts);

    // 整屏拼完再量牌桌，否则量到的是还没扣掉按钮栏的高度
    fitTable(felt);
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
    if (v.correct) { bh.correct++; clearMistake(session.cur.id, session.cur.key); }
    else noteMistake(session.cur.id, session.cur.key, action);
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

  function toggleRange(sc, heatOn) {
    var root = document.getElementById('screen-train');
    var open = root.querySelector('.rangeover');
    if (open) { root.removeChild(open); if (heatOn === undefined) return; }

    var over = el('div', 'rangeover');
    var st = store.stats[sc.id];

    var tabs = el('div', 'seg wide');
    [['GTO 范围', false], ['我的错误', true]].forEach(function (p) {
      var b = el('button', !!heatOn === p[1] ? 'on' : '', p[0]);
      b.onclick = function () { toggleRange(sc, p[1]); };
      tabs.appendChild(b);
    });
    over.appendChild(tabs);

    var readout = el('div', 'readout', sc.title);
    over.appendChild(renderGrid(BUILT[sc.id], function (h, g, rec) {
      readout.textContent = heatOn
        ? (rec && rec.n ? h.key + '　练过 ' + rec.n + ' 次　错 ' + (rec.n - rec.correct) : h.key + '　还没练到过')
        : h.key + '　/　' + describe(g, sc);
    }, heatOn ? (st && st.byHand) || {} : null));
    over.appendChild(heatOn ? heatLegend() : legend(sc));
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

    var wrongNow = wrong.slice();
    if (wrongNow.length) {
      var redo = el('button', 'cta ghost', '立刻重练这 ' + wrongNow.length + ' 手错题');
      redo.onclick = function () {
        startSession(ids, shuffled(wrongNow).map(function (a) {
          return { id: a.id, key: a.key };
        }), '错题复盘');
      };
      pad.appendChild(redo);
    }

    var share = el('button', 'cta ghost', '分享成绩');
    share.onclick = function () { shareResult(right.length, session.answers.length, pct, wrongNow, share); };
    pad.appendChild(share);

    var close = el('button', 'cta ghost', 'Close');
    close.onclick = function () { show('home'); };
    pad.appendChild(close);

    if (wrong.length) pad.appendChild(listBlock('✖ INCORRECT', 'var(--bad)', wrong));
    if (right.length) pad.appendChild(listBlock('✔ CORRECT', 'var(--good)', right));
    root.appendChild(pad);

    session.done = true;
    show('result');
  }

  /* ---------------- 分享长图 ---------------- */
  var F_TEXT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif';
  var F_NUM = 'ui-monospace, Menlo, Consolas, monospace';

  function roundRect(x, l, t, w, h, r) {
    x.beginPath();
    x.moveTo(l + r, t);
    x.arcTo(l + w, t, l + w, t + h, r);
    x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r);
    x.arcTo(l, t, l + w, t, r);
    x.closePath();
  }

  function drawCard(x, l, t, w, card) {
    var h = Math.round(w / 0.73);
    roundRect(x, l, t, w, h, w * 0.12);
    x.fillStyle = '#fff'; x.fill();
    x.fillStyle = RED[card[1]] ? '#c22f26' : '#16202b';
    x.textAlign = 'center';
    x.font = '700 ' + Math.round(w * 0.56) + 'px ' + F_TEXT;
    x.fillText(card[0], l + w / 2, t + h * 0.48);
    x.font = '700 ' + Math.round(w * 0.42) + 'px ' + F_TEXT;
    x.fillText(SUITS[card[1]], l + w / 2, t + h * 0.86);
    return h;
  }

  function shareResult(correct, total, pct, wrong, btn) {
    var W = 900, rowH = 96, shown = wrong.slice(0, 7);
    var H = 620 + (shown.length ? 80 + shown.length * rowH : 0) + 90;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    x.fillStyle = '#0a1626'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#0d1d33'; x.fillRect(0, 0, W, 132);
    x.textAlign = 'center';
    x.fillStyle = '#8ba3bd';
    x.font = '600 34px ' + F_TEXT;
    x.fillText(session.title, W / 2, 82);

    x.fillStyle = '#e9eff6';
    x.font = '800 170px ' + F_NUM;
    x.fillText(correct + ' / ' + total, W / 2, 370);
    x.fillStyle = pct >= 90 ? '#3ecf8e' : pct >= 75 ? '#d9911f' : '#e5533d';
    x.font = '700 62px ' + F_TEXT;
    x.fillText(ratingOf(pct), W / 2, 460);

    x.strokeStyle = '#1f3a58'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(60, 540); x.lineTo(W - 60, 540); x.stroke();

    x.fillStyle = '#8ba3bd';
    x.font = '500 30px ' + F_TEXT;
    x.fillText('6-max · 100BB · 翻前 GTO 训练器', W / 2, 592);

    if (shown.length) {
      var top = 690;
      x.textAlign = 'left';
      x.fillStyle = '#e5533d';
      x.font = '700 32px ' + F_TEXT;
      x.fillText('打错的手牌　' + wrong.length + ' / ' + total, 60, top - 24);
      shown.forEach(function (a, i) {
        var y = top + i * rowH;
        var sc = BY_ID[a.id];
        drawCard(x, 60, y, 58, a.cards[0]);
        drawCard(x, 126, y, 58, a.cards[1]);
        var best = topAction(a.freqs);
        x.fillStyle = best.key === 'raise' ? '#e8703a' : best.key === 'call' ? '#2fa877' : '#6b7f95';
        x.beginPath(); x.arc(212, y + 40, 11, 0, Math.PI * 2); x.fill();
        x.textAlign = 'left';   // drawCard 里把对齐方式改成了居中，这里必须改回来
        x.fillStyle = '#e9eff6';
        x.font = '600 30px ' + F_NUM;
        x.fillText(actionLabel(best.key, sc).toUpperCase() + ' ' + best.freq + '%', 236, y + 50);
        x.fillStyle = '#5d7793';
        x.font = '400 24px ' + F_TEXT;
        x.fillText('你选了 ' + actionLabel(a.chose, sc), 576, y + 50);
      });
      if (wrong.length > shown.length) {
        x.textAlign = 'center';
        x.fillStyle = '#5d7793';
        x.font = '400 26px ' + F_TEXT;
        x.fillText('还有 ' + (wrong.length - shown.length) + ' 手未列出', W / 2, H - 36);
      }
    }

    var text = session.title + '　' + correct + ' / ' + total + '　' + ratingOf(pct);
    c.toBlob(function (blob) {
      if (!blob) { fallbackShare(text, btn); return; }
      var file = null;
      try { file = new File([blob], 'gto-result.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: text }).catch(function () {});
        return;
      }
      // 分享面板用不了就把图贴在页面上，长按即可保存
      var old = document.getElementById('share-img');
      if (old) old.parentNode.removeChild(old);
      var box = el('div', 'shareout');
      box.id = 'share-img';
      box.appendChild(el('p', null, '长按下面的图片保存或转发'));
      var img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      img.alt = '训练成绩';
      box.appendChild(img);
      btn.parentNode.insertBefore(box, btn.nextSibling);
      box.scrollIntoView({ block: 'nearest' });
    }, 'image/png');
  }

  function fallbackShare(text, btn) {
    if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
    btn.textContent = text;
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
