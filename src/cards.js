/* 牌力评估与手牌分类。
 * 输入是 ['As','Kd'] 这种字符串，与 table.js 用的格式一致。
 * 输出是说明书第 5 节定义的八类之一。
 */
(function (global) {
  'use strict';

  var RANK_CH = '23456789TJQKA';
  function val(ch) { return RANK_CH.indexOf(ch) + 2; }
  function rankOf(card) { return val(card[0]); }
  function suitOf(card) { return card[1]; }

  var CLASSES = [
    '超强牌', '强顶对及以上', '弱顶对', '中对底对',
    '强听牌', '普通听牌', '弱牌有潜力', '空气'
  ];

  function counts(list) {
    var c = {};
    list.forEach(function (v) { c[v] = (c[v] || 0) + 1; });
    return c;
  }

  function hasStraight(vals) {
    var set = {};
    vals.forEach(function (v) { set[v] = 1; if (v === 14) set[1] = 1; });
    for (var hi = 14; hi >= 5; hi--) {
      var ok = true;
      for (var k = 0; k < 5; k++) if (!set[hi - k]) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  // 还差一张就成顺时，能成顺的点数有几个。两个及以上算两头顺，一个算卡顺。
  function straightOuts(vals) {
    var outs = [];
    for (var r = 2; r <= 14; r++) {
      if (hasStraight(vals.concat([r]))) outs.push(r);
    }
    return outs;
  }

  // 某个五张窗口里有没有三个不同点数，且至少用到一张底牌
  function backdoorStraight(holeVals, allVals) {
    for (var lo = 2; lo <= 10; lo++) {
      var inWindow = {}, usesHole = false;
      allVals.forEach(function (v) {
        var w = v;
        if (v === 14 && lo === 2) w = 1;                 // A 当 1 用
        if (w >= (lo === 2 ? 1 : lo) && w <= lo + 4) inWindow[w] = 1;
      });
      holeVals.forEach(function (v) {
        var w = (v === 14 && lo === 2) ? 1 : v;
        if (w >= (lo === 2 ? 1 : lo) && w <= lo + 4) usesHole = true;
      });
      if (Object.keys(inWindow).length >= 3 && usesHole) return true;
    }
    return false;
  }

  /* 返回一份完整的读牌结果，分类只是其中一项，其余字段用于界面解释。 */
  function read(hole, board) {
    var hv = hole.map(rankOf), bv = board.map(rankOf);
    var hs = hole.map(suitOf), bs = board.map(suitOf);
    var allV = hv.concat(bv), allS = hs.concat(bs);
    var vc = counts(allV), sc = counts(allS);
    var boardTop = Math.max.apply(null, bv);

    var flush = false, flushSuit = null, flushDraw = false, backdoorFlush = false;
    Object.keys(sc).forEach(function (s) {
      var inHole = hs.indexOf(s) >= 0;
      if (sc[s] >= 5) { flush = true; flushSuit = s; }
      else if (sc[s] === 4 && inHole) flushDraw = true;
      else if (sc[s] === 3 && inHole) backdoorFlush = true;
    });

    var straight = hasStraight(allV);
    var outs = straight ? [] : straightOuts(allV);
    var oesd = outs.length >= 2, gutshot = outs.length === 1;

    // 只认用到底牌的成对，纯牌面对子不算我们的牌力
    var quads = false, trips = false, pairRanks = [];
    Object.keys(vc).map(Number).forEach(function (r) {
      var usesHole = hv.indexOf(r) >= 0;
      if (vc[r] === 4 && usesHole) quads = true;
      else if (vc[r] === 3 && usesHole) trips = true;
      else if (vc[r] === 2) pairRanks.push({ r: r, usesHole: usesHole });
    });
    var ourPairs = pairRanks.filter(function (p) { return p.usesHole; });
    var twoPair = pairRanks.length >= 2 && ourPairs.length >= 1;

    var res = {
      flush: flush, straight: straight, quads: quads, trips: trips,
      twoPair: twoPair, flushDraw: flushDraw, backdoorFlush: backdoorFlush,
      oesd: oesd, gutshot: gutshot, outs: outs.length,
      boardTop: boardTop, pair: null, kicker: null
    };

    if (ourPairs.length === 1 && !trips && !quads && !twoPair) {
      var pr = ourPairs[0].r;
      var pocket = hv[0] === hv[1];
      res.pair = { rank: pr, pocket: pocket };
      if (pocket) {
        res.pair.kind = pr > boardTop ? '超对' : '低于顶张的口袋对';
      } else {
        res.pair.kind = pr === boardTop ? '顶对'
          : pr === Math.min.apply(null, bv) ? '底对' : '中对';
        var other = hv[0] === pr ? hv[1] : hv[0];
        res.kicker = other;
      }
    }

    res.overcards = hv[0] > boardTop && hv[1] > boardTop;
    res.backdoorStraight = !straight && !oesd && !gutshot &&
      backdoorStraight(hv, allV);
    res.cls = classOf(res);
    return res;
  }

  function classOf(r) {
    if (r.flush || r.straight || r.quads || r.trips || r.twoPair) return '超强牌';

    if (r.pair) {
      if (r.pair.kind === '超对') return '强顶对及以上';
      if (r.pair.kind === '顶对') return r.kicker >= 10 ? '强顶对及以上' : '弱顶对';
      return '中对底对';
    }

    var anyDraw = r.flushDraw || r.oesd || r.gutshot;
    if (r.flushDraw && (r.oesd || r.gutshot)) return '强听牌';
    if (anyDraw && r.overcards) return '强听牌';
    if (r.flushDraw || r.oesd) return '普通听牌';
    if (r.gutshot || r.overcards || (r.backdoorFlush && r.backdoorStraight)) return '弱牌有潜力';
    return '空气';
  }

  function classify(hole, board) { return read(hole, board).cls; }

  global.Cards = {
    RANK_CH: RANK_CH, CLASSES: CLASSES,
    val: val, rankOf: rankOf, suitOf: suitOf,
    hasStraight: hasStraight, read: read, classify: classify
  };
})(typeof window !== 'undefined' ? window : this);
