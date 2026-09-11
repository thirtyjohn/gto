/* 翻牌圈训练器 · 界面与训练流程 */
(function () {
  'use strict';

  var el = UI.el, clear = UI.clear, rand = UI.rand, shuffled = UI.shuffled;
  var num = UI.num, ask = UI.ask, heatFill = UI.heatFill;
  var E = Equity, S = Strategy;

  var BY_ID = {};
  FLOP_SCENARIOS.forEach(function (s) { BY_ID[s.id] = s; });

  var PRE = {};   // 翻前范围，按 id
  Range.buildAll(SCENARIOS).forEach(function (b) { PRE[b.scenario.id] = b; });

  /* ---------------- 存储 ---------------- */
  function blank() {
    return {
      stats: {}, mistakes: [], custom: {},
      settings: { hands: 20, feedback: 'exam', preset: 'GTO', valueWidth: 50, raiseWidth: 18 }
    };
  }
  var St = UI.createStore('gto.flop.v1', blank);
  function statOf(id) { return St.statOf(id); }
  function aggregate(ids) { return St.aggregate(ids); }
  function saveStore() { St.save(); }
  function mistakesFor(ids) {
    return St.mistakesFor(ids, function (id) { return !!BY_ID[id]; });
  }

  /* ---------------- 对手范围：预设与自定义 ----------------
   * 优先级：自定义 > 预设 > 翻前原始数据。
   * 自定义存成 169 个格子的频率表，直接拼成 built 结构，不走范围记法。 */
  var presetCache = {};

  function builtFromMap(map) {
    var grid = {};
    Range.ALL_HANDS.forEach(function (h) {
      var f = map[h.key] || 0;
      grid[h.key] = { raise: 0, call: f, fold: 100 - f };
    });
    return { grid: grid };
  }

  function customKey(ref) { return ref.id; }
  function hasCustom(ref) {
    var c = St.data.custom[customKey(ref)];
    return !!(c && Object.keys(c).length);
  }

  function rangeFor(ref, presetName) {
    if (hasCustom(ref)) return builtFromMap(St.data.custom[customKey(ref)]);
    var p = OPP_PRESETS[presetName];
    if (!p || !p.ranges || !p.ranges[ref.id]) return PRE[ref.id];
    var ck = presetName + '|' + ref.id;
    if (!presetCache[ck]) {
      presetCache[ck] = Range.buildScenario({
        id: ck, ranges: { raise: '', call: p.ranges[ref.id] },
        labels: { raise: '', call: '' }, sizing: {}
      });
    }
    return presetCache[ck];
  }
  // 预设与自定义都写在 call 槽里，所以取值动作要换
  function actionFor(ref, presetName) {
    if (hasCustom(ref)) return 'call';
    var p = OPP_PRESETS[presetName];
    return (p && p.ranges && p.ranges[ref.id]) ? 'call' : ref.action;
  }

  // 把当前生效的范围抄成一份可编辑的频率表
  function snapshotRange(ref) {
    var b = rangeFor(ref, St.data.settings.preset), a = actionFor(ref, St.data.settings.preset);
    var map = {};
    Range.ALL_HANDS.forEach(function (h) {
      var g = b.grid[h.key];
      if (g && g[a]) map[h.key] = g[a];
    });
    return map;
  }

  function heroBuilt(sc) { return PRE[sc.heroRange.id]; }
  function heroAction(sc) { return sc.heroRange.action; }
  function oppBuilt(sc) { return rangeFor(sc.oppRange, St.data.settings.preset); }
  function oppAction(sc) { return actionFor(sc.oppRange, St.data.settings.preset); }

  /* ---------------- 尺度与文案 ---------------- */
  function betAmt(sc, frac) { return Math.round(sc.pot * frac * 10) / 10; }
  function actionLabel(sc, key) {
    if (sc.role === 'aggressor') {
      if (key === 'bet33') return '下注 ' + betAmt(sc, sc.sizes.small) + 'BB';
      if (key === 'bet75') return '下注 ' + betAmt(sc, sc.sizes.big) + 'BB';
      return '过牌';
    }
    var faced = betAmt(sc, sc.facing);
    if (key === 'fold') return '弃牌';
    if (key === 'call') return '跟注 ' + faced + 'BB';
    return '加注 ' + (Math.round(faced * sc.raiseMult * 10) / 10) + 'BB';
  }
  var ZONE_CN = { value: '价值区', check: '过牌区', bluff: '诈唬区', fold: '弃牌区', call: '跟注区', raise: '加注区' };
  var ZONE_COLOR = {
    value: 'var(--btn-fold)', check: 'var(--zone-check)', bluff: 'var(--btn-raise)',
    fold: 'var(--zone-check)', call: 'var(--btn-call)', raise: 'var(--btn-fold)'
  };

  /* ---------------- 牌桌状态 ---------------- */
  var ORDER = Table.ORDER;
  function tableState(sc, acted) {
    var idx = {};
    ORDER.forEach(function (p, i) { idx[p] = i; });
    // 翻牌圈只剩两人，其余位置整个不画
    var seats = ORDER.map(function (p) {
      return { pos: p, folded: false, hidden: true, bet: 0, hero: p === sc.hero };
    });
    seats[idx[sc.hero]].hidden = false;
    seats[idx[sc.opp]].hidden = false;
    // 翻牌圈底池已经形成，翻前投入不再单独显示，只显示本圈的下注
    if (sc.role === 'defender') {
      seats[idx[sc.opp]].bet = betAmt(sc, sc.facing);
    }
    if (acted && acted.amount) seats[idx[sc.hero]].bet = acted.amount;
    var extra = seats.reduce(function (s, x) { return s + x.bet; }, 0);
    return { seats: seats, pot: sc.pot + extra };
  }

  /* ---------------- 计算 ---------------- */
  // 把战胜我的组合按牌型分组
  function beatBreakdown(hero, board, range) {
    var my5 = E.best5(hero.concat(board));
    var bv = board.map(function (c) { return E.val(c); }).sort(function (a, b) { return b - a; });
    var g = {}, tot = 0, ahead = 0, tie = 0;
    range.forEach(function (o) {
      tot += o.w;
      var th = E.best5(o.cards.concat(board));
      if (th < my5) { ahead += o.w; return; }
      if (th === my5) { tie += o.w; return; }
      var all = o.cards.concat(board).map(function (c) { return E.val(c); });
      var cnt = {};
      all.forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; });
      var trips = Object.keys(cnt).filter(function (k) { return cnt[k] >= 3; });
      var pairs = Object.keys(cnt).filter(function (k) { return cnt[k] === 2; });
      var r = Cards.read(o.cards, board);
      var name;
      if (r.flush) name = '同花';
      else if (r.straight) name = '顺子';
      else if (trips.length) name = '三条';
      else if (pairs.length >= 2) name = '两对';
      else if (pairs.length === 1) {
        var p = +pairs[0];
        name = p === bv[0] ? '顶对' : p === bv[1] ? '中对' : p === bv[2] ? '底对' : '口袋对';
      } else name = '高牌';
      g[name] = (g[name] || 0) + o.w;
    });
    var list = Object.keys(g).map(function (k) {
      return { name: k, w: g[k], pct: g[k] / tot * 100 };
    }).sort(function (a, b) { return b.w - a.w; });
    return {
      list: list, total: tot, combos: range.length,
      ahead: ahead / tot * 100, tie: tie / tot * 100,
      behind: (tot - ahead - tie) / tot * 100
    };
  }

  function analyse(sc, board, hole) {
    var oppRange = E.expandRange(oppBuilt(sc), oppAction(sc), board.concat(hole));
    var bd = beatBreakdown(hole, board, oppRange);
    var eq = E.equityVsRange(hole, board, oppRange, 6000);
    var ladder = E.rangeLadder(board, heroBuilt(sc), heroAction(sc), oppBuilt(sc), oppAction(sc));
    var p = E.percentileOf(hole, ladder);
    var bcls = Board.classify(board);
    var opts = { valueWidth: St.data.settings.valueWidth, raiseWidth: St.data.settings.raiseWidth };
    // 分析模式里可以摆出不在自己范围内的牌，那时没有分位也就没有建议
    var adv = !p.inRange ? null
      : sc.role === 'aggressor'
        ? S.adviseAggressor(p.percentile, bcls, sc.sizes, opts)
        : S.adviseDefender(p.percentile, sc.facing, opts);
    return {
      breakdown: bd, equity: eq.equity, stderr: eq.stderr,
      ahead: bd.ahead, delta: eq.equity - bd.ahead,
      pct: p.percentile, board: bcls, advice: adv,
      hand: Cards.read(hole, board)
    };
  }

  /* ---------------- 导航 ---------------- */
  var view = { name: 'home' };
  var navLeft = document.getElementById('nav-left');
  var navRight = document.getElementById('nav-right');
  var navTitle = document.getElementById('nav-title');
  var SCREENS = ['home', 'sheet', 'train', 'analysis', 'result', 'settings', 'help'];

  function show(name, opts) {
    view = { name: name, opts: opts || {} };
    SCREENS.forEach(function (n) {
      document.getElementById('screen-' + n).classList.toggle('on', n === name);
    });
    document.getElementById('screen-' + name).scrollTop = 0;
    if (name === 'home') renderHome();
    if (name === 'sheet') renderSheet();
    if (name === 'analysis') renderAnalysis();
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
    setNav('翻牌圈',
      { label: '⚙', fn: function () { show('settings'); } },
      { label: '?', fn: function () { show('help'); } });
    navLeft.className = 'icon-btn';
    navRight.className = 'icon-btn';

    var root = document.getElementById('screen-home');
    clear(root);

    if (St.data.mistakes.length) {
      var w = el('div', 'grp');
      var bar = el('button', 'redobar');
      var left = el('div');
      left.appendChild(el('div', 'redotitle', '错题本'));
      left.appendChild(el('div', 'redosub', St.data.mistakes.length + ' 手待清　·　连续答对两次自动移出'));
      bar.appendChild(left);
      bar.appendChild(el('div', 'redogo', '开始复盘'));
      bar.onclick = function () {
        var q = shuffled(St.data.mistakes).slice(0, 20);
        startSession(q[0] ? BY_ID[q[0].id] : null, q, '错题复盘');
      };
      w.appendChild(bar);
      root.appendChild(w);
    }

    var groups = [];
    FLOP_SCENARIOS.forEach(function (s) {
      if (groups.indexOf(s.group) < 0) groups.push(s.group);
    });
    var anw = el('div', 'grp');
    var anb = el('button', 'redobar');
    var anl = el('div');
    anl.appendChild(el('div', 'redotitle', '分析模式'));
    anl.appendChild(el('div', 'redosub', '自己摆牌面，改对手范围，不计分'));
    anb.appendChild(anl);
    anb.appendChild(el('div', 'redogo', '打开'));
    anb.onclick = function () { show('analysis'); };
    anw.appendChild(anb);
    root.appendChild(anw);

    root.appendChild(crossLink('翻前训练器', '起手牌范围，36 个位置场景', '../index.html'));
    groups.forEach(function (g) {
      var sec = el('div', 'grp');
      sec.appendChild(el('div', 'gh', g));
      sec.appendChild(el('div', 'gs', g === '单加注池'
        ? '开池被跟，底池 5.5 BB' : 'BB 3bet 被跟，底池 22.5 BB'));
      var cards = el('div', 'cards');
      FLOP_SCENARIOS.filter(function (s) { return s.group === g; }).forEach(function (s) {
        var t = aggregate([s.id]);
        var card = el('button', 'poscard' + (t.hands ? '' : ' fresh'));
        card.appendChild(el('div', 'pos', s.hero));
        card.appendChild(el('div', 'sub',
          (s.role === 'aggressor' ? '进攻方' : '防守方') + ' · ' + s.pos +
          (s.group === '单加注池' ? ' · vs ' + s.opp : '')));
        card.appendChild(el('div', 'tot', 'Total Hands: ' + t.hands));
        var tally = el('div', 'tally');
        tally.appendChild(el('span', 'ok', '✔ ' + t.correct));
        tally.appendChild(el('span', 'sep', '/'));
        tally.appendChild(el('span', 'no', '✖ ' + t.wrong));
        card.appendChild(tally);
        var pb = el('div', 'pbar');
        var fi = el('i');
        fi.style.width = (t.hands ? t.correct / t.hands * 100 : 0) + '%';
        pb.appendChild(fi);
        card.appendChild(pb);
        card.onclick = function () { show('sheet', { id: s.id }); };
        cards.appendChild(card);
      });
      sec.appendChild(cards);
      root.appendChild(sec);
    });
  }

  // 两个应用互相放一个入口，换着练时点一下就过去
  function crossLink(title, sub, href) {
    var w = el('div', 'grp');
    var a = el('a', 'crosslink');
    a.href = href;
    var left = el('div');
    left.appendChild(el('div', 'redotitle', title));
    left.appendChild(el('div', 'redosub', sub));
    a.appendChild(left);
    a.appendChild(el('div', 'redogo', '打开'));
    w.appendChild(a);
    return w;
  }

  /* ---------------- 范围网格 ---------------- */
  function rangeGrid(built, action, heat) {
    var box = el('div', 'gridbox');
    var grid = el('div', 'grid');
    Range.ALL_HANDS.forEach(function (h) {
      var g = built.grid[h.key];
      var f = g ? g[action] : 0;
      var rec = heat ? heat[h.key] : null;
      var cell = el('div', 'gcell' + ((heat ? (rec && rec.n) : f >= 50) ? ' lit' : ''), h.key);
      cell.style.background = heat ? heatFill(rec)
        : f === 0 ? '#33475c'
        : 'linear-gradient(to top, #33475c 0 ' + (100 - f) + '%, var(--btn-call) ' + (100 - f) + '% 100%)';
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    return box;
  }
  function rangePct(built, action) {
    var w = 0;
    Range.ALL_HANDS.forEach(function (h) {
      var g = built.grid[h.key];
      if (g) w += h.combos * g[action] / 100;
    });
    return { pct: w / 1326 * 100, combos: Math.round(w) };
  }

  /* ---------------- 场景面 ---------------- */
  function renderSheet() {
    var sc = BY_ID[view.opts.id];
    setNav(sc.group + ' · ' + sc.hero, { label: '✕', fn: function () { show('home'); } }, null);
    navLeft.className = 'icon-btn';

    var root = document.getElementById('screen-sheet');
    clear(root);
    var w = el('div', 'sheetwrap');

    w.appendChild(el('p', 'facing', sc.line + '。底池 ' + sc.pot + 'BB，你' + sc.pos + '。'));

    var t = aggregate([sc.id]);
    var row = el('div', 'tally-row');
    row.appendChild(el('span', null, 'Total Hands: ' + t.hands));
    var okS = el('span', 'ok', '✔ ' + t.correct); okS.style.color = 'var(--good)';
    var noS = el('span', 'no', '✖ ' + t.wrong); noS.style.color = 'var(--bad)';
    row.appendChild(okS); row.appendChild(el('span', 'sep', '/')); row.appendChild(noS);
    w.appendChild(row);

    // 双方范围
    var hb = heroBuilt(sc), ha = heroAction(sc);
    var ob = oppBuilt(sc), oa = oppAction(sc);
    var hp = rangePct(hb, ha), op = rangePct(ob, oa);
    var pair = el('div', 'rangepair');
    [['你的范围', hb, ha, hp], ['对手范围', ob, oa, op]].forEach(function (r) {
      var col = el('div');
      var hd = el('div', 'rghd');
      hd.appendChild(el('b', null, r[0]));
      hd.appendChild(el('span', null, r[3].pct.toFixed(1) + '%'));
      col.appendChild(hd);
      col.appendChild(rangeGrid(r[1], r[2]));
      col.appendChild(el('div', 'rgft', r[3].combos + ' 组合'));
      pair.appendChild(col);
    });
    w.appendChild(pair);

    // 对手预设
    w.appendChild(el('div', 'lab', '对手类型'));
    var chips = el('div', 'chips');
    Object.keys(OPP_PRESETS).forEach(function (k) {
      var c = el('button', 'chip' + (St.data.settings.preset === k ? ' on' : ''), k);
      c.onclick = function () {
        St.data.settings.preset = k; saveStore();
        E.clearCache(); renderSheet();
      };
      chips.appendChild(c);
    });
    w.appendChild(chips);
    var pd = OPP_PRESETS[St.data.settings.preset];
    w.appendChild(el('p', 'presetnote', pd && pd.label
      ? pd.label : '按翻前解法整理的标准范围'));

    var go = el('button', 'cta', '开始训练');
    go.onclick = function () { startSession(sc, null, null); };
    w.appendChild(go);

    var wrongs = mistakesFor([sc.id]);
    if (wrongs.length) {
      var redo = el('button', 'cta ghost', '只练错题 · ' + wrongs.length + ' 手');
      redo.onclick = function () { startSession(sc, shuffled(wrongs).slice(0, 20), '错题复盘'); };
      w.appendChild(redo);
    }
    root.appendChild(w);
  }

  /* ---------------- 训练 ---------------- */
  var session = null;

  function startSession(sc, queue, title) {
    session = {
      sc: sc, queue: queue || null, i: 0, answers: [],
      total: queue ? queue.length : St.data.settings.hands,
      title: title || (sc.group + ' · ' + sc.hero)
    };
    show('train');
    nextHand();
  }

  function dealHand(sc) {
    var mine = E.expandRange(heroBuilt(sc), heroAction(sc), []);
    var pick = mine[rand(mine.length)];
    var guard = 0;
    while (pick.w < 1 && Math.random() > pick.w && guard++ < 60) pick = mine[rand(mine.length)];
    var board = Board.randomFlop(pick.cards);
    return { hole: byRank(pick.cards), board: board };
  }

  // 展开范围时牌是按牌堆顺序出来的，显示前按点数从大到小排
  function byRank(cards) {
    return cards.slice().sort(function (a, b) { return E.val(b) - E.val(a); });
  }

  function nextHand() {
    var sc = session.sc, hole, board;
    if (session.queue) {
      var q = session.queue[session.i];
      sc = BY_ID[q.id] || sc;
      session.sc = sc;
      hole = q.hole; board = q.board;
    } else {
      var d = dealHand(sc);
      hole = d.hole; board = d.board;
    }
    session.cur = { sc: sc, hole: hole, board: board, result: null };
    renderTrain();
    // 牌桌先画出来，分位阶梯在后台算，用户抬手时通常已经算完
    setTimeout(function () {
      if (session && session.cur && session.cur.board === board) {
        E.rangeLadder(board, heroBuilt(sc), heroAction(sc), oppBuilt(sc), oppAction(sc));
      }
    }, 0);
  }

  function renderTrain() {
    var c = session.cur, sc = c.sc;
    setNav(session.title,
      { label: '✕', fn: quitSession },
      { label: '范围', fn: function () { toggleRange(sc); } });
    navLeft.className = 'icon-btn';
    navRight.className = 'txt-btn';

    var root = document.getElementById('screen-train');
    clear(root);

    var head = el('div', 'trainhead');
    head.appendChild(el('div', 'counter', (session.i + 1) + ' / ' + session.total));
    var pot = el('div', 'counter', '底池 ' + tableState(sc).pot + ' BB');
    pot.style.cssText = 'font-size:14px;color:var(--muted);font-weight:500';
    head.appendChild(pot);
    root.appendChild(head);

    var box = el('div', 'tablebox');
    var st = tableState(sc);
    var felt = Table.render({
      seats: st.seats, heroPos: sc.hero, pot: st.pot,
      hole: c.hole, board: c.board
    });
    box.appendChild(felt);
    root.appendChild(box);

    var acts = el('div', 'actions');
    sc.actions.forEach(function (k) {
      var cls = sc.role === 'aggressor'
        ? (k === 'bet33' ? 'raise' : k === 'bet75' ? 'fold' : 'call')
        : (k === 'fold' ? 'fold' : k === 'call' ? 'call' : 'raise');
      var b = el('button', 'act ' + cls, actionLabel(sc, k));
      b.onclick = function () { answer(k); };
      acts.appendChild(b);
    });
    root.appendChild(acts);

    Table.fit(felt);
  }

  function answer(chosen) {
    if (!session || session.done || session.cur.result) return;
    var c = session.cur, sc = c.sc;
    var a = analyse(sc, c.board, c.hole);
    var v = S.judge(a.advice, chosen, sc.role);
    c.result = { chosen: chosen, analysis: a, verdict: v };

    var s = statOf(sc.id);
    s.hands++;
    if (v.correct) s.correct++; else s.wrong++;
    var key = a.board.structure + ' / ' + a.hand.cls;
    var bh = s.byHand[key] || (s.byHand[key] = { n: 0, correct: 0 });
    bh.n++;
    if (v.correct) { bh.correct++; St.clearMistake(sc.id, handKey(c)); }
    else St.noteMistake(sc.id, handKey(c), chosen);
    saveStore();

    session.answers.push({
      id: sc.id, hole: c.hole, board: c.board,
      chosen: chosen, correct: v.correct, marginal: v.marginal, a: a
    });
    renderReveal();
  }

  function handKey(c) { return c.hole.join('') + '|' + c.board.join(''); }

  /* ---------------- 揭示面板 ---------------- */
  function renderReveal() {
    var c = session.cur, sc = c.sc, r = c.result, a = r.analysis;
    var root = document.getElementById('screen-train');

    var scrim = el('div', 'scrim');
    root.appendChild(scrim);
    var sheet = el('div', 'sheet');

    // 判定条
    var hd = el('div', 'revhd');
    var vr = el('div', 'verdict', r.verdict.correct
      ? (r.verdict.marginal ? '✔ 对（贴边）' : '✔ 正确') : '✖ 错误');
    vr.style.color = r.verdict.correct ? 'var(--good)' : 'var(--bad)';
    hd.appendChild(vr);
    hd.appendChild(el('div', 'chosen', '你选了 ' + actionLabel(sc, r.chosen)));
    sheet.appendChild(hd);

    var body = el('div', 'revbody');

    // 一、对手组合
    body.appendChild(el('div', 'lab', '对手可能的组合　' + Math.round(a.breakdown.total) + ' 个'));
    var split = el('div', 'split');
    var sb = el('i'); sb.style.cssText = 'width:' + a.breakdown.behind + '%;background:var(--bad)';
    var st2 = el('i'); st2.style.cssText = 'width:' + a.breakdown.tie + '%;background:var(--dim)';
    var sa = el('i'); sa.style.cssText = 'width:' + a.breakdown.ahead + '%;background:var(--good)';
    split.appendChild(sb); split.appendChild(st2); split.appendChild(sa);
    body.appendChild(split);
    var sl = el('div', 'splitlab');
    var e1 = el('span', null, '比你强 ' + a.breakdown.behind.toFixed(1) + '%');
    e1.style.color = 'var(--bad)';
    var e2 = el('span', null, '比你弱 ' + a.breakdown.ahead.toFixed(1) + '%');
    e2.style.color = 'var(--good)';
    sl.appendChild(e1); sl.appendChild(e2);
    body.appendChild(sl);

    var maxW = a.breakdown.list.length ? a.breakdown.list[0].pct : 1;
    a.breakdown.list.slice(0, 5).forEach(function (g) {
      var row = el('div', 'brow');
      row.appendChild(el('span', 'bn', g.name));
      var trk = el('span', 'btrk');
      var fi = el('i');
      fi.style.cssText = 'width:' + (g.pct / maxW * 100) + '%;background:var(--bad)';
      trk.appendChild(fi);
      row.appendChild(trk);
      row.appendChild(el('span', 'bv', Math.round(g.w) + ' · ' + g.pct.toFixed(0) + '%'));
      body.appendChild(row);
    });
    if (!a.breakdown.list.length) {
      body.appendChild(el('p', 'presetnote', '没有任何组合比你强'));
    }

    // 二、胜率
    body.appendChild(el('div', 'lab', '你的胜率'));
    var tiles = el('div', 'tiles');
    [[a.ahead.toFixed(0) + '%', '现在领先', null],
     [a.equity.toFixed(0) + '%', '算到河牌', null],
     [(a.delta >= 0 ? '+' : '') + a.delta.toFixed(0), '后续增减',
      a.delta >= 0 ? 'var(--good)' : 'var(--bad)']].forEach(function (t) {
      var d = el('div', 'tile');
      var b = el('b', null, t[0]);
      if (t[2]) { b.style.color = t[2]; d.style.borderColor = t[2]; }
      d.appendChild(b);
      d.appendChild(el('span', null, t[1]));
      tiles.appendChild(d);
    });
    body.appendChild(tiles);
    body.appendChild(el('p', 'presetnote',
      a.board.structure + ' · ' + a.board.suit + '　你的牌：' + a.hand.cls));

    // 三、分位
    body.appendChild(el('div', 'lab', '你在自己范围里'));
    var z = a.advice.zones;
    var bar = el('div', 'pctbar');
    if (sc.role === 'aggressor') {
      seg(bar, z.bluffTo, 'repeating-linear-gradient(45deg,var(--btn-raise),var(--btn-raise) 5px,#a86f18 5px,#a86f18 10px)');
      seg(bar, z.valueFrom - z.bluffTo, 'var(--zone-check)');
      seg(bar, 100 - z.valueFrom, 'var(--btn-fold)');
    } else {
      seg(bar, z.foldTo, 'var(--zone-check)');
      seg(bar, z.raiseFrom - z.foldTo, 'var(--btn-call)');
      seg(bar, 100 - z.raiseFrom, 'var(--btn-fold)');
    }
    body.appendChild(bar);
    var mk = el('div', 'mk');
    var tri = el('i');
    tri.style.left = a.pct + '%';
    mk.appendChild(tri);
    body.appendChild(mk);
    var zl = el('div', 'zlab');
    if (sc.role === 'aggressor') {
      zl.appendChild(el('span', null, '诈唬 0–' + z.bluffTo.toFixed(0)));
      zl.appendChild(el('span', null, '过牌 ' + z.bluffTo.toFixed(0) + '–' + z.valueFrom.toFixed(0)));
      zl.appendChild(el('span', null, '价值 ' + z.valueFrom.toFixed(0) + '–100'));
    } else {
      zl.appendChild(el('span', null, '弃牌 0–' + z.foldTo.toFixed(0)));
      zl.appendChild(el('span', null, '跟注 ' + z.foldTo.toFixed(0) + '–' + z.raiseFrom.toFixed(0)));
      zl.appendChild(el('span', null, '加注 ' + z.raiseFrom.toFixed(0) + '–100'));
    }
    body.appendChild(zl);
    var pl = el('p', 'zoneline');
    pl.innerHTML = '排在第 <b>' + a.pct.toFixed(0) + '%</b>，落在' +
      '<b style="color:' + ZONE_COLOR[a.advice.zone] + '">' + ZONE_CN[a.advice.zone] + '</b>';
    body.appendChild(pl);

    // 四、建议
    body.appendChild(el('div', 'lab', '建议'));
    sc.actions.forEach(function (k) {
      var w = a.advice.weights[k] || 0;
      var row = el('div', 'arow');
      row.appendChild(el('span', 'an', actionLabel(sc, k)));
      var trk = el('span', 'atrk');
      var fi = el('i');
      var col = sc.role === 'aggressor'
        ? (k === 'bet33' ? 'var(--btn-raise)' : k === 'bet75' ? 'var(--btn-fold)' : 'var(--btn-call)')
        : (k === 'fold' ? 'var(--fold)' : k === 'call' ? 'var(--btn-call)' : 'var(--btn-fold)');
      fi.style.cssText = 'width:' + w + '%;background:' + col;
      trk.appendChild(fi);
      row.appendChild(trk);
      var v = el('span', 'av', w + '%');
      if (w >= 50) v.style.fontWeight = '700'; else v.style.color = 'var(--muted)';
      row.appendChild(v);
      body.appendChild(row);
    });
    body.appendChild(el('div', 'reason', reasonText(sc, a)));

    sheet.appendChild(body);

    var foot = el('div', 'revfoot');
    var nx = el('button', 'cta', session.i + 1 >= session.total ? '看结算' : '下一手');
    nx.onclick = function () {
      session.i++;
      if (session.i >= session.total) finishSession();
      else nextHand();
    };
    foot.appendChild(nx);
    sheet.appendChild(foot);
    root.appendChild(sheet);
  }

  function seg(parent, width, bg) {
    var i = el('i');
    i.style.cssText = 'width:' + width + '%;background:' + bg;
    parent.appendChild(i);
  }

  /* 一句话理由。分区给骨架，后续增减给补充，两者必须说同一件事，
   * 不能出现"下注取价值"后面接"这是靠摊牌价值的牌"这种自相矛盾。 */
  function reasonText(sc, a) {
    var d = Math.round(a.delta);
    var z = a.advice.zone;

    if (z === 'value') {
      if (d <= -12) {
        return '这手牌现在领先 ' + a.ahead.toFixed(0) + '% 的组合，排在你范围前列，所以下注。' +
          '但它到河牌还会掉 ' + Math.abs(d) + ' 个点，牌力靠的是现在而不是将来，' +
          '所以用小注：既拿到价值，也不必在被加注时为难。';
      }
      if (d >= 8) {
        return '这手牌既排在你范围的顶部，又还能再涨 ' + d + ' 个点，' +
          '是可以用大注的牌，被跟被加都不怕。';
      }
      return '这手牌排在你范围的顶部，领先 ' + a.ahead.toFixed(0) + '% 的组合，下注取价值。';
    }

    if (z === 'bluff') {
      if (d >= 8) {
        return '你只赢 ' + a.ahead.toFixed(0) + '% 的组合，但这正是该下注的位置。' +
          '你在自己范围的底部，没有摊牌价值，而这手牌到河牌还能涨 ' + d + ' 个点，' +
          '诈唬被跟也还有后手。';
      }
      return '你只赢 ' + a.ahead.toFixed(0) + '% 的组合，也没有什么发展空间。' +
        '正因为毫无摊牌价值，它才适合拿来诈唬，好牌要留着过牌。';
    }

    if (z === 'check') {
      if (d <= -12) {
        return '这手牌不上不下：现在领先 ' + a.ahead.toFixed(0) + '% 的组合，' +
          '到河牌却要掉 ' + Math.abs(d) + ' 个点。下注只会被更好的跟、被更差的弃，' +
          '过牌把这点摊牌价值保住。';
      }
      if (d >= 8) {
        return '这手牌在范围中段，但还能涨 ' + d + ' 个点。' +
          '过牌可以免费看下一张，等真的成牌再收钱。';
      }
      return '这手牌在范围中段，下注会被更好的跟、被更差的弃，过牌保住摊牌价值。';
    }

    if (z === 'fold') {
      return '你只赢 ' + a.ahead.toFixed(0) + '% 的组合' +
        (d >= 8 ? '，虽然还有 ' + d + ' 个点的成长空间，但' : '，而且') +
        '赔率不够，这手牌排在你防守范围的最底部，弃掉。';
    }
    if (z === 'raise') {
      return '这手牌排在你范围的顶部，领先 ' + a.ahead.toFixed(0) + '% 的组合，' +
        '加注取价值，也把对手的听牌赶走。';
    }
    return '够格继续但不够格加注。你领先 ' + a.ahead.toFixed(0) + '% 的组合，' +
      '跟注保住摊牌价值，把加注留给更强的牌。';
  }

  function toggleRange(sc) {
    var root = document.getElementById('screen-train');
    var open = root.querySelector('.rangeover');
    if (open) { root.removeChild(open); return; }
    var over = el('div', 'rangeover');
    over.appendChild(el('div', 'lab', '对手范围　' + St.data.settings.preset));
    over.appendChild(rangeGrid(oppBuilt(sc), oppAction(sc)));
    over.appendChild(el('div', 'lab', '你的范围'));
    over.appendChild(rangeGrid(heroBuilt(sc), heroAction(sc)));
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
  function ratingOf(p) {
    if (p >= 100) return 'Perfect';
    if (p >= 90) return 'Excellent';
    if (p >= 75) return 'Good';
    if (p >= 60) return 'Fair';
    return 'Needs Work';
  }

  function finishSession() {
    var right = session.answers.filter(function (x) { return x.correct; });
    var wrong = session.answers.filter(function (x) { return !x.correct; });
    var pct = session.answers.length ? right.length / session.answers.length * 100 : 0;

    setNav(session.title, { label: '✕', fn: function () { show('home'); } }, null);
    navLeft.className = 'icon-btn';

    var root = document.getElementById('screen-result');
    clear(root);

    var head = el('div', 'resulthead');
    head.appendChild(el('div', 'score', right.length + ' / ' + session.answers.length));
    head.appendChild(el('div', 'rating', ratingOf(pct)));
    var marg = session.answers.filter(function (x) { return x.marginal; }).length;
    if (marg) head.appendChild(el('div', 'submeta', '其中 ' + marg + ' 手贴着分区边界，两边都算对'));
    root.appendChild(head);

    var pad = el('div', 'rlist');
    var sc = session.sc;
    var again = el('button', 'cta', '再来一局');
    again.onclick = function () { startSession(sc, null, null); };
    pad.appendChild(again);

    if (wrong.length) {
      var redo = el('button', 'cta ghost', '立刻重练这 ' + wrong.length + ' 手错题');
      redo.onclick = function () {
        startSession(sc, wrong.map(function (x) {
          return { id: x.id, hole: x.hole, board: x.board };
        }), '错题复盘');
      };
      pad.appendChild(redo);
    }
    var close = el('button', 'cta ghost', '返回');
    close.onclick = function () { show('home'); };
    pad.appendChild(close);

    if (wrong.length) pad.appendChild(listBlock('✖ 打错的手牌', 'var(--bad)', wrong));
    if (right.length) pad.appendChild(listBlock('✔ 打对的手牌', 'var(--good)', right));
    root.appendChild(pad);

    session.done = true;
    show('result');
  }

  function listBlock(title, color, rows) {
    var wrap = el('div');
    var h = el('h3', null, title);
    h.style.color = color;
    wrap.appendChild(h);
    rows.forEach(function (x) {
      var sc = BY_ID[x.id];
      var r = el('div', 'rrow');
      var mini = el('div', 'mini');
      x.hole.forEach(function (c) { mini.appendChild(Table.cardNode(c, 'mcard')); });
      r.appendChild(mini);
      var bd = el('div', 'mini bd');
      x.board.forEach(function (c) { bd.appendChild(Table.cardNode(c, 'mcard sm')); });
      r.appendChild(bd);
      var info = el('div', 'rinfo');
      var top = el('div', 'rgto');
      var dot = el('div', 'dot');
      dot.style.background = ZONE_COLOR[x.a.advice.zone];
      top.appendChild(dot);
      top.appendChild(el('span', null, ZONE_CN[x.a.advice.zone] + ' · 分位 ' + x.a.pct.toFixed(0) + '%'));
      info.appendChild(top);
      info.appendChild(el('div', 'rmine', '你选了 ' + actionLabel(sc, x.chosen) +
        (x.marginal ? '（贴边）' : '')));
      r.appendChild(info);
      wrap.appendChild(r);
    });
    return wrap;
  }

  /* ---------------- 分析模式 ----------------
   * 不计分，不发牌。自己摆公共牌与底牌，改对手范围，结果立刻重算。 */
  var an = { scId: FLOP_SCENARIOS[0].id, board: [], hole: [] };

  function renderAnalysis() {
    var sc = BY_ID[an.scId];
    setNav('分析模式',
      { label: '✕', fn: function () { show('home'); } },
      { label: '随机', fn: function () { randomSpot(); } });
    navLeft.className = 'icon-btn';
    navRight.className = 'txt-btn';

    var root = document.getElementById('screen-analysis');
    clear(root);
    var w = el('div', 'sheetwrap');

    // 场景选择
    w.appendChild(el('div', 'lab', '场景'));
    var chips = el('div', 'chips');
    FLOP_SCENARIOS.forEach(function (s) {
      var c = el('button', 'chip' + (s.id === an.scId ? ' on' : ''),
        s.hero + (s.role === 'aggressor' ? ' 进攻' : ' 防守'));
      c.onclick = function () {
        an.scId = s.id; an.hole = []; E.clearCache(); renderAnalysis();
      };
      chips.appendChild(c);
    });
    w.appendChild(chips);
    w.appendChild(el('p', 'presetnote', sc.line + '。底池 ' + sc.pot + 'BB。'));

    // 摆牌
    var box = el('div', 'anbox');
    var hd = el('div', 'anhd');
    hd.appendChild(el('div', 'lab', '公共牌'));
    hd.appendChild(el('em', null, an.board.length === 3
      ? Board.classify(an.board).structure + ' · ' + Board.classify(an.board).suit : '点空位选牌'));
    box.appendChild(hd);
    box.appendChild(slotRow(an.board, 3, 'board'));
    box.appendChild(el('div', 'lab', '你的底牌'));
    box.appendChild(slotRow(an.hole, 2, 'hole'));
    w.appendChild(box);

    // 结果区单独成块，编辑范围时只刷这一块
    var slot = el('div');
    slot.id = 'an-result';
    if (an.board.length === 3 && an.hole.length === 2) slot.appendChild(analysisResult(sc));
    else slot.appendChild(el('p', 'presetnote', '摆满三张公共牌和两张底牌后，这里会显示完整分解。'));
    w.appendChild(slot);

    // 范围编辑器
    var ref = sc.oppRange;
    var b = rangeFor(ref, St.data.settings.preset), act = actionFor(ref, St.data.settings.preset);
    var rp = rangePct(b, act);
    var ehd = el('div', 'anhd');
    ehd.appendChild(el('div', 'lab', '对手范围　点格子增减'));
    var meta = el('em', null, rp.pct.toFixed(1) + '% · ' + rp.combos + ' 组合');
    meta.id = 'an-rangemeta';
    ehd.appendChild(meta);
    w.appendChild(ehd);

    var pchips = el('div', 'chips');
    pchips.id = 'an-presets';
    renderPresetChips(pchips, ref);
    w.appendChild(pchips);

    w.appendChild(editableGrid(ref, b, act));
    var lg = el('div', 'anlegend');
    [['var(--btn-call)', '跟注 100%'], ['#1c6a4c', '部分频率 50%'], ['#33475c', '弃牌']].forEach(function (p) {
      var s = el('span');
      var i = el('i'); i.style.background = p[0];
      s.appendChild(i); s.appendChild(el('b', null, p[1]));
      s.lastChild.style.fontWeight = '400';
      lg.appendChild(s);
    });
    w.appendChild(lg);
    w.appendChild(el('p', 'editnote', '每点一下在弃牌、半频、跟注之间循环。改完上面的胜率与建议立刻重算。'));

    root.appendChild(w);
  }

  function renderPresetChips(host, ref) {
    clear(host);
    Object.keys(OPP_PRESETS).forEach(function (k) {
      var on = !hasCustom(ref) && St.data.settings.preset === k;
      var c = el('button', 'chip' + (on ? ' on' : ''), k);
      c.onclick = function () {
        delete St.data.custom[customKey(ref)];
        St.data.settings.preset = k; saveStore(); E.clearCache(); renderAnalysis();
      };
      host.appendChild(c);
    });
    if (hasCustom(ref)) {
      var cc = el('button', 'chip on', '自定义 · 点此还原');
      cc.onclick = function () {
        delete St.data.custom[customKey(ref)];
        saveStore(); E.clearCache(); renderAnalysis();
      };
      host.appendChild(cc);
    }
  }

  function slotRow(arr, n, which) {
    var row = el('div', 'slots');
    for (var i = 0; i < n; i++) {
      (function (idx) {
        var c = arr[idx];
        var s;
        if (c) {
          s = el('div', 'slot' + (Table.RED[c[1]] ? ' red' : ''));
          s.appendChild(el('div', 'r', c[0]));
          s.appendChild(el('div', 's', Table.SUITS[c[1]]));
        } else {
          s = el('div', 'slot empty', '+');
        }
        s.onclick = function () { openPicker(which, idx); };
        row.appendChild(s);
      })(i);
    }
    return row;
  }

  function usedCards() { return an.board.concat(an.hole); }

  function openPicker(which, idx) {
    var used = usedCards();
    var cur = (which === 'board' ? an.board : an.hole)[idx];
    var over = el('div', 'picker');
    var box = el('div', 'pickbox');
    box.appendChild(el('h4', null, which === 'board' ? '选一张公共牌' : '选一张底牌'));
    var grid = el('div', 'pickgrid');
    'shdc'.split('').forEach(function (su) {
      'AKQJT98765432'.split('').forEach(function (rk) {
        var card = rk + su;
        var taken = used.indexOf(card) >= 0 && card !== cur;
        var c = el('div', 'pcell' + (Table.RED[su] ? ' red' : '') + (taken ? ' used' : ''));
        c.appendChild(el('div', null, rk));
        c.appendChild(el('small', null, Table.SUITS[su]));
        if (!taken) c.onclick = function () {
          var arr = which === 'board' ? an.board : an.hole;
          arr[idx] = card;
          // 填补空洞，保持数组紧凑
          var compact = arr.filter(function (x) { return !!x; });
          if (which === 'board') an.board = compact; else an.hole = compact;
          document.body.removeChild(over);
          E.clearCache();
          renderAnalysis();
        };
        grid.appendChild(c);
      });
    });
    box.appendChild(grid);
    var clr = el('button', 'cta ghost', cur ? '清空这一张' : '取消');
    clr.onclick = function () {
      if (cur) {
        var arr = which === 'board' ? an.board : an.hole;
        arr.splice(idx, 1);
        E.clearCache();
      }
      document.body.removeChild(over);
      renderAnalysis();
    };
    box.appendChild(clr);
    over.appendChild(box);
    over.onclick = function (e) { if (e.target === over) document.body.removeChild(over); };
    document.body.appendChild(over);
  }

  function randomSpot() {
    var sc = BY_ID[an.scId];
    var d = dealHand(sc);
    an.hole = d.hole; an.board = d.board;
    E.clearCache();
    renderAnalysis();
  }

  function analysisResult(sc) {
    var wrap = el('div');
    var a = analyse(sc, an.board, an.hole);
    var inRange = a.pct != null;

    var tiles = el('div', 'tiles');
    [[a.ahead.toFixed(0) + '%', '现在领先', null],
     [a.equity.toFixed(0) + '%', '算到河牌', null],
     [inRange ? a.pct.toFixed(0) + '%' : '—', '范围分位',
      inRange ? ZONE_COLOR[a.advice.zone] : null]].forEach(function (t) {
      var d = el('div', 'tile');
      var b = el('b', null, t[0]);
      if (t[2]) b.style.color = t[2];
      d.appendChild(b);
      d.appendChild(el('span', null, t[1]));
      tiles.appendChild(d);
    });
    wrap.appendChild(tiles);

    var meta = el('p', 'presetnote', '对手 ' + Math.round(a.breakdown.total) + ' 个组合　比你强 ' +
      a.breakdown.behind.toFixed(1) + '%　你的牌：' + a.hand.cls +
      '　后续 ' + (a.delta >= 0 ? '+' : '') + a.delta.toFixed(0));
    wrap.appendChild(meta);

    if (!inRange) {
      wrap.appendChild(el('p', 'editnote', '这手牌不在你这个场景的范围里，所以没有分位与建议。' +
        '换一手牌，或者在上面切到别的场景。'));
      return wrap;
    }

    wrap.appendChild(el('div', 'lab', '建议'));
    sc.actions.forEach(function (k) {
      var wt = a.advice.weights[k] || 0;
      var row = el('div', 'arow');
      row.appendChild(el('span', 'an', actionLabel(sc, k)));
      var trk = el('span', 'atrk');
      var fi = el('i');
      var col = sc.role === 'aggressor'
        ? (k === 'bet33' ? 'var(--btn-raise)' : k === 'bet75' ? 'var(--btn-fold)' : 'var(--btn-call)')
        : (k === 'fold' ? 'var(--fold)' : k === 'call' ? 'var(--btn-call)' : 'var(--btn-fold)');
      fi.style.cssText = 'width:' + wt + '%;background:' + col;
      trk.appendChild(fi);
      row.appendChild(trk);
      var v = el('span', 'av', wt + '%');
      if (wt >= 50) v.style.fontWeight = '700'; else v.style.color = 'var(--muted)';
      row.appendChild(v);
      wrap.appendChild(row);
    });
    wrap.appendChild(el('div', 'reason', reasonText(sc, a)));
    return wrap;
  }

  /* 可编辑的 13×13：每点一下在 0、50、100 之间循环。
   * 点击只改这一格的颜色，不整屏重绘。重算分位阶梯要 350 毫秒，
   * 连点十几下就会卡死，所以计算延后合并，停手 400 毫秒后只刷结果区。 */
  var editTimer = null;

  function editableGrid(ref, built, action) {
    var box = el('div', 'gridbox');
    var grid = el('div', 'grid');
    Range.ALL_HANDS.forEach(function (h) {
      var f = built.grid[h.key] ? built.grid[h.key][action] : 0;
      var cell = el('div', 'gcell edit', h.key);
      paintCell(cell, f);
      cell.onclick = function () {
        var key = customKey(ref);
        if (!St.data.custom[key]) St.data.custom[key] = snapshotRange(ref);
        var cur = St.data.custom[key][h.key] || 0;
        var next = cur === 0 ? 50 : cur < 100 ? 100 : 0;
        St.data.custom[key][h.key] = next;
        paintCell(cell, next);
        scheduleRecalc();
      };
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    return box;
  }

  function paintCell(cell, f) {
    cell.classList.toggle('lit', f >= 50);
    cell.style.background = f === 0 ? '#33475c' : f >= 100 ? 'var(--btn-call)' : '#1c6a4c';
  }

  function scheduleRecalc() {
    var meta = document.getElementById('an-rangemeta');
    if (meta) meta.textContent = '改动中…';
    if (editTimer) clearTimeout(editTimer);
    editTimer = setTimeout(function () {
      editTimer = null;
      saveStore();
      E.clearCache();
      refreshAnalysis();
    }, 400);
  }

  // 只重算结果区与范围占比，不动网格，避免编辑时焦点乱跳
  function refreshAnalysis() {
    var sc = BY_ID[an.scId];
    var meta = document.getElementById('an-rangemeta');
    if (meta) {
      var ref = sc.oppRange;
      var rp = rangePct(rangeFor(ref, St.data.settings.preset), actionFor(ref, St.data.settings.preset));
      meta.textContent = rp.pct.toFixed(1) + '% · ' + rp.combos + ' 组合';
    }
    var slot = document.getElementById('an-result');
    if (!slot) return;
    clear(slot);
    if (an.board.length === 3 && an.hole.length === 2) slot.appendChild(analysisResult(sc));
    else slot.appendChild(el('p', 'presetnote', '摆满三张公共牌和两张底牌后，这里会显示完整分解。'));
    // 自定义标记可能刚出现，预设那一行要跟着变
    var pc = document.getElementById('an-presets');
    if (pc) renderPresetChips(pc, sc.oppRange);
  }

  /* ---------------- 设置 ---------------- */
  function renderSettings() {
    setNav('设置', { label: '‹', fn: function () { show('home'); } }, null);
    navLeft.className = 'icon-btn';
    navLeft.style.fontSize = '28px';

    var root = document.getElementById('screen-settings');
    clear(root);
    var pad = el('div', 'pad');

    pad.appendChild(seg2('每局手数', '一局练多少手', [10, 20, 50], St.data.settings.hands,
      function (v) { St.data.settings.hands = v; saveStore(); renderSettings(); }));

    pad.appendChild(seg2('价值区宽度', '进攻方顶部多少比例走价值下注。这是整套模型唯一的方向盘',
      [40, 50, 60], St.data.settings.valueWidth,
      function (v) { St.data.settings.valueWidth = v; saveStore(); renderSettings(); }));

    pad.appendChild(seg2('加注区宽度', '防守方顶部多少比例走加注',
      [12, 18, 25], St.data.settings.raiseWidth,
      function (v) { St.data.settings.raiseWidth = v; saveStore(); renderSettings(); }));

    pad.appendChild(seg2('对手类型', '默认 GTO。改了之后所有胜率与建议都会重算',
      Object.keys(OPP_PRESETS), St.data.settings.preset,
      function (v) { St.data.settings.preset = v; saveStore(); E.clearCache(); renderSettings(); }));

    var wipe = el('button', 'cta ghost', '清空全部统计');
    wipe.style.marginTop = '26px';
    wipe.onclick = function () {
      ask('清空全部训练统计与错题记录，无法恢复。', function () {
        St.reset(); show('home');
      });
    };
    pad.appendChild(wipe);

    var t = aggregate(FLOP_SCENARIOS.map(function (s) { return s.id; }));
    var sum = el('p', null, '累计 ' + t.hands + ' 手　正确 ' + t.correct + '　错误 ' + t.wrong +
      (t.hands ? '　正确率 ' + (t.correct / t.hands * 100).toFixed(1) + '%' : ''));
    sum.style.cssText = 'color:var(--muted);font-size:13.5px;text-align:center;margin-top:14px';
    pad.appendChild(sum);
    root.appendChild(pad);
  }

  function seg2(label, hint, opts, cur, onPick) {
    var row = el('div', 'row');
    var left = el('div');
    left.appendChild(el('div', 'labx', label));
    left.appendChild(el('div', 'hint', hint));
    row.appendChild(left);
    var s = el('div', 'seg');
    opts.forEach(function (o) {
      var b = el('button', o === cur ? 'on' : '', String(o));
      b.onclick = function () { onPick(o); };
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
    [['这是什么', '翻牌圈的决策训练器。八个场景，覆盖单加注池与 3bet 池，进攻方与防守方两个视角。对手范围来自翻前训练器那份数据。'],
     ['它不是 GTO', '界面上不会出现 GTO 三个字，这是故意的。翻牌的节点数是千万级，只有 solver 能解。这里展示的胜率、组合分解、范围分位全部是精确计算，但把它们变成动作建议靠的是两个明说的常数，不是解出来的均衡。'],
     ['四个数字怎么看', '现在领先是你此刻战胜对手多少组合；算到河牌是把转牌河牌发完的胜率；后续增减是两者之差，正数说明你是听牌，负数说明你靠摊牌价值；范围分位是你这手牌在自己整条范围里的排名。'],
     ['为什么分位比胜率重要', '胜率相近的两手牌打法可能完全相反。中等牌力胜率不低但该过牌，因为下注只会被更好的跟、更差的弃；范围底部的牌胜率很低却该下注，因为它唯一的赢法就是让对手弃牌。分位决定你在极化结构里的位置。'],
     ['贴边是什么意思', '分区边界是人定的常数，不该因为差一个百分点就把人判错。距离边界 5 个百分点以内时，相邻区的动作也算对。'],
     ['想调松紧', '设置里可以换对手类型。注意松不等于弱：一个什么 K 都跟的人，在 K 高面上的顶对比 GTO 玩家还多。'],
     ['数据存在哪', '全部存在这台手机的浏览器里，不上传，不需要注册。']
    ].forEach(function (b) {
      pad.appendChild(el('h3', null, b[0]));
      pad.appendChild(el('p', null, b[1]));
    });
    root.appendChild(pad);
  }

  /* ---------------- 启动 ---------------- */
  Table.watch(function () { return document.querySelector('#screen-train .felt'); });
  show('home');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
