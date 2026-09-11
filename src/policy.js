/* 策略查询与校验。
 * 查询 = 查表 + 花色修正。表在 data/flop-policy.js，修正规则也在那里。
 */
(function (global) {
  'use strict';

  var BY_ID = {};
  FLOP_POLICY.tables.forEach(function (t) { BY_ID[t.id] = t; });

  function tableOf(id) { return BY_ID[id]; }

  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  // 把三元组归一到和为 100，避免修正后出现 99 或 101
  function normalize(freqs, actions) {
    var sum = actions.reduce(function (s, a) { return s + freqs[a]; }, 0);
    if (sum === 100 || sum === 0) return freqs;
    var out = {}, acc = 0;
    actions.forEach(function (a, i) {
      if (i === actions.length - 1) out[a] = 100 - acc;
      else { out[a] = Math.round(freqs[a] / sum * 100); acc += out[a]; }
    });
    return out;
  }

  /* 返回 { bet33, bet75, check } 或 { fold, call, raise } */
  function lookup(tableId, structure, suit, handClass) {
    var t = tableOf(tableId);
    if (!t) return null;
    var row = t.rows[structure];
    if (!row) return null;
    var base = row.hands[handClass];
    if (!base) return null;

    var f = {};
    t.actions.forEach(function (a, i) { f[a] = base[i]; });

    var mod = FLOP_POLICY.suitMod[suit];
    // 只有进攻方的表做花色修正，防守方不做
    if (mod && t.actions[0] === 'bet33') {
      var shift = Math.min(mod.shiftToBig, f.bet33);
      f.bet33 -= shift;
      f.bet75 += shift;
      if (mod.drawClasses.indexOf(handClass) >= 0) {
        var bonus = Math.min(mod.drawBonus, f.check);
        f.check -= bonus;
        f.bet75 += bonus;
      }
      t.actions.forEach(function (a) { f[a] = clamp(f[a]); });
      f = normalize(f, t.actions);
    }
    return f;
  }

  /* 构建时校验：三元组求和、预期区间、覆盖完整性 */
  function validate(handClasses) {
    var problems = [];
    FLOP_POLICY.tables.forEach(function (t) {
      Object.keys(t.rows).forEach(function (st) {
        var row = t.rows[st];
        var totals = [];
        handClasses.forEach(function (hc) {
          var v = row.hands[hc];
          if (!v) {
            problems.push(t.id + ' / ' + st + ' 缺少手牌类别「' + hc + '」');
            return;
          }
          var sum = v[0] + v[1] + v[2];
          if (sum !== 100) {
            problems.push(t.id + ' / ' + st + ' / ' + hc + ' 三项之和为 ' + sum + '，应为 100');
          }
          var agg = t.aggKeys.reduce(function (s, k) {
            return s + v[t.actions.indexOf(k)];
          }, 0);
          totals.push(agg);
        });
        if (totals.length) {
          var mean = totals.reduce(function (a, b) { return a + b; }, 0) / totals.length;
          if (row.expect && (mean < row.expect[0] || mean > row.expect[1])) {
            problems.push(t.id + ' / ' + st + ' 的' + t.aggName + '均值 ' + mean.toFixed(1) +
              '% 落在预期区间 ' + row.expect[0] + '–' + row.expect[1] + '% 之外');
          }
          row._mean = mean;
        }
        if (!row.why || row.why.length < 20) {
          problems.push(t.id + ' / ' + st + ' 缺少足够的理由说明');
        }
      });
    });
    return problems;
  }

  function topAction(freqs, actions) {
    var best = null;
    actions.forEach(function (a) {
      if (!best || freqs[a] > best.freq) best = { key: a, freq: freqs[a] };
    });
    return best;
  }

  global.Policy = {
    tables: FLOP_POLICY.tables,
    tableOf: tableOf,
    lookup: lookup,
    validate: validate,
    topAction: topAction
  };
})(typeof window !== 'undefined' ? window : this);
