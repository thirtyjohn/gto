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

  /* ---------------- 范围分位 ----------------
   * 把我方范围的每个组合按"现在领先率"排序，得出某手牌的百分位。
   * 这是极化的依据：顶端取价值，底端当诈唬，中间过牌。
   * 每个牌面只需算一次，结果缓存。
   */
  var pctCache = {};

  function rangeLadder(board, heroBuilt, heroAction, oppBuilt, oppAction) {
    var ck = board.join('') + '|' + heroAction + '|' + oppAction;
    if (pctCache[ck]) return pctCache[ck];

    var mine = expandRange(heroBuilt, heroAction, board);
    var rows = mine.map(function (m) {
      var opp = expandRange(oppBuilt, oppAction, board.concat(m.cards));
      var sd = showdown(m.cards, board, opp);
      return { key: m.cards.slice().sort().join(''), w: m.w, ahead: sd.ahead };
    });
    rows.sort(function (a, b) { return a.ahead - b.ahead; });
    var total = rows.reduce(function (s, x) { return s + x.w; }, 0);

    // 领先率相同的组合在策略上完全等价，必须拿到同一个分位。
    // 按排序顺序逐个累加会让它们被数组顺序拉开，所以整组取中点。
    var i = 0, acc = 0;
    while (i < rows.length) {
      var j = i, groupW = 0;
      while (j < rows.length && rows[j].ahead === rows[i].ahead) { groupW += rows[j].w; j++; }
      var mid = acc + groupW / 2;
      for (var k = i; k < j; k++) rows[k].below = mid;
      acc += groupW;
      i = j;
    }

    var out = { rows: rows, total: total };
    pctCache[ck] = out;
    return out;
  }

  function percentileOf(cards, ladder) {
    var k = cards.slice().sort().join('');
    for (var i = 0; i < ladder.rows.length; i++) {
      if (ladder.rows[i].key === k) {
        return {
          percentile: ladder.rows[i].below / ladder.total * 100,
          ahead: ladder.rows[i].ahead,
          inRange: true
        };
      }
    }
    return { percentile: null, ahead: null, inRange: false };
  }

  function clearCache() { pctCache = {}; }

  global.Equity = {
    DECK: DECK, RANKS: RANKS, SUITS: SUITS,
    val: val, suit: suit, handKeyOf: handKeyOf,
    score5: score5, best5: best5, best7: best7,
    expandRange: expandRange, showdown: showdown,
    equityExact: equityExact, equityVsRange: equityVsRange,
    rangeLadder: rangeLadder, percentileOf: percentileOf, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : this);
