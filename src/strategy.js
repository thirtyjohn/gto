/* 分区模型：把胜率与范围分位变成动作建议。
 *
 * 设计原则是把"我定的"和"算出来的"分得干干净净：
 *
 *   自由常数只有两个，写在 CONST 里，可在设置里改：
 *     valueWidth  进攻方价值区占范围的比例
 *     raiseWidth  防守方加注区占范围的比例
 *
 *   其余全部由数学导出，没有调参空间：
 *     诈唬区宽度  = 价值区宽度 × 诈唬比 ÷ (1 − 诈唬比)，诈唬比由下注尺度的赔率决定
 *     弃牌区宽度  = 1 − 最小防守频率，同样由所面对的下注尺度决定
 *     分位         由 equity.js 按当前领先率排序算出
 *     价值闸       被跟之后打到河牌还剩多少胜率，由对手续战范围逐张转牌算出
 *     诈唬排队     由诈唬与过牌的期望值之差算出，出张与阻断都在里面
 *
 * 不做的事：不推导"下注总频率"。四种推导方式都试过并失败，记录在
 * docs/flop-strategy.html 的第一节。分区边界是明说的常数，不假装是推出来的。
 */
(function (global) {
  'use strict';

  var CONST = {
    valueWidth: 50,   // 进攻方：按当前领先率排序，顶部这么多比例走价值下注
    raiseWidth: 18,   // 防守方：顶部这么多比例走加注
    edge: 5           // 边界容差：距离边界这么近时，相邻两个动作都判对
  };

  /* ---------------- 纯数学部分 ---------------- */

  // 下注 f 倍底池时，为了让对手的跟注无差异，诈唬应占下注总量的这个比例。
  // 对手跟 f 要赢 1+f，所需胜率 f/(1+2f)，这也正是诈唬占比。
  function bluffShare(f) { return f / (1 + 2 * f); }

  // 面对 f 倍底池的下注，最小防守频率。防守不足对方任意两张牌诈唬都赚。
  function mdf(f) { return 1 / (1 + f); }

  // 价值区宽度定了，诈唬区宽度就定了
  function bluffWidth(valueWidth, f) {
    var b = bluffShare(f);
    return valueWidth * b / (1 - b);
  }

  /* ---------------- 进攻方分区 ---------------- */
  /* percentile 是这手牌在我方范围里按当前领先率排的位置，0 最弱 100 最强。
   * 返回落在哪个区，以及该区对应的动作与建议尺度。 */
  function aggressorZones(smallFrac, bigFrac, opts) {
    var V = (opts && opts.valueWidth) || CONST.valueWidth;
    // 诈唬用哪个尺度，宽度就按哪个尺度算。两档各自的诈唬容量取加权。
    var wSmall = bluffWidth(V, smallFrac);
    var wBig = bluffWidth(V, bigFrac);
    return {
      valueFrom: 100 - V,
      bluffTo: (wSmall + wBig) / 2,
      bluffWidthSmall: wSmall,
      bluffWidthBig: wBig,
      valueWidth: V
    };
  }

  /* ---------------- 防守方分区 ---------------- */
  function defenderZones(facingFrac, opts) {
    var R = (opts && opts.raiseWidth) || CONST.raiseWidth;
    var foldWidth = (1 - mdf(facingFrac)) * 100;
    return {
      foldTo: foldWidth,
      raiseFrom: 100 - R,
      foldWidth: foldWidth,
      raiseWidth: R,
      mdf: mdf(facingFrac) * 100
    };
  }

  /* ---------------- 尺度选择 ----------------
   * 大注占下注量的比例由牌面结构决定。干燥面几乎全用小注，
   * 连接面与同花面需要更多大注来收保护费。双色面再加一档。
   * 这是第三处判断，但它只影响尺度不影响是否下注，而且一眼可议。 */
  var BIG_SHARE = {
    'A 高干燥': 15, 'KQ 高干燥': 15, 'JT 高干燥': 20, '低干燥': 20,
    '配对面': 15, '连接面': 45, '同花面': 40
  };

  function bigShare(structure, suitAxis) {
    var b = BIG_SHARE[structure];
    if (b == null) b = 25;
    if (suitAxis === '双色') b += 10;
    return Math.min(b, 60);
  }

  /* ---------------- 三道由期望值决定的闸 ----------------
   * 分区回答"多少牌该下注"，但没回答"哪几手"。下面三件事补上这一步，
   * 全部由赔率与枚举导出，没有新增可调常数。
   *
   *   一、价值闸：下注取价值的前提是更差的牌还会跟，而且跟下来之后你还赢得了。
   *       拿我这手牌去打对手的续战范围，打到河牌的胜率不到一半就不是价值下注。
   *       用的是胜率不是当前领先率：小对子现在领先、打完两张牌却输了的情况太常见。
   *   二、诈唬排队：诈唬名额由赔率定死，但名额该给谁，按诈唬与过牌的
   *       期望值之差排队 —— 出张多的自然排在前面。
   *   三、阻断：对手的续战比例不是一个固定数，我手里这两张牌会改变它，
   *       挡住的续战牌越多，对手弃牌越多，诈唬的期望值越高。
   */

  // 「被跟之后打到河牌还剩多少胜率」由 equity.js 的 calledEquity 算出：
  // 它同时装下了我的出张与对手的反超，所以这里不再另外加出张。

  // 下注之后赢下这个底池的概率：他弃牌我直接赢，他跟注我还有 calledEq
  function winIfBet(foldPct, calledEq) {
    return foldPct + (100 - foldPct) * calledEq / 100;
  }

  /* 诈唬排队分：下注比过牌多赢多少概率。
   * 出张多 → calledEq 高；阻断强 → foldPct 高；摊牌价值高 → 减得多。
   * 三件事已经是同一个单位（概率），不需要再配权重，所以这里没有可调常数。
   *
   * 明说的假设：过牌那一侧只按当前摊牌领先率计，不计过牌之后还能改进。
   * 一条街的模型算不出过牌之后的实现率，与其塞一个实现率参数，不如把
   * 过牌这边算保守，并把这件事写在这里。
   */
  function bluffScore(foldPct, calledEq, showdownNow) {
    return winIfBet(foldPct, calledEq) - showdownNow;
  }

  /* 整条范围一起算，然后分配诈唬名额。名额必须整条范围一起分，
   * 单看一手牌是分不出来的 —— 这正是原来那版缺的一步。 */
  function planAggressor(an, sizes, opts) {
    var E = global.Equity;
    var V = (opts && opts.valueWidth) || CONST.valueWidth;
    var board = an.board;
    // 两档尺度各有各的续战范围：大注逼走的牌多，能被大注跟的更差的牌就少
    var setS = E.continueSet(an, sizes.small);
    var setB = E.continueSet(an, sizes.big);

    var recs = an.mine.map(function (r) {
      var cs = E.calledEquity(r, setS);
      var bl = E.blockers(r.cards, an, setS);
      return {
        key: r.key, cards: r.cards, w: r.w, pct: r.pct, eq: r.eq, outs: r.outs,
        ahead: r.ahead, row: r,
        calledAhead: cs.showdown, calledEq: cs.est, calledTurn: cs.turn,
        calledAheadBig: null, calledEqBig: null, bigOK: false,
        foldFrac: bl.foldFrac, block: bl.block, contFrac: bl.contFrac,
        score: bluffScore(bl.foldFrac, cs.est, r.ahead),
        zone: 'check'
      };
    });

    /* 一、价值闸：分位够高只是入场券。真正的问题是被跟之后打到河牌还剩多少胜率。
     * 这里用的不是「现在领先多少」—— 一副被高牌围着的小对子现在领先，
     * 打完两张牌却往往已经输了，下注只会把它送进一个赢不了的底池。 */
    var valueW = 0;
    recs.forEach(function (x) {
      if (x.pct < 100 - V || x.calledEq < 50) return;
      x.zone = 'value'; valueW += x.w;
      // 过了小注这关才值得再问大注：大注逼走的牌多，能跟的更差的牌就少
      var cb = E.calledEquity(x.row, setB);
      x.calledAheadBig = cb.showdown; x.calledEqBig = cb.est; x.bigOK = cb.est >= 50;
    });
    var valuePct = an.total ? valueW / an.total * 100 : 0;

    // 二、诈唬名额按实际打出去的价值量算：价值被闸掉多少，诈唬跟着少多少
    var cap = (bluffWidth(valuePct, sizes.small) + bluffWidth(valuePct, sizes.big)) / 2;
    var capW = an.total * cap / 100;

    // 三、名额给排队分最高的，且只给下注确实提高胜率的牌
    var pool = recs.filter(function (x) { return x.zone !== 'value' && x.score > 0; });
    pool.sort(function (a, b) { return b.score - a.score; });
    var acc = 0;
    for (var i = 0; i < pool.length && acc < capW; i++) { pool[i].zone = 'bluff'; acc += pool[i].w; }

    var byKey = {};
    recs.forEach(function (x) { byKey[x.key] = x; });
    return {
      role: 'aggressor', byKey: byKey, recs: recs, set: setS, setBig: setB,
      valuePct: valuePct, nominalValuePct: V, bluffCapPct: cap,
      bluffPct: an.total ? acc / an.total * 100 : 0, poolSize: pool.length
    };
  }

  /* 防守方。b 是所面对的下注，加注到 b 的 mult 倍。 */
  function planDefender(an, facingFrac, raiseMult, opts) {
    var E = global.Equity;
    var R = (opts && opts.raiseWidth) || CONST.raiseWidth;
    var board = an.board;
    var b = facingFrac, rTo = raiseMult * b;
    // 对手面对我的加注要补的钱，占他决策时底池的比例
    var fTheirs = (rTo - b) / (1 + b + rTo);
    var set = E.continueSet(an, fTheirs);
    var foldTo = (1 - mdf(b)) * 100;

    var recs = an.mine.map(function (r) {
      var cs = E.calledEquity(r, set);
      var bl = E.blockers(r.cards, an, set);
      return {
        key: r.key, cards: r.cards, w: r.w, pct: r.pct, eq: r.eq, outs: r.outs,
        ahead: r.ahead, row: r,
        calledAhead: cs.showdown, calledEq: cs.est, calledTurn: cs.turn,
        foldFrac: bl.foldFrac, block: bl.block, contFrac: bl.contFrac,
        score: bluffScore(bl.foldFrac, cs.est, r.ahead),
        valueRaise: false,
        zone: 'call'
      };
    });

    var raiseW = 0;
    recs.forEach(function (x) {
      if (x.pct <= foldTo) x.zone = 'fold';
      if (x.pct >= 100 - R && x.calledEq >= 50) {
        x.zone = 'raise'; x.valueRaise = true; raiseW += x.w;
      }
    });
    var raisePct = an.total ? raiseW / an.total * 100 : 0;

    var cap = bluffWidth(raisePct, fTheirs);
    var capW = an.total * cap / 100;
    var pool = recs.filter(function (x) { return !x.valueRaise && x.score > 0; });
    pool.sort(function (a, c) { return c.score - a.score; });
    var acc = 0;
    for (var i = 0; i < pool.length && acc < capW; i++) { pool[i].zone = 'raise'; acc += pool[i].w; }

    var byKey = {};
    recs.forEach(function (x) { byKey[x.key] = x; });
    return {
      role: 'defender', byKey: byKey, recs: recs, set: set,
      foldTo: foldTo, raiseValuePct: raisePct, bluffCapPct: cap,
      raiseBluffPct: an.total ? acc / an.total * 100 : 0,
      facing: b, raiseTo: rTo, fTheirs: fTheirs
    };
  }

  /* ---------------- 主入口 ---------------- */
  /* 进攻方。pct 是分位，det 是这手牌在 planAggressor 里的那条记录。
   * 不给 det 时退回只看分位的老逻辑，校验页用它单独考分区边界。 */
  function adviseAggressor(pct, board, sizes, opts, det) {
    var z = aggressorZones(sizes.small, sizes.big, opts);
    var big = bigShare(board.structure, board.suit);
    var zone, why;

    if (det) {
      zone = det.zone;
      if (zone === 'value') {
        why = '排在你范围顶部，被跟之后打到河牌仍有 ' +
          Math.round(det.calledEq) + '% 胜率，更差的牌会跟，下注取价值';
      } else if (zone === 'bluff') {
        why = '没有摊牌价值，但有 ' + det.outs + ' 张出张' +
          (det.block > 0.5 ? '，还挡住了对手一部分续战牌' : '') +
          '，诈唬比过牌值钱';
      } else if (pct >= z.valueFrom && det.calledAhead >= 50) {
        why = '现在是领先的，但被跟之后打到河牌只剩 ' + Math.round(det.calledEq) +
          '% 胜率：跟你的那些牌后面还会反超你。过牌保住摊牌价值';
      } else if (pct >= z.valueFrom) {
        why = '看着靠前，但跟你的那部分范围里你只有 ' + Math.round(det.calledEq) +
          '% 胜率，更差的牌不会跟，下注反而吃亏，过牌';
      } else {
        why = '不上不下，下注会被更好的跟、更差的弃，过牌保住摊牌价值';
      }
    } else {
      if (pct >= z.valueFrom) { zone = 'value'; why = '这手牌排在你范围的顶部，下注取价值'; }
      else if (pct <= z.bluffTo) { zone = 'bluff'; why = '这手牌排在你范围的底部，没有摊牌价值，正是该诈唬的位置'; }
      else { zone = 'check'; why = '这手牌不上不下，下注会被更好的跟、更差的弃，过牌保住摊牌价值'; }
    }

    var w;
    if (zone === 'check') w = { bet33: 0, bet75: 0, check: 100 };
    else if (det && zone === 'value' && !det.bigOK) {
      // 小注能被更差的牌跟，大注不能：那就只用小注
      w = { bet33: 100, bet75: 0, check: 0 };
    } else w = { bet33: Math.round(100 - big), bet75: Math.round(big), check: 0 };

    return {
      zone: zone, zones: z, why: why, weights: w, detail: det || null,
      near: nearBoundary(pct, [z.bluffTo, z.valueFrom], opts)
    };
  }

  /* 防守方。facing 是所面对的下注占底池的比例。 */
  function adviseDefender(pct, facingFrac, opts, det) {
    var z = defenderZones(facingFrac, opts);
    var zone, why;

    if (det) {
      zone = det.zone;
      if (zone === 'raise' && det.valueRaise) {
        why = '排在你范围顶部，被跟之后打到河牌仍有 ' + Math.round(det.calledEq) + '% 胜率，加注取价值';
      } else if (zone === 'raise') {
        why = '没有摊牌价值，但有 ' + det.outs + ' 张出张' +
          (det.block > 0.5 ? '，还挡住了对手一部分续战牌' : '') +
          '，加注当诈唬比跟注值钱';
      } else if (zone === 'fold') {
        why = '排在你范围底部，赔率不够，当诈唬加注也不划算，弃牌';
      } else if (pct >= z.raiseFrom) {
        why = '看着靠前，但被跟之后打到河牌只剩 ' + Math.round(det.calledEq) +
          '% 胜率，加注只会赶走更差的牌、留下打得过你的，跟注';
      } else {
        why = '够格继续但不够格加注，跟注保住摊牌价值';
      }
    } else {
      if (pct <= z.foldTo) { zone = 'fold'; why = '这手牌排在你范围的底部，赔率不够，弃牌'; }
      else if (pct >= z.raiseFrom) { zone = 'raise'; why = '这手牌排在你范围的顶部，加注取价值'; }
      else { zone = 'call'; why = '够格继续但不够格加注，跟注保住摊牌价值'; }
    }

    var w = zone === 'fold' ? { fold: 100, call: 0, raise: 0 }
      : zone === 'raise' ? { fold: 0, call: 0, raise: 100 }
      : { fold: 0, call: 100, raise: 0 };

    return {
      zone: zone, zones: z, why: why, weights: w, detail: det || null,
      near: nearBoundary(pct, [z.foldTo, z.raiseFrom], opts)
    };
  }

  // 距离任一边界不超过容差时，相邻动作也判对。分区边界是我定的常数，
  // 不该因为差一个百分点就把人判错。
  function nearBoundary(pct, bounds, opts) {
    var e = (opts && opts.edge != null) ? opts.edge : CONST.edge;
    for (var i = 0; i < bounds.length; i++) {
      if (Math.abs(pct - bounds[i]) <= e) return true;
    }
    return false;
  }

  /* 判对错：动作落在本区即对；贴边时相邻区的动作也算对。 */
  function judge(advice, chosen, role) {
    var order = role === 'defender' ? ['fold', 'call', 'raise'] : ['bluff', 'check', 'value'];

    if (role === 'defender') {
      if (chosen === advice.zone) return { correct: true, marginal: false };
      if (advice.near && Math.abs(order.indexOf(chosen) - order.indexOf(advice.zone)) === 1) {
        return { correct: true, marginal: true };
      }
      return { correct: false, marginal: false };
    }

    // 进攻方：下注即算命中价值区或诈唬区，过牌算命中过牌区
    var hit = (chosen === 'check') ? (advice.zone === 'check')
      : (advice.zone === 'value' || advice.zone === 'bluff');
    if (hit) return { correct: true, marginal: false };
    if (advice.near) return { correct: true, marginal: true };
    return { correct: false, marginal: false };
  }

  global.Strategy = {
    CONST: CONST,
    bluffShare: bluffShare, mdf: mdf, bluffWidth: bluffWidth, bigShare: bigShare,
    winIfBet: winIfBet, bluffScore: bluffScore,
    aggressorZones: aggressorZones, defenderZones: defenderZones,
    planAggressor: planAggressor, planDefender: planDefender,
    adviseAggressor: adviseAggressor, adviseDefender: adviseDefender,
    judge: judge
  };
})(typeof window !== 'undefined' ? window : this);
