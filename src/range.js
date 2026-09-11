/* 范围记法解析器
 * 把 "TT+, AQs+, A5s:75, K9s-K5s, AKo" 这样的字符串展开成 169 手牌的频率表。
 * 记法：
 *   77+        对子 77 到 AA
 *   22-66      对子区间（写成 66-22 也可）
 *   A8s+       A8s 到 AKs
 *   K9s-K5s    同一张高牌的连续区间
 *   AKo        单个手牌
 *   任意 token 后加 :50 表示该动作频率 50%，省略为 100%
 */
(function (global) {
  'use strict';

  var RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
  var RIDX = {};
  for (var r = 0; r < RANKS.length; r++) RIDX[RANKS[r]] = r;

  // i = 高位牌索引，j = 低位牌索引；i<j 同花，i>j 非同花，i===j 对子
  function handKey(i, j) {
    if (i === j) return RANKS[i] + RANKS[j];
    if (i < j) return RANKS[i] + RANKS[j] + 's';
    return RANKS[j] + RANKS[i] + 'o';
  }

  function comboCount(i, j) {
    return i === j ? 6 : (i < j ? 4 : 12);
  }

  // 169 个格子，按 13x13 行列顺序
  var ALL_HANDS = [];
  for (var a = 0; a < 13; a++) {
    for (var b = 0; b < 13; b++) {
      ALL_HANDS.push({ i: a, j: b, key: handKey(a, b), combos: comboCount(a, b) });
    }
  }
  var COMBO_BY_KEY = {};
  ALL_HANDS.forEach(function (h) { COMBO_BY_KEY[h.key] = h.combos; });

  var TOTAL_COMBOS = 1326;

  function parseHand(txt) {
    var m = /^([AKQJT98765432])([AKQJT98765432])(s|o)?$/.exec(txt);
    if (!m) return null;
    var hi = RIDX[m[1]], lo = RIDX[m[2]], suit = m[3];
    if (hi === lo) return suit ? null : { type: 'pair', hi: hi, lo: lo };
    if (!suit) return null;
    if (hi > lo) { var t = hi; hi = lo; lo = t; }   // 允许写成 KAs
    return { type: suit === 's' ? 'suited' : 'offsuit', hi: hi, lo: lo };
  }

  function keyOf(h) {
    if (h.type === 'pair') return RANKS[h.hi] + RANKS[h.hi];
    return RANKS[h.hi] + RANKS[h.lo] + (h.type === 'suited' ? 's' : 'o');
  }

  function expandToken(token, errors) {
    var freq = 100;
    var body = token;
    var ci = token.indexOf(':');
    if (ci >= 0) {
      body = token.slice(0, ci).trim();
      freq = Number(token.slice(ci + 1).trim());
      if (!isFinite(freq) || freq < 0 || freq > 100) {
        errors.push('频率不合法：' + token);
        return [];
      }
    }

    var out = [];
    var plus = false;
    if (body.slice(-1) === '+') { plus = true; body = body.slice(0, -1).trim(); }

    if (body.indexOf('-') > 0) {
      var parts = body.split('-');
      if (parts.length !== 2) { errors.push('区间格式错误：' + token); return []; }
      var lhs = parseHand(parts[0].trim()), rhs = parseHand(parts[1].trim());
      if (!lhs || !rhs) { errors.push('无法识别的手牌：' + token); return []; }
      if (lhs.type !== rhs.type) { errors.push('区间两端类型不一致：' + token); return []; }
      if (lhs.type === 'pair') {
        var p1 = Math.min(lhs.hi, rhs.hi), p2 = Math.max(lhs.hi, rhs.hi);
        for (var p = p1; p <= p2; p++) out.push(RANKS[p] + RANKS[p]);
      } else {
        if (lhs.hi !== rhs.hi) { errors.push('区间高位牌不一致：' + token); return []; }
        var l1 = Math.min(lhs.lo, rhs.lo), l2 = Math.max(lhs.lo, rhs.lo);
        for (var l = l1; l <= l2; l++) {
          out.push(RANKS[lhs.hi] + RANKS[l] + (lhs.type === 'suited' ? 's' : 'o'));
        }
      }
    } else {
      var h = parseHand(body);
      if (!h) { errors.push('无法识别的手牌：' + token); return []; }
      if (plus) {
        if (h.type === 'pair') {
          for (var q = h.hi; q >= 0; q--) out.push(RANKS[q] + RANKS[q]);
        } else {
          for (var k = h.lo; k > h.hi; k--) {
            out.push(RANKS[h.hi] + RANKS[k] + (h.type === 'suited' ? 's' : 'o'));
          }
        }
      } else {
        out.push(keyOf(h));
      }
    }
    return out.map(function (key) { return { key: key, freq: freq }; });
  }

  function parseRange(str, errors) {
    var map = {};
    if (!str) return map;
    str.split(',').forEach(function (raw) {
      var token = raw.trim();
      if (!token) return;
      expandToken(token, errors).forEach(function (e) {
        if (!(e.key in COMBO_BY_KEY)) { errors.push('不存在的手牌：' + e.key); return; }
        if (map[e.key] != null && map[e.key] !== e.freq) {
          errors.push('手牌 ' + e.key + ' 在同一动作里被赋了两次频率');
        }
        map[e.key] = e.freq;
      });
    });
    return map;
  }

  // 把一个场景展开成完整网格 + 统计
  function buildScenario(sc) {
    var errors = [];
    var raise = parseRange(sc.ranges.raise, errors);
    var call = parseRange(sc.ranges.call, errors);
    var noFold = !!sc.noFold;

    var grid = {};
    var w = { raise: 0, call: 0 };

    ALL_HANDS.forEach(function (h) {
      var rf = raise[h.key] || 0;
      var cf = call[h.key] || 0;
      if (rf + cf > 100) {
        errors.push('手牌 ' + h.key + ' 频率合计 ' + (rf + cf) + '% 超过 100%');
        cf = Math.max(0, 100 - rf);
      }
      var last = noFold ? 100 - rf - cf : 100 - rf - cf;
      grid[h.key] = { raise: rf, call: cf, fold: last };
      w.raise += h.combos * rf / 100;
      w.call += h.combos * cf / 100;
    });

    var pctRaise = w.raise / TOTAL_COMBOS * 100;
    var pctCall = w.call / TOTAL_COMBOS * 100;

    if (sc.expect) {
      var total = pctRaise + pctCall;
      if (total < sc.expect[0] || total > sc.expect[1]) {
        errors.push('入池率 ' + total.toFixed(1) + '% 落在预期区间 ' +
          sc.expect[0] + '–' + sc.expect[1] + '% 之外');
      }
    }

    return {
      scenario: sc,
      grid: grid,
      pct: { raise: pctRaise, call: pctCall, total: pctRaise + pctCall },
      combos: { raise: w.raise, call: w.call },
      errors: errors
    };
  }

  function buildAll(scenarios) {
    return scenarios.map(buildScenario);
  }

  // 按组合数加权抽一手牌；weighting = 'combo' | 'flat'
  // focus 为真时，纯弃牌区只占 40%，避免整局都在按 Fold
  function dealHand(built, opts) {
    opts = opts || {};
    var pool = [];
    var foldOnly = [];
    ALL_HANDS.forEach(function (h) {
      var g = built.grid[h.key];
      var wgt = opts.weighting === 'flat' ? 1 : h.combos;
      var entry = { key: h.key, w: wgt };
      if (g.raise === 0 && g.call === 0) foldOnly.push(entry); else pool.push(entry);
    });
    var useFold = opts.focus === false
      ? Math.random() < 0.5
      : Math.random() < 0.4;
    var src = (useFold && foldOnly.length) ? foldOnly : (pool.length ? pool : foldOnly);
    var sum = src.reduce(function (s, e) { return s + e.w; }, 0);
    var pick = Math.random() * sum;
    for (var i = 0; i < src.length; i++) {
      pick -= src[i].w;
      if (pick <= 0) return src[i].key;
    }
    return src[src.length - 1].key;
  }

  // 判定：选择的动作频率 >= 阈值算对
  function judge(freqs, chosen, threshold) {
    var t = threshold == null ? 30 : threshold;
    var f = freqs[chosen] || 0;
    var best = Math.max(freqs.raise, freqs.call, freqs.fold);
    if (t === 'strict') return { correct: f >= best && f > 0, freq: f };
    return { correct: f >= t, freq: f, marginal: f > 0 && f < t };
  }

  global.Range = {
    RANKS: RANKS,
    ALL_HANDS: ALL_HANDS,
    TOTAL_COMBOS: TOTAL_COMBOS,
    handKey: handKey,
    comboCount: comboCount,
    parseRange: parseRange,
    buildScenario: buildScenario,
    buildAll: buildAll,
    dealHand: dealHand,
    judge: judge
  };
})(typeof window !== 'undefined' ? window : this);
