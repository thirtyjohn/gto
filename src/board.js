/* 牌面分类器。判定规则与说明书第 4 节的表格一一对应。 */
(function (global) {
  'use strict';

  var val = Cards.val;

  var STRUCTURES = ['配对面', '同花面', '连接面', 'A 高干燥', 'KQ 高干燥', 'JT 高干燥', '低干燥'];
  var SUITS = ['彩虹', '双色', '单色'];

  function suitAxis(ss) {
    var u = {};
    ss.forEach(function (s) { u[s] = (u[s] || 0) + 1; });
    var counts = Object.keys(u).map(function (k) { return u[k]; });
    if (counts.indexOf(3) >= 0) return '单色';
    if (counts.indexOf(2) >= 0) return '双色';
    return '彩虹';
  }

  function structureOf(v) {
    var s = v.slice().sort(function (a, b) { return b - a; });
    if (s[0] === s[1] || s[1] === s[2]) return '配对面';
    var span = s[0] - s[2];
    if (s[0] === 14) {                        // A 可以当 1 用，取更紧的跨度
      var alt = [1, s[1], s[2]].sort(function (a, b) { return b - a; });
      span = Math.min(span, alt[0] - alt[2]);
    }
    if (span <= 4) return '连接面';
    if (s[0] === 14) return 'A 高干燥';
    if (s[0] >= 12) return 'KQ 高干燥';
    if (s[0] >= 10) return 'JT 高干燥';
    return '低干燥';
  }

  function classify(cards) {
    var v = cards.map(function (c) { return val(c[0]); });
    var suit = suitAxis(cards.map(function (c) { return c[1]; }));
    var st = structureOf(v);
    if (suit === '单色' && st !== '配对面') st = '同花面';
    return { structure: st, suit: suit };
  }

  // 完整的 52 张牌
  var DECK = [];
  '23456789TJQKA'.split('').forEach(function (r) {
    'shdc'.split('').forEach(function (s) { DECK.push(r + s); });
  });

  // 随机发一副翻牌，避开已经在英雄手里的牌
  function randomFlop(dead) {
    var pool = DECK.filter(function (c) { return (dead || []).indexOf(c) < 0; });
    var out = [];
    while (out.length < 3) {
      var i = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(i, 1)[0]);
    }
    return out.sort(function (a, b) { return val(b[0]) - val(a[0]); });
  }

  // 枚举全部 22100 种翻牌，用于分布校验
  function enumerate(fn) {
    for (var a = 0; a < 52; a++) {
      for (var b = a + 1; b < 52; b++) {
        for (var c = b + 1; c < 52; c++) {
          fn([DECK[a], DECK[b], DECK[c]]);
        }
      }
    }
  }

  global.Board = {
    STRUCTURES: STRUCTURES, SUITS: SUITS, DECK: DECK,
    classify: classify, randomFlop: randomFlop, enumerate: enumerate
  };
})(typeof window !== 'undefined' ? window : this);
