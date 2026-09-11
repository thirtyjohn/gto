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

  /* ---------------- 主入口 ---------------- */
  /* 进攻方。传入分位、牌面分类、两档尺度，返回分区判定与三个动作的建议权重。
   * 建议权重不是"频率"，是这手牌该怎么打的表达：落在价值区就该下注。 */
  function adviseAggressor(pct, board, sizes, opts) {
    var z = aggressorZones(sizes.small, sizes.big, opts);
    var big = bigShare(board.structure, board.suit);
    var zone, why;

    if (pct >= z.valueFrom) {
      zone = 'value';
      why = '这手牌排在你范围的顶部，下注取价值';
    } else if (pct <= z.bluffTo) {
      zone = 'bluff';
      why = '这手牌排在你范围的底部，没有摊牌价值，正是该诈唬的位置';
    } else {
      zone = 'check';
      why = '这手牌不上不下，下注会被更好的跟、更差的弃，过牌保住摊牌价值';
    }

    var w;
    if (zone === 'check') w = { bet33: 0, bet75: 0, check: 100 };
    else w = { bet33: Math.round(100 - big), bet75: Math.round(big), check: 0 };

    return {
      zone: zone, zones: z, why: why, weights: w,
      near: nearBoundary(pct, [z.bluffTo, z.valueFrom], opts)
    };
  }

  /* 防守方。facing 是所面对的下注占底池的比例。 */
  function adviseDefender(pct, facingFrac, opts) {
    var z = defenderZones(facingFrac, opts);
    var zone, why;

    if (pct <= z.foldTo) {
      zone = 'fold';
      why = '这手牌排在你范围的底部，赔率不够，弃牌';
    } else if (pct >= z.raiseFrom) {
      zone = 'raise';
      why = '这手牌排在你范围的顶部，加注取价值';
    } else {
      zone = 'call';
      why = '够格继续但不够格加注，跟注保住摊牌价值';
    }

    var w = zone === 'fold' ? { fold: 100, call: 0, raise: 0 }
      : zone === 'raise' ? { fold: 0, call: 0, raise: 100 }
      : { fold: 0, call: 100, raise: 0 };

    return {
      zone: zone, zones: z, why: why, weights: w,
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
    var actionZone = role === 'defender' ? chosen
      : (chosen === 'check' ? 'check' : (advice.zone === 'value' ? 'value' : 'bluff'));

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
    aggressorZones: aggressorZones, defenderZones: defenderZones,
    adviseAggressor: adviseAggressor, adviseDefender: adviseDefender,
    judge: judge
  };
})(typeof window !== 'undefined' ? window : this);
