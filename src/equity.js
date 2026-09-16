/* 胜率引擎：牌力评估、范围展开、当前强弱、胜率、范围分位。
 *
 * 牌用 'As' 'Kd' 这种两字符串，与 table.js 和 cards.js 一致。
 * 翻牌圈还剩两张公共牌要发，所有"胜率"都指算到河牌。
 */
(function (global) {
  'use strict';

  var RANKS = '23456789TJQKA';
  var SUITS = 'shdc';

  var DECK = [];
  for (var r = 0; r < 13; r++) {
    for (var s = 0; s < 4; s++) DECK.push(RANKS[r] + SUITS[s]);
  }

  function val(card) { return RANKS.indexOf(card[0]) + 2; }
  function suit(card) { return card[1]; }

  /* ---------------- 牌力评估 ----------------
   * 五张牌评分成一个整数，大的赢。分值构造：
   *   类别 × 15^5 + 关键点数从高到低
   * 类别：8 同花顺 7 四条 6 葫芦 5 同花 4 顺子 3 三条 2 两对 1 一对 0 高牌
   */
  function score5(vs, ss) {
    var cnt = {}, i;
    for (i = 0; i < 5; i++) cnt[vs[i]] = (cnt[vs[i]] || 0) + 1;

    var flush = ss[0] === ss[1] && ss[1] === ss[2] && ss[2] === ss[3] && ss[3] === ss[4];
    var uniq = Object.keys(cnt).map(Number);
    var straight = 0;
    if (uniq.length === 5) {
      var srt = uniq.slice().sort(function (a, b) { return b - a; });
      if (srt[0] - srt[4] === 4) straight = srt[0];
      else if (srt[0] === 14 && srt[1] === 5 && srt[4] === 2) straight = 5;  // 轮子
    }
    // 先按出现次数排，次数相同按点数排。葫芦的三条排在对子前面。
    var groups = uniq.slice().sort(function (a, b) { return cnt[b] - cnt[a] || b - a; });
    var shape = groups.map(function (v) { return cnt[v]; }).join('');

    var cat;
    if (straight && flush) cat = 8;
    else if (shape.charAt(0) === '4') cat = 7;
    else if (shape === '32') cat = 6;
    else if (flush) cat = 5;
    else if (straight) cat = 4;
    else if (shape.charAt(0) === '3') cat = 3;
    else if (shape.slice(0, 2) === '22') cat = 2;
    else if (shape.charAt(0) === '2') cat = 1;
    else cat = 0;

    var key = (cat === 8 || cat === 4) ? [straight] : groups;
    var v = cat;
    for (i = 0; i < 5; i++) v = v * 15 + (key[i] || 0);
    return v;
  }

  function best5(cards) {
    return score5(cards.map(val), cards.map(suit));
  }

  // 七张取最好的五张：枚举 21 个子集
  var SUB7 = [];
  (function () {
    for (var a = 0; a < 7; a++) for (var b = a + 1; b < 7; b++)
      for (var c = b + 1; c < 7; c++) for (var d = c + 1; d < 7; d++)
        for (var e = d + 1; e < 7; e++) SUB7.push([a, b, c, d, e]);
  })();

  function best7(cards) {
    var vs = cards.map(val), ss = cards.map(suit), best = -1;
    for (var i = 0; i < 21; i++) {
      var s = SUB7[i];
      var sc = score5(
        [vs[s[0]], vs[s[1]], vs[s[2]], vs[s[3]], vs[s[4]]],
        [ss[s[0]], ss[s[1]], ss[s[2]], ss[s[3]], ss[s[4]]]
      );
      if (sc > best) best = sc;
    }
    return best;
  }

  /* ---------------- 范围展开 ----------------
   * 把 169 网格的频率表展开成带权重的实体组合，并剔除死牌。
   */
  function handKeyOf(c1, c2) {
    var v1 = val(c1), v2 = val(c2);
    var hi = v1 >= v2 ? c1 : c2, lo = v1 >= v2 ? c2 : c1;
    if (val(hi) === val(lo)) return hi[0] + lo[0];
    return hi[0] + lo[0] + (hi[1] === lo[1] ? 's' : 'o');
  }

  function expandRange(built, action, dead) {
    dead = dead || [];
    var out = [];
    for (var i = 0; i < 52; i++) {
      if (dead.indexOf(DECK[i]) >= 0) continue;
      for (var j = i + 1; j < 52; j++) {
        if (dead.indexOf(DECK[j]) >= 0) continue;
        var g = built.grid[handKeyOf(DECK[i], DECK[j])];
        var f = g ? g[action] : 0;
        if (f > 0) out.push({ cards: [DECK[i], DECK[j]], w: f / 100 });
      }
    }
    return out;
  }

  /* ---------------- 当前强弱 ----------------
   * 精确枚举，不抽样。返回按权重计的领先、打平、落后。
   */
  function showdown(hero, board, range) {
    var mine = best5(hero.concat(board));
    var ahead = 0, tie = 0, behind = 0, tot = 0;
    for (var i = 0; i < range.length; i++) {
      var o = range[i];
      var theirs = best5(o.cards.concat(board));
      tot += o.w;
      if (mine > theirs) ahead += o.w;
      else if (mine === theirs) tie += o.w;
      else behind += o.w;
    }
    if (!tot) return { ahead: 0, tie: 0, behind: 0, combos: 0, weighted: 0 };
    return {
      ahead: ahead / tot * 100, tie: tie / tot * 100, behind: behind / tot * 100,
      combos: range.length, weighted: tot
    };
  }

  /* ---------------- 单挑精确胜率 ----------------
   * 枚举全部 C(45,2) = 990 种转牌河牌。这是真值，用来校对蒙特卡洛。
   */
  function equityExact(hero, villain, board) {
    var dead = hero.concat(villain).concat(board);
    var live = DECK.filter(function (c) { return dead.indexOf(c) < 0; });
    var win = 0, tie = 0, lose = 0, n = 0;
    for (var i = 0; i < live.length; i++) {
      for (var j = i + 1; j < live.length; j++) {
        var run = [live[i], live[j]];
        var m = best7(hero.concat(board).concat(run));
        var t = best7(villain.concat(board).concat(run));
        n++;
        if (m > t) win++; else if (m === t) tie++; else lose++;
      }
    }
    return { equity: (win + tie / 2) / n * 100, win: win, tie: tie, lose: lose, runouts: n };
  }

  /* ---------------- 对范围的胜率 ----------------
   * 组合数乘以转牌河牌的枚举量太大（约 55 万次七张评估），所以抽样。
   * 按权重接受组合，保证混合频率被正确采样。
   */
  function equityVsRange(hero, board, range, samples) {
    samples = samples || 8000;
    var dead = hero.concat(board);
    var live = DECK.filter(function (c) { return dead.indexOf(c) < 0; });
    var win = 0, tie = 0, n = 0, guard = 0, cap = samples * 40;
    while (n < samples && guard < cap) {
      guard++;
      var o = range[(Math.random() * range.length) | 0];
      if (!o) break;
      if (o.w < 1 && Math.random() > o.w) continue;
      var i = (Math.random() * live.length) | 0;
      var j = (Math.random() * live.length) | 0;
      if (i === j) continue;
      var t1 = live[i], t2 = live[j];
      if (o.cards.indexOf(t1) >= 0 || o.cards.indexOf(t2) >= 0) continue;
      var m = best7(hero.concat(board).concat([t1, t2]));
      var v = best7(o.cards.concat(board).concat([t1, t2]));
      n++;
      if (m > v) win++; else if (m === v) tie++;
    }
    var eq = n ? (win + tie / 2) / n * 100 : 0;
    // 二项分布的标准误，用于界面上决定小数位
    return { equity: eq, samples: n, stderr: n ? Math.sqrt(eq * (100 - eq) / n) : 0 };
  }

  /* ---------------- 出张 ----------------
   * 数一数：45 张未知牌里，哪一张能把我提升到三条及以上（顺子、同花都算）。
   * 只看一张转牌，所以后门听牌记 0 张 —— 这是有意的低估，不是漏算。
   */
  var SUB6 = [];
  (function () {
    for (var a = 0; a < 6; a++) for (var b = a + 1; b < 6; b++)
      for (var c = b + 1; c < 6; c++) for (var d = c + 1; d < 6; d++)
        for (var e = d + 1; e < 6; e++) SUB6.push([a, b, c, d, e]);
  })();

  var CAT_UNIT = Math.pow(15, 5);
  function catOf(sc) { return Math.floor(sc / CAT_UNIT); }

  function best6(cards) {
    var vs = cards.map(val), ss = cards.map(suit), best = -1;
    for (var i = 0; i < 6; i++) {
      var s = SUB6[i];
      var sc = score5(
        [vs[s[0]], vs[s[1]], vs[s[2]], vs[s[3]], vs[s[4]]],
        [ss[s[0]], ss[s[1]], ss[s[2]], ss[s[3]], ss[s[4]]]
      );
      if (sc > best) best = sc;
    }
    return best;
  }

  function improveOuts(hero, board) {
    var seen = hero.concat(board);
    var baseCat = catOf(best5(seen));
    var n = 0;
    for (var i = 0; i < 52; i++) {
      var c = DECK[i];
      if (seen.indexOf(c) >= 0) continue;
      if (catOf(best6(seen.concat([c]))) > Math.max(baseCat, 2)) n++;
    }
    return n;
  }

  // 转牌河牌两次机会，至少中一次的概率。翻牌圈未知牌 47 张，精确式子：
  //   1 − (47−o)/47 × (46−o)/46。牌桌上的「出张 ×4」就是它的近似。
  function outsEquity(outs) {
    if (outs <= 0) return 0;
    return (1 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 100;
  }

  /* ---------------- 双向阶梯 ----------------
   * 一次双循环同时算出两件事：我方每个组合在我方范围里的位置，
   * 和对手每个组合在对手范围里的位置。两者是同一张对照表的行与列，
   * 所以不该算两遍。每个组合的五张牌力预先算好，循环里只做整数比较。
   */
  var anCache = {};

  function conflict(a, b) {
    return a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1];
  }

  /* 每个组合存一张「发了这张转牌之后我有多强」的表，52 格，死牌记 −1。
   * 出张顺手从这张表里数出来，不再单独算一遍。这张表是后面算
   * 「被跟之后打到河牌还剩多少胜率」的全部本钱：那一步只做整数比较。 */
  function makeRows(list, board) {
    return list.map(function (m) {
      var seen = m.cards.concat(board);
      var base = best5(seen);
      var floor = Math.max(catOf(base), 2);
      var t6 = new Array(52), outs = 0;
      for (var i = 0; i < 52; i++) {
        var c = DECK[i];
        if (seen.indexOf(c) >= 0) { t6[i] = -1; continue; }
        var s = best6(seen.concat([c]));
        t6[i] = s;
        if (catOf(s) > floor) outs++;
      }
      return {
        cards: m.cards, key: m.cards.slice().sort().join(''), w: m.w,
        score: base, t6: t6,
        outs: outs, outsEq: outsEquity(outs),
        aw: 0, tw: 0, live: 0
      };
    });
  }

  function finishRows(rows) {
    rows.forEach(function (r) {
      r.ahead = r.live ? r.aw / r.live * 100 : 0;
      r.tie = r.live ? r.tw / r.live * 100 : 0;
      var behind = 100 - r.ahead - r.tie;
      // 到河牌的预估胜率：现在领先的算赢，现在落后的按出张救回一部分
      r.eq = r.ahead + r.tie / 2 + behind * r.outsEq / 100;
    });
  }

  function analyze(board, heroBuilt, heroAction, oppBuilt, oppAction) {
    var ck = board.join('') + '|' + heroAction + '|' + oppAction;
    if (anCache[ck]) return anCache[ck];

    var M = makeRows(expandRange(heroBuilt, heroAction, board), board);
    var O = makeRows(expandRange(oppBuilt, oppAction, board), board);

    for (var i = 0; i < M.length; i++) {
      var m = M[i], mc = m.cards, ms = m.score;
      for (var j = 0; j < O.length; j++) {
        var o = O[j];
        if (conflict(mc, o.cards)) continue;
        m.live += o.w; o.live += m.w;
        if (ms > o.score) m.aw += o.w;
        else if (ms === o.score) { m.tw += o.w; o.tw += m.w; }
        else o.aw += m.w;
      }
    }
    finishRows(M); finishRows(O);

    // 我方按当前领先率升序排，这就是分位的定义
    var mine = M.slice().sort(function (a, b) { return a.ahead - b.ahead; });
    var total = mine.reduce(function (s, x) { return s + x.w; }, 0);
    var k = 0, acc = 0;
    while (k < mine.length) {
      // 领先率相同的组合在策略上完全等价，整组取权重中点，避免被数组顺序拉开
      var e = k, gw = 0;
      while (e < mine.length && mine[e].ahead === mine[k].ahead) { gw += mine[e].w; e++; }
      var mid = acc + gw / 2;
      for (var t = k; t < e; t++) { mine[t].below = mid; mine[t].pct = total ? mid / total * 100 : 0; }
      acc += gw; k = e;
    }

    // 对手按预估胜率降序排：他要弃牌时，从这张表的底部开始弃
    var opp = O.slice().sort(function (a, b) { return b.eq - a.eq; });
    var oppTotal = opp.reduce(function (s, x) { return s + x.w; }, 0);

    var byKey = {};
    mine.forEach(function (r) { byKey[r.key] = r; });

    var out = {
      board: board.slice(), mine: mine, opp: opp,
      total: total, oppTotal: oppTotal, byKey: byKey
    };
    anCache[ck] = out;
    return out;
  }

  /* ---------------- 对手的续战范围 ----------------
   * 面对 f 倍底池的下注，对手至少要防守 1/(1+f)，否则任意两张牌诈唬他都赚。
   * 他用哪一部分防守？预估胜率最高的那一部分。取到 MDF 为止，
   * 边界上那一手按比例部分计入，不做四舍五入。
   */
  function continueSet(an, f) {
    var need = an.oppTotal / (1 + f);
    var rows = [], acc = 0;
    for (var i = 0; i < an.opp.length && acc < need - 1e-12; i++) {
      var r = an.opp[i];
      var take = Math.min(r.w, need - acc);
      rows.push({ cards: r.cards, score: r.score, t6: r.t6, w: take, eq: r.eq });
      acc += take;
    }
    return { rows: rows, weight: acc, mdf: 1 / (1 + f), f: f };
  }

  // 我这手牌对上那部分续战范围的摊牌领先率。撞到我手牌的组合当然不存在。
  function vsSet(cards, board, set) {
    var my = best5(cards.concat(board));
    var ahead = 0, tie = 0, live = 0;
    for (var i = 0; i < set.rows.length; i++) {
      var r = set.rows[i];
      if (conflict(cards, r.cards)) continue;
      live += r.w;
      if (my > r.score) ahead += r.w;
      else if (my === r.score) tie += r.w;
    }
    return {
      ahead: live ? ahead / live * 100 : 0,
      tie: live ? tie / live * 100 : 0,
      score: live ? (ahead + tie / 2) / live * 100 : 0,
      live: live
    };
  }

  /* ---------------- 被跟之后还剩多少胜率 ----------------
   * 摊牌领先率只说「现在」。可是被跟注的那部分范围还会发两张牌，
   * 一副被高牌围着的小对子现在领先，打到河牌却往往已经输了。
   * 价值下注要问的是后者，不是前者。
   *
   * 精确到河牌要枚举 990 种转河再乘上整条范围，一个牌面要十几秒，做不到。
   * 这里走一条便宜的路：45 张转牌逐一精确算出「发完这张之后我还领先多少」，
   * 与现在的领先率之差就是这条街的漂移，还要发两张，所以线性外推乘二。
   *
   * 这是近似，不是精确值。听牌在转牌中了就不会在河牌再中一次，所以听牌
   * 会被略微高估。校验页拿它跟枚举真值逐手对照，把实测误差摆在那里。
   */
  function calledEquity(row, set) {
    var rows = [], j;
    for (j = 0; j < set.rows.length; j++) {
      if (!conflict(row.cards, set.rows[j].cards)) rows.push(set.rows[j]);
    }

    var a = 0, w = 0;
    for (j = 0; j < rows.length; j++) {
      w += rows[j].w;
      if (row.score > rows[j].score) a += rows[j].w;
      else if (row.score === rows[j].score) a += rows[j].w / 2;
    }
    var sd = w ? a / w * 100 : 0;

    var acc = 0, n = 0;
    for (var i = 0; i < 52; i++) {
      if (row.t6[i] < 0) continue;              // 这张牌我或公共牌已经占了
      var my = row.t6[i], aa = 0, ww = 0;
      for (j = 0; j < rows.length; j++) {
        var s = rows[j].t6[i];
        if (s < 0) continue;                    // 对手手里正拿着这张转牌
        ww += rows[j].w;
        if (my > s) aa += rows[j].w;
        else if (my === s) aa += rows[j].w / 2;
      }
      if (ww) { acc += aa / ww; n++; }
    }
    var turn = n ? acc / n * 100 : sd;

    return {
      showdown: sd, turn: turn, live: w,
      est: Math.max(0, Math.min(100, sd + 2 * (turn - sd)))
    };
  }

  /* ---------------- 阻断力 ----------------
   * 我手里两张牌会把对手的一部分组合杀掉。关键不是杀了多少，
   * 而是杀「续战的」比杀「全部的」多多少：多出来的那一块就是阻断收益。
   * 平均续战比例恰好等于 MDF，所以这个差额是有基准可比的。
   */
  function blockers(cards, an, set) {
    var contLive = 0, i;
    for (i = 0; i < set.rows.length; i++) {
      if (!conflict(cards, set.rows[i].cards)) contLive += set.rows[i].w;
    }
    var allLive = 0;
    for (i = 0; i < an.opp.length; i++) {
      if (!conflict(cards, an.opp[i].cards)) allLive += an.opp[i].w;
    }
    var contFrac = allLive ? contLive / allLive : 0;
    var base = an.oppTotal ? set.weight / an.oppTotal : 0;
    return {
      contFrac: contFrac * 100,
      base: base * 100,
      block: (base - contFrac) * 100,
      foldFrac: (1 - contFrac) * 100
    };
  }

  /* ---------------- 旧接口 ----------------
   * rangeLadder / percentileOf 保持原样，老的校验页与界面继续能用。
   */
  function rangeLadder(board, heroBuilt, heroAction, oppBuilt, oppAction) {
    var an = analyze(board, heroBuilt, heroAction, oppBuilt, oppAction);
    return { rows: an.mine, total: an.total, an: an };
  }

  function percentileOf(cards, ladder) {
    var k = cards.slice().sort().join('');
    var an = ladder.an;
    var r = an ? an.byKey[k] : null;
    if (!r) {
      for (var i = 0; i < ladder.rows.length; i++) {
        if (ladder.rows[i].key === k) { r = ladder.rows[i]; break; }
      }
    }
    if (!r) return { percentile: null, ahead: null, inRange: false };
    return {
      percentile: r.below / ladder.total * 100,
      ahead: r.ahead, row: r, inRange: true
    };
  }

  function clearCache() { anCache = {}; }

  global.Equity = {
    DECK: DECK, RANKS: RANKS, SUITS: SUITS,
    val: val, suit: suit, handKeyOf: handKeyOf, conflict: conflict,
    score5: score5, best5: best5, best6: best6, best7: best7, catOf: catOf,
    expandRange: expandRange, showdown: showdown,
    equityExact: equityExact, equityVsRange: equityVsRange,
    improveOuts: improveOuts, outsEquity: outsEquity,
    analyze: analyze, continueSet: continueSet, vsSet: vsSet,
    calledEquity: calledEquity, blockers: blockers,
    rangeLadder: rangeLadder, percentileOf: percentileOf, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : this);
