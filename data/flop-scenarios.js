/* 翻牌圈八个训练场景。
 *
 * 双方范围全部来自翻前那份 data/ranges.js，没有新造任何范围：
 *   heroRange / oppRange 指向某个翻前场景 id 与其中的某个动作。
 *
 * 底池与筹码按翻前尺度推出，写死在这里便于核对：
 *   单加注池：开池 2.5 + 跟注 2.5 + 死掉的小盲 0.5 = 5.5 BB，双方各剩 97.5
 *   3bet 池：3bet 到 11 + 跟注 11 + 死掉的小盲 0.5 = 22.5 BB，双方各剩 89
 */
(function (global) {
  'use strict';

  var SRP = { pot: 5.5, stack: 97.5, small: 0.33, big: 0.75 };
  var TBP = { pot: 22.5, stack: 89, small: 0.33, big: 0.75 };

  function agg(id, group, hero, opp, heroR, heroA, oppR, oppA, cfg, line) {
    return {
      id: id, group: group, role: 'aggressor', hero: hero, opp: opp,
      pos: hero === 'BB' ? '无位置' : '有位置', line: line,
      pot: cfg.pot, stack: cfg.stack, sizes: { small: cfg.small, big: cfg.big },
      heroRange: { id: heroR, action: heroA },
      oppRange: { id: oppR, action: oppA },
      actions: ['bet33', 'bet75', 'check']
    };
  }
  function def(id, group, hero, opp, heroR, heroA, oppR, oppA, cfg, line) {
    return {
      id: id, group: group, role: 'defender', hero: hero, opp: opp,
      pos: hero === 'BB' ? '无位置' : '有位置', line: line,
      pot: cfg.pot, stack: cfg.stack,
      facing: cfg.small,                    // v1 只训练面对 33% 底池的下注
      raiseMult: 3,                         // 加注到对手下注额的三倍
      heroRange: { id: heroR, action: heroA },
      oppRange: { id: oppR, action: oppA },
      actions: ['fold', 'call', 'raise']
    };
  }

  var SCEN = [
    agg('srp.btn.agg', '单加注池', 'BTN', 'BB',
      'open.btn', 'raise', '3bet.bb.vs_btn', 'call', SRP,
      '你在 BTN 开池 2.5BB，BB 跟注'),
    def('srp.bb.def.btn', '单加注池', 'BB', 'BTN',
      '3bet.bb.vs_btn', 'call', 'open.btn', 'raise', SRP,
      'BTN 开池 2.5BB，你在 BB 跟注'),

    agg('srp.co.agg', '单加注池', 'CO', 'BB',
      'open.co', 'raise', '3bet.bb.vs_co', 'call', SRP,
      '你在 CO 开池 2.5BB，BB 跟注'),
    def('srp.bb.def.co', '单加注池', 'BB', 'CO',
      '3bet.bb.vs_co', 'call', 'open.co', 'raise', SRP,
      'CO 开池 2.5BB，你在 BB 跟注'),

    agg('srp.utg.agg', '单加注池', 'UTG', 'BB',
      'open.utg', 'raise', '3bet.bb.vs_utg', 'call', SRP,
      '你在 UTG 开池 2.5BB，BB 跟注'),
    def('srp.bb.def.utg', '单加注池', 'BB', 'UTG',
      '3bet.bb.vs_utg', 'call', 'open.utg', 'raise', SRP,
      'UTG 开池 2.5BB，你在 BB 跟注'),

    agg('3bp.bb.agg', '3Bet 池', 'BB', 'BTN',
      '3bet.bb.vs_btn', 'raise', '4bet.btn.vs_bb', 'call', TBP,
      '你在 BB 3bet 到 11BB，BTN 跟注'),
    def('3bp.btn.def', '3Bet 池', 'BTN', 'BB',
      '4bet.btn.vs_bb', 'call', '3bet.bb.vs_btn', 'raise', TBP,
      'BB 3bet 到 11BB，你在 BTN 跟注')
  ];

  /* 对手范围预设。默认 GTO 就是翻前那份数据本身；
   * 其余三档用范围记法另写，与翻前范围同一套写法，可在分析模式里改。 */
  var PRESETS = {
    'GTO': null,
    '紧': {
      label: '只玩强牌，跟注范围窄',
      ranges: {
        '3bet.bb.vs_btn': '77+, A9s+, KTs+, QTs+, JTs, T9s, AQo+, KQo',
        '3bet.bb.vs_co': '77+, A9s+, KTs+, QTs+, JTs, AQo+, KQo',
        '3bet.bb.vs_utg': '88+, ATs+, KJs+, QJs, AQo+',
        'open.btn': '55+, A8s+, KTs+, QTs+, JTs, T9s, ATo+, KQo',
        'open.co': '66+, A9s+, KTs+, QTs+, JTs, AJo+, KQo',
        'open.utg': '88+, ATs+, KJs+, QJs, AQo+',
        '4bet.btn.vs_bb': 'TT+, AQs+, KQs, AKo'
      }
    },
    '松': {
      label: '什么都跟，范围很宽',
      ranges: {
        '3bet.bb.vs_btn': '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, ' +
                          'A2o+, K7o+, Q8o+, J8o+, T8o+, 98o, 87o, 76o',
        '3bet.bb.vs_co': '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, ' +
                         'A2o+, K8o+, Q9o+, J9o+, T9o, 98o',
        '3bet.bb.vs_utg': '22+, A2s+, K5s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, ' +
                          'A5o+, K9o+, QTo+, JTo',
        'open.btn': '22+, A2s+, K2s+, Q2s+, J2s+, T4s+, 94s+, 84s+, 74s+, 63s+, 53s+, 43s, ' +
                    'A2o+, K5o+, Q7o+, J7o+, T7o+, 97o+, 87o, 76o, 65o',
        'open.co': '22+, A2s+, K4s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, ' +
                   'A4o+, K8o+, Q9o+, J9o+, T9o, 98o',
        'open.utg': '22+, A2s+, K8s+, Q9s+, J9s+, T9s, 98s, 87s, A9o+, KTo+, QJo',
        '4bet.btn.vs_bb': '55+, A8s+, KTs+, QTs+, JTs, T9s, ATo+, KQo'
      }
    },
    '站街鱼': {
      label: '任意两张都跟，几乎不弃牌',
      ranges: {
        '3bet.bb.vs_btn': '22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, ' +
                          'A2o+, K2o+, Q4o+, J6o+, T6o+, 96o+, 86o+, 75o+, 65o, 54o',
        '3bet.bb.vs_co': '22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, ' +
                         'A2o+, K2o+, Q5o+, J7o+, T7o+, 97o+, 87o, 76o, 65o',
        '3bet.bb.vs_utg': '22+, A2s+, K2s+, Q3s+, J5s+, T6s+, 95s+, 85s+, 75s+, 64s+, 54s, ' +
                          'A2o+, K5o+, Q8o+, J8o+, T8o+, 98o, 87o',
        'open.btn': '22+, A2s+, K2s+, Q2s+, J2s+, T2s+, 92s+, 82s+, 72s+, 62s+, 52s+, 42s+, 32s, ' +
                    'A2o+, K2o+, Q2o+, J4o+, T5o+, 95o+, 85o+, 75o+, 64o+, 54o',
        'open.co': '22+, A2s+, K2s+, Q2s+, J3s+, T5s+, 95s+, 85s+, 74s+, 64s+, 53s+, ' +
                   'A2o+, K4o+, Q6o+, J7o+, T7o+, 97o+, 87o, 76o',
        'open.utg': '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A7o+, K9o+, QTo+, JTo',
        '4bet.btn.vs_bb': '22+, A2s+, K9s+, QTs+, JTs, T9s, A9o+, KJo+'
      }
    }
  };

  global.FLOP_SCENARIOS = SCEN;
  global.OPP_PRESETS = PRESETS;
})(typeof window !== 'undefined' ? window : this);
