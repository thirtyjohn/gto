/* 6-max 100BB 现金局 · 翻前范围数据集
 * 36 个场景。ranges.raise / ranges.call 用范围记法书写，未列出的手牌为弃牌。
 * expect 是入池率的预期区间，构建时超出会报警，用于挡住手滑写错的范围。
 */
(function (global) {
  'use strict';

  var SCENARIOS = [

    /* ==================== Open Raise ==================== */
    {
      id: 'open.utg', group: 'Open Raise', hero: 'UTG', vs: null,
      title: 'UTG 开池', facing: '前面全部弃牌',
      labels: { raise: 'Raise 2.5BB', call: 'Call 1BB' },
      sizing: { raise: 2.5, call: 1 },
      expect: [15, 20],
      ranges: {
        raise: '44+, 33:50, 22:50, A8s+, A7s:25, A6s:25, A5s, A4s, A3s:50, A2s:25, ' +
               'KTs+, K9s:50, QTs+, Q9s:25, JTs, J9s:50, T9s, T8s:25, 98s, 97s:25, ' +
               '87s:75, 76s:50, 65s:50, 54s:25, ' +
               'AJo+, ATo:50, KQo, KJo:50, KTo:25, QJo:25',
        call: ''
      }
    },
    {
      id: 'open.hj', group: 'Open Raise', hero: 'HJ', vs: null,
      title: 'HJ 开池', facing: '前面全部弃牌',
      labels: { raise: 'Raise 2.5BB', call: 'Call 1BB' },
      sizing: { raise: 2.5, call: 1 },
      expect: [20, 25],
      ranges: {
        raise: '22+, A2s+, K8s+, K7s:50, Q9s+, Q8s:50, J9s+, J8s:50, T8s+, T7s:25, ' +
               '97s+, 86s+, 76s, 65s, 54s, ' +
               'ATo+, A9o:25, KJo+, KTo:50, QJo, QTo:25, JTo:25',
        call: ''
      }
    },
    {
      id: 'open.co', group: 'Open Raise', hero: 'CO', vs: null,
      title: 'CO 开池', facing: '前面全部弃牌',
      labels: { raise: 'Raise 2.5BB', call: 'Call 1BB' },
      sizing: { raise: 2.5, call: 1 },
      expect: [26, 32],
      ranges: {
        raise: '22+, A2s+, K6s+, K5s:50, K4s:25, K3s:25, Q8s+, Q7s:50, J8s+, J7s:25, ' +
               'T8s+, T7s:50, 97s+, 96s:25, 86s+, 85s:25, 75s+, 65s, 64s:25, 54s, ' +
               'A8o+, A7o:25, KTo+, K9o:25, QTo+, Q9o:25, JTo, J9o:25, T9o:25',
        call: ''
      }
    },
    {
      id: 'open.btn', group: 'Open Raise', hero: 'BTN', vs: null,
      title: 'BTN 开池', facing: '前面全部弃牌',
      labels: { raise: 'Raise 2.5BB', call: 'Call 1BB' },
      sizing: { raise: 2.5, call: 1 },
      expect: [42, 50],
      ranges: {
        raise: '22+, A2s+, K2s+, Q2s+, J6s+, J5s:50, J4s:25, T6s+, T5s:50, ' +
               '96s+, 95s:25, 85s+, 84s:25, 75s+, 74s:25, 64s+, 54s, 53s:25, ' +
               'A2o+, K8o+, K7o:50, Q9o+, J9o+, T9o, T8o:25, 98o, 87o:25',
        call: ''
      }
    },
    {
      id: 'open.sb', group: 'Open Raise', hero: 'SB', vs: null,
      title: 'SB 开池', facing: '前面全部弃牌，BB 在后',
      labels: { raise: 'Raise 3BB', call: 'Limp 1BB' },
      sizing: { raise: 3, call: 1 },
      expect: [40, 50],
      note: '唯一跛入有正频率的位置，范围表三色',
      ranges: {
        raise: '55+, 44:50, A9s+, A5s, A4s, A3s:50, A2s:50, KTs+, K9s:50, K8s:25, ' +
               'QTs+, JTs, T9s, 98s:50, 87s:50, ' +
               'A9o+, A8o:50, KJo+, KTo:50, QJo, QTo:25, JTo:25',
        call: '33-22, 44:50, A8s-A6s, A3s:50, A2s:50, K9s:50, K8s:75, K7s-K5s, Q9s-Q6s, ' +
              'J9s-J7s, T8s-T6s, 98s:50, 97s-95s, 87s:50, 86s-85s, 76s-75s, 65s, 54s, ' +
              'A8o:50, A7o-A2o, KTo:50, K9o-K7o, QTo:75, Q9o-Q8o, JTo:75, J9o, T9o, 98o'
      }
    },

    /* ==================== vs Limp ==================== */
    {
      id: 'vslimp.bb.vs_sb', group: 'vs Limp', hero: 'BB', vs: 'SB',
      title: 'BB 应对 SB 跛入', facing: 'SB 跛入 1BB',
      labels: { raise: 'Raise 4BB', call: 'Check' },
      sizing: { raise: 4, call: 0 },
      noFold: true, expect: [20, 35],
      note: '免费看翻牌，没有弃牌选项，未加注的手牌全部过牌',
      ranges: {
        raise: '66+, 55:50, A7s+, A5s, A4s, A3s:50, K9s+, K8s:50, Q9s+, Q8s:50, ' +
               'J9s+, T8s+, 97s+, 87s, 76s, 65s:50, ' +
               'A9o+, A8o:50, A5o:25, KTo+, K9o:50, QTo+, JTo, T9o:50',
        call: ''
      }
    },

    /* ==================== 3 Bet ==================== */
    {
      id: '3bet.hj.vs_utg', group: '3 Bet', hero: 'HJ', vs: 'UTG',
      title: 'HJ 面对 UTG 开池', facing: 'UTG 加注 2.5BB',
      labels: { raise: 'Raise 7.5BB', call: 'Call 2.5BB' },
      sizing: { raise: 7.5, call: 2.5 },
      expect: [6, 10],
      ranges: {
        raise: 'TT+, 99:50, AQs+, AJs:25, A5s:50, A4s:25, KQs:25, AKo, AQo:50',
        call: '99:50, 88, 77, AJs:75, ATs:50, KQs:50, KJs:50, QJs:50, JTs:50, AQo:25, KQo:25'
      }
    },
    {
      id: '3bet.co.vs_utg', group: '3 Bet', hero: 'CO', vs: 'UTG',
      title: 'CO 面对 UTG 开池', facing: 'UTG 加注 2.5BB',
      labels: { raise: 'Raise 7.5BB', call: 'Call 2.5BB' },
      sizing: { raise: 7.5, call: 2.5 },
      expect: [7, 12],
      ranges: {
        raise: 'TT+, 99:50, AQs+, AJs:25, A5s:75, A4s:50, KQs:25, AKo, AQo:50',
        call: '99:50, 88, 77, 66:50, AJs:75, ATs:50, KQs:50, KJs:50, QJs:50, JTs:50, ' +
              'T9s:25, AQo:25, AJo:25, KQo:50'
      }
    },
    {
      id: '3bet.co.vs_hj', group: '3 Bet', hero: 'CO', vs: 'HJ',
      title: 'CO 面对 HJ 开池', facing: 'HJ 加注 2.5BB',
      labels: { raise: 'Raise 7.5BB', call: 'Call 2.5BB' },
      sizing: { raise: 7.5, call: 2.5 },
      expect: [9, 15],
      ranges: {
        raise: '99+, 88:50, AQs+, AJs:50, A5s, A4s:50, A3s:25, KQs:50, K5s:25, AKo, AQo:75',
        call: '88:50, 77, 66, 55, AJs:50, ATs, A9s:25, KQs:50, KJs, KTs:50, QJs, QTs:25, ' +
              'JTs, T9s:50, 98s:25, AQo:25, AJo:50, KQo:50'
      }
    },
    {
      id: '3bet.btn.vs_utg', group: '3 Bet', hero: 'BTN', vs: 'UTG',
      title: 'BTN 面对 UTG 开池', facing: 'UTG 加注 2.5BB',
      labels: { raise: 'Raise 7.5BB', call: 'Call 2.5BB' },
      sizing: { raise: 7.5, call: 2.5 },
      expect: [9, 15],
      ranges: {
        raise: 'TT+, 99:50, AQs+, AJs:25, A5s:75, A4s:50, KQs:25, AKo, AQo:50',
        call: '99:50, 88, 77, 66, AJs:75, ATs, A9s:25, KQs:50, KJs, KTs:50, QJs, QTs:25, ' +
              'JTs, T9s, 98s:50, AQo:25, AJo:50, KQo:75'
      }
    },
    {
      id: '3bet.btn.vs_hj', group: '3 Bet', hero: 'BTN', vs: 'HJ',
      title: 'BTN 面对 HJ 开池', facing: 'HJ 加注 2.5BB',
      labels: { raise: 'Raise 7.5BB', call: 'Call 2.5BB' },
      sizing: { raise: 7.5, call: 2.5 },
      expect: [12, 19],
      ranges: {
        raise: '99+, 88:50, AQs+, AJs:50, A5s, A4s:75, A3s:25, KQs:50, K5s:25, AKo, AQo:75',
        call: '88:50, 77, 66, 55, 44, AJs:50, ATs, A9s:50, KQs:50, KJs, KTs, QJs, QTs, ' +
              'JTs, T9s, 98s, 87s:50, AQo:25, AJo, ATo:25, KQo, KJo:25'
      }
    },
    {
      id: '3bet.btn.vs_co', group: '3 Bet', hero: 'BTN', vs: 'CO',
      title: 'BTN 面对 CO 开池', facing: 'CO 加注 2.5BB',
      labels: { raise: 'Raise 7.5BB', call: 'Call 2.5BB' },
      sizing: { raise: 7.5, call: 2.5 },
      expect: [18, 27],
      ranges: {
        raise: '88+, 77:50, ATs+, A5s, A4s, A3s:50, KQs, KJs:50, K5s:50, K4s:25, ' +
               'Q9s:25, JTs:25, AKo, AQo, AJo:50, KQo:25',
        call: '77:50, 66-22, A9s, A8s:50, KJs:50, KTs, K9s:50, K8s:50, QJs, QTs, Q9s:75, ' +
              'JTs:75, J9s, T9s, T8s:50, 98s, 97s:25, 87s, 76s:50, 65s:50, ' +
              'AJo:50, ATo, A9o:25, KQo:75, KJo:50, QJo:50, JTo:25'
      }
    },
    {
      id: '3bet.sb.vs_utg', group: '3 Bet', hero: 'SB', vs: 'UTG',
      title: 'SB 面对 UTG 开池', facing: 'UTG 加注 2.5BB',
      labels: { raise: 'Raise 10BB', call: 'Call 2.5BB' },
      sizing: { raise: 10, call: 2.5 },
      expect: [6, 11],
      note: '无位置，跟注范围窄，主要是 3bet 或弃牌',
      ranges: {
        raise: '99+, 88:50, AQs+, AJs:50, A5s:75, A4s:50, KQs, AKo, AQo:75',
        call: '88:50, 77, 66:50, AJs:50, ATs:50, KJs:50, QJs:25, JTs:25, AJo:25'
      }
    },
    {
      id: '3bet.sb.vs_hj', group: '3 Bet', hero: 'SB', vs: 'HJ',
      title: 'SB 面对 HJ 开池', facing: 'HJ 加注 2.5BB',
      labels: { raise: 'Raise 10BB', call: 'Call 2.5BB' },
      sizing: { raise: 10, call: 2.5 },
      expect: [8, 14],
      ranges: {
        raise: '88+, 77:50, AJs+, A5s, A4s:75, A3s:25, KQs, KJs:50, AKo, AQo, AJo:25',
        call: '77:50, 66, 55:50, ATs:50, KJs:50, QJs:50, JTs:50, AJo:25, KQo:50'
      }
    },
    {
      id: '3bet.sb.vs_co', group: '3 Bet', hero: 'SB', vs: 'CO',
      title: 'SB 面对 CO 开池', facing: 'CO 加注 2.5BB',
      labels: { raise: 'Raise 10BB', call: 'Call 2.5BB' },
      sizing: { raise: 10, call: 2.5 },
      expect: [11, 18],
      ranges: {
        raise: '77+, 66:50, ATs+, A5s, A4s, A3s:50, A2s:25, KTs+, K5s:25, QJs:50, ' +
               'JTs:25, AKo, AQo, AJo:75, KQo:50',
        call: '66:50, 55, 44, A9s:50, QTs:50, JTs:25, T9s:25, AJo:25, KQo:25, KJo:25'
      }
    },
    {
      id: '3bet.sb.vs_btn', group: '3 Bet', hero: 'SB', vs: 'BTN',
      title: 'SB 面对 BTN 开池', facing: 'BTN 加注 2.5BB',
      labels: { raise: 'Raise 10BB', call: 'Call 2.5BB' },
      sizing: { raise: 10, call: 2.5 },
      expect: [18, 28],
      ranges: {
        raise: '55+, 44:50, A8s+, A5s, A4s, A3s, A2s:50, KTs+, K7s:50, K6s:25, ' +
               'QTs+, Q9s:50, JTs, J9s:50, T9s, 98s:50, 87s:50, 76s:25, ' +
               'AKo, AQo, AJo, ATo:75, A9o:25, KQo, KJo:50, QJo:25',
        call: '44:50, 33, 22, A7s:50, A6s:50, A2s:50, K9s:50, K8s:25, Q9s:50, J9s:50, ' +
              'T8s:25, 98s:50, ATo:25, KJo:25, QJo:25, JTo:25'
      }
    },
    {
      id: '3bet.bb.vs_utg', group: '3 Bet', hero: 'BB', vs: 'UTG',
      title: 'BB 面对 UTG 开池', facing: 'UTG 加注 2.5BB',
      labels: { raise: 'Raise 11BB', call: 'Call 1.5BB' },
      sizing: { raise: 11, call: 1.5 },
      expect: [22, 32],
      note: '底池赔率最好，跟注范围最宽',
      ranges: {
        raise: 'TT+, 99:50, AQs+, AJs:25, A5s:75, A4s:50, KQs:25, AKo, AQo:50',
        call: '99:50, 88-22, AJs:75, ATs, A9s, A8s, A7s, A6s, A5s:25, A3s, A2s, ' +
              'KQs:75, KJs, KTs, K9s, QJs, QTs, Q9s, Q8s:50, JTs, J9s, J8s:50, ' +
              'T9s, T8s, T7s:50, 98s, 97s, 96s:50, 87s, 86s:50, 76s, 75s:50, ' +
              '65s, 64s:50, 54s, 53s:50, ' +
              'AQo:50, AJo, ATo, KQo, KJo, KTo:50, QJo:50, QTo:25, JTo:50'
      }
    },
    {
      id: '3bet.bb.vs_hj', group: '3 Bet', hero: 'BB', vs: 'HJ',
      title: 'BB 面对 HJ 开池', facing: 'HJ 加注 2.5BB',
      labels: { raise: 'Raise 11BB', call: 'Call 1.5BB' },
      sizing: { raise: 11, call: 1.5 },
      expect: [28, 40],
      ranges: {
        raise: '99+, 88:50, AQs+, AJs:50, A5s, A4s:75, A3s:25, KQs:50, K5s:25, AKo, AQo:75',
        call: '88:50, 77-22, AJs:50, ATs, A9s, A8s, A7s, A6s, A3s:75, A2s, KQs:50, ' +
              'KJs, KTs, K9s, K8s, K7s:50, QJs, QTs, Q9s, Q8s, Q7s:50, JTs, J9s, J8s, ' +
              'J7s:50, T9s, T8s, T7s:50, 98s, 97s, 96s, 95s:50, 87s, 86s, 85s:50, ' +
              '76s, 75s, 74s:50, 65s, 64s:50, 54s, 53s:50, ' +
              'AQo:25, AJo, ATo, A9o, KQo, KJo, KTo, K9o:50, QJo, QTo, Q9o:25, ' +
              'JTo, J9o:25, T9o:50'
      }
    },
    {
      id: '3bet.bb.vs_co', group: '3 Bet', hero: 'BB', vs: 'CO',
      title: 'BB 面对 CO 开池', facing: 'CO 加注 2.5BB',
      labels: { raise: 'Raise 11BB', call: 'Call 1.5BB' },
      sizing: { raise: 11, call: 1.5 },
      expect: [36, 50],
      ranges: {
        raise: '88+, 77:50, AJs+, A5s, A4s, A3s:50, KQs, KJs:50, K5s:50, K4s:25, ' +
               'Q9s:25, J9s:25, AKo, AQo, AJo:50, KQo:25',
        call: '77:50, 66-22, ATs, A9s, A8s, A7s, A6s, A3s:50, A2s, KJs:50, KTs, K9s, ' +
              'K8s, K7s:50, K6s:50, K5s:50, K4s:50, K3s:50, K2s:50, QJs, QTs, Q9s:75, ' +
              'Q8s, Q7s:50, Q6s:50, Q5s:50, JTs, J9s:75, J8s, J7s:50, J6s:50, ' +
              'T9s, T8s, T7s:50, T6s:50, 98s, 97s, 96s:50, 95s:50, 87s, 86s, 85s:50, ' +
              '76s, 75s, 74s:50, 65s, 64s:50, 63s:50, 54s, 53s:50, 43s:50, ' +
              'AJo:50, ATo, A9o, A8o, A7o:50, A6o:50, A5o, A4o, A3o:50, A2o:50, ' +
              'KQo:75, KJo, KTo, K9o:50, K8o, K7o:50, QJo, QTo, Q9o:50, Q8o:50, ' +
              'JTo, J9o:50, J8o:50, T9o, T8o:50, 98o:25, 97o:25, 87o:25'
      }
    },
    {
      id: '3bet.bb.vs_btn', group: '3 Bet', hero: 'BB', vs: 'BTN',
      title: 'BB 面对 BTN 开池', facing: 'BTN 加注 2.5BB',
      labels: { raise: 'Raise 11BB', call: 'Call 1.5BB' },
      sizing: { raise: 11, call: 1.5 },
      expect: [48, 62],
      ranges: {
        raise: '66+, 55:50, A9s+, A5s, A4s, A3s, A2s:50, KTs+, K9s:50, K5s:50, K4s:25, ' +
               'QTs+, Q9s:50, JTs, J9s:50, T9s, 98s, 87s:50, 76s:50, ' +
               'AJo+, ATo:75, A9o:25, KQo, KJo:75, QJo:50, JTo:25',
        call: '55:50, 44-22, A8s, A7s, A6s, A2s:50, K9s:50, K8s, K7s, K6s, K5s:50, ' +
              'K3s, K2s, Q9s:50, Q8s, Q7s, Q6s, Q5s, Q4s:50, Q3s, Q2s, ' +
              'J9s:50, J8s, J7s, J6s:50, J5s, J4s:50, ' +
              'T8s, T7s, T6s:50, T5s:50, 97s, 96s, 95s:50, 94s:50, ' +
              '87s:50, 86s, 85s:50, 84s:50, 76s:50, 75s, 74s:50, 73s:50, ' +
              '65s, 64s, 63s:50, 54s, 53s, 52s:50, 43s:50, 42s:50, 32s:50, ' +
              'ATo:25, A9o:75, A8o, A7o, A6o, A5o, A4o, A3o:50, A2o:50, ' +
              'KJo:25, KTo, K9o, K8o:50, K7o:50, K6o:50, K5o:50, ' +
              'QJo:50, QTo, Q9o, Q8o:50, Q7o:50, JTo:75, J9o, J8o:50, J7o:50, ' +
              'T9o, T8o:50, T7o:50, 98o, 97o:50, 96o:50, 87o, 86o:50, ' +
              '76o:50, 75o:50, 65o:50, 64o:50, 54o:50'
      }
    },
    {
      id: '3bet.bb.vs_sb', group: '3 Bet', hero: 'BB', vs: 'SB',
      title: 'BB 面对 SB 开池', facing: 'SB 加注 3BB',
      labels: { raise: 'Raise 12BB', call: 'Call 2BB' },
      sizing: { raise: 12, call: 2 },
      expect: [55, 72],
      note: '单挑局面，防守频率最高',
      ranges: {
        raise: '44+, 33:50, A2s+, K8s+, K7s:50, Q9s+, Q8s:50, J9s+, T9s, 98s, 87s, ' +
               '76s:50, A7o+, A6o:50, A5o:50, KTo+, K9o:50, QJo, QTo:50, JTo:50',
        call: '33:50, 22, K7s:50, K6s-K2s, Q8s:50, Q7s-Q2s, J8s-J2s, T8s-T2s, ' +
              '97s-92s, 86s-82s, 76s:50, 75s-72s, 65s-62s, 54s-52s, 43s-42s, 32s, ' +
              'A6o:50, A5o:50, A4o-A2o, K9o:50, K8o-K2o, QTo:50, Q9o-Q6o, ' +
              'JTo:50, J9o-J7o, T9o-T7o, 98o-96o, 87o-86o, 76o, 65o, 54o'
      }
    },

    /* ==================== 4 Bet ==================== */
    {
      id: '4bet.utg.vs_hj', group: '4 Bet', hero: 'UTG', vs: 'HJ',
      title: 'UTG 被 HJ 3bet', facing: 'HJ 再加注到 7.5BB',
      labels: { raise: 'Raise 17BB', call: 'Call 5BB' },
      sizing: { raise: 17, call: 5 },
      expect: [3, 7],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo:75, A5s:50, A4s:25',
        call: 'JJ:50, TT, 99:50, AQs, AJs:50, KQs:50, AKo:25'
      }
    },
    {
      id: '4bet.utg.vs_co', group: '4 Bet', hero: 'UTG', vs: 'CO',
      title: 'UTG 被 CO 3bet', facing: 'CO 再加注到 7.5BB',
      labels: { raise: 'Raise 17BB', call: 'Call 5BB' },
      sizing: { raise: 17, call: 5 },
      expect: [4, 8],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo:75, A5s:50, A4s:50, A3s:25',
        call: 'JJ:50, TT, 99, AQs, AJs:50, ATs:25, KQs:50, KJs:25, AQo:25'
      }
    },
    {
      id: '4bet.utg.vs_btn', group: '4 Bet', hero: 'UTG', vs: 'BTN',
      title: 'UTG 被 BTN 3bet', facing: 'BTN 再加注到 7.5BB',
      labels: { raise: 'Raise 17BB', call: 'Call 5BB' },
      sizing: { raise: 17, call: 5 },
      expect: [5, 10],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo, A5s:75, A4s:50, A3s:25, KQs:25',
        call: 'JJ:50, TT, 99, 88:50, AQs, AJs, ATs:50, KQs:50, KJs:50, QJs:25, JTs:25, AQo:50'
      }
    },
    {
      id: '4bet.utg.vs_sb', group: '4 Bet', hero: 'UTG', vs: 'SB',
      title: 'UTG 被 SB 3bet', facing: 'SB 再加注到 10BB',
      labels: { raise: 'Raise 22BB', call: 'Call 7.5BB' },
      sizing: { raise: 22, call: 7.5 },
      expect: [4, 9],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo, A5s:75, A4s:50, KQs:25',
        call: 'JJ:50, TT, 99, 88:50, AQs, AJs, ATs:50, KQs:50, KJs:50, QJs:25, AQo:50'
      }
    },
    {
      id: '4bet.utg.vs_bb', group: '4 Bet', hero: 'UTG', vs: 'BB',
      title: 'UTG 被 BB 3bet', facing: 'BB 再加注到 11BB',
      labels: { raise: 'Raise 24BB', call: 'Call 8.5BB' },
      sizing: { raise: 24, call: 8.5 },
      expect: [5, 11],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo, A5s, A4s:50, A3s:25, KQs:25',
        call: 'JJ:50, TT, 99, 88, 77:50, AQs, AJs, ATs, KQs:50, KJs:50, QJs:50, ' +
              'JTs:50, T9s:25, AQo:50, AJo:25'
      }
    },
    {
      id: '4bet.hj.vs_co', group: '4 Bet', hero: 'HJ', vs: 'CO',
      title: 'HJ 被 CO 3bet', facing: 'CO 再加注到 7.5BB',
      labels: { raise: 'Raise 17BB', call: 'Call 5BB' },
      sizing: { raise: 17, call: 5 },
      expect: [4, 9],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo:75, A5s:50, A4s:50',
        call: 'JJ:50, TT, 99, AQs, AJs:50, KQs:50, KJs:25, AKo:25, AQo:25'
      }
    },
    {
      id: '4bet.hj.vs_btn', group: '4 Bet', hero: 'HJ', vs: 'BTN',
      title: 'HJ 被 BTN 3bet', facing: 'BTN 再加注到 7.5BB',
      labels: { raise: 'Raise 17BB', call: 'Call 5BB' },
      sizing: { raise: 17, call: 5 },
      expect: [5, 11],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo, A5s:75, A4s:50, A3s:25, KQs:25',
        call: 'JJ:50, TT, 99, 88:50, AQs, AJs, ATs:50, KQs:50, KJs:50, QJs:25, JTs:25, AQo:50'
      }
    },
    {
      id: '4bet.hj.vs_sb', group: '4 Bet', hero: 'HJ', vs: 'SB',
      title: 'HJ 被 SB 3bet', facing: 'SB 再加注到 10BB',
      labels: { raise: 'Raise 22BB', call: 'Call 7.5BB' },
      sizing: { raise: 22, call: 7.5 },
      expect: [4, 10],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo, A5s:75, A4s:50, KQs:25',
        call: 'JJ:50, TT, 99, 88:50, AQs, AJs, ATs:50, KQs:50, KJs:50, QJs:25, AQo:50'
      }
    },
    {
      id: '4bet.hj.vs_bb', group: '4 Bet', hero: 'HJ', vs: 'BB',
      title: 'HJ 被 BB 3bet', facing: 'BB 再加注到 11BB',
      labels: { raise: 'Raise 24BB', call: 'Call 8.5BB' },
      sizing: { raise: 24, call: 8.5 },
      expect: [6, 13],
      ranges: {
        raise: 'QQ+, JJ:50, AKs, AKo, A5s, A4s:75, A3s:25, KQs:25, K5s:25',
        call: 'JJ:50, TT, 99, 88, 77:50, AQs, AJs, ATs, A9s:25, KQs:50, KJs, ' +
              'QJs:50, JTs:50, T9s:25, AQo:50, AJo:25'
      }
    },
    {
      id: '4bet.co.vs_btn', group: '4 Bet', hero: 'CO', vs: 'BTN',
      title: 'CO 被 BTN 3bet', facing: 'BTN 再加注到 7.5BB',
      labels: { raise: 'Raise 17BB', call: 'Call 5BB' },
      sizing: { raise: 17, call: 5 },
      expect: [7, 14],
      ranges: {
        raise: 'QQ+, JJ:75, TT:25, AKs, AKo, A5s, A4s:50, A3s:25, KQs:25, K5s:25',
        call: 'JJ:25, TT:50, 99, 88, 77:50, AQs, AJs, ATs, KQs:50, KJs, KTs:50, ' +
              'QJs, JTs:50, T9s:25, AQo:50, AJo:25'
      }
    },
    {
      id: '4bet.co.vs_sb', group: '4 Bet', hero: 'CO', vs: 'SB',
      title: 'CO 被 SB 3bet', facing: 'SB 再加注到 10BB',
      labels: { raise: 'Raise 22BB', call: 'Call 7.5BB' },
      sizing: { raise: 22, call: 7.5 },
      expect: [6, 13],
      ranges: {
        raise: 'QQ+, JJ:75, AKs, AKo, A5s, A4s:50, A3s:25, KQs:25',
        call: 'JJ:25, TT, 99, 88, 77:50, AQs, AJs, ATs, KQs:50, KJs, KTs:25, ' +
              'QJs:50, JTs:50, AQo:50, AJo:25'
      }
    },
    {
      id: '4bet.co.vs_bb', group: '4 Bet', hero: 'CO', vs: 'BB',
      title: 'CO 被 BB 3bet', facing: 'BB 再加注到 11BB',
      labels: { raise: 'Raise 24BB', call: 'Call 8.5BB' },
      sizing: { raise: 24, call: 8.5 },
      expect: [8, 16],
      ranges: {
        raise: 'QQ+, JJ:75, TT:25, AKs, AKo, A5s, A4s, A3s:50, KQs:50, K5s:50, K4s:25',
        call: 'JJ:25, TT:50, 99, 88, 77, 66:50, AQs, AJs, ATs, A9s:50, KQs:50, KJs, ' +
              'KTs, QJs, QTs:50, JTs, T9s:50, 98s:25, AQo, AJo:50, KQo:25'
      }
    },
    {
      id: '4bet.btn.vs_sb', group: '4 Bet', hero: 'BTN', vs: 'SB',
      title: 'BTN 被 SB 3bet', facing: 'SB 再加注到 10BB',
      labels: { raise: 'Raise 22BB', call: 'Call 7.5BB' },
      sizing: { raise: 22, call: 7.5 },
      expect: [9, 17],
      ranges: {
        raise: 'QQ+, JJ:75, AKs, AKo, A5s, A4s:75, A3s:50, KQs:25, K5s:50',
        call: 'JJ:25, TT, 99, 88, 77, 66:50, AQs, AJs, ATs, A9s:50, KQs:50, KJs, KTs, ' +
              'QJs, QTs:50, JTs, T9s:50, AQo, AJo:50, KQo:50'
      }
    },
    {
      id: '4bet.btn.vs_bb', group: '4 Bet', hero: 'BTN', vs: 'BB',
      title: 'BTN 被 BB 3bet', facing: 'BB 再加注到 11BB',
      labels: { raise: 'Raise 24BB', call: 'Call 8.5BB' },
      sizing: { raise: 24, call: 8.5 },
      expect: [14, 24],
      note: '开池最宽，被 3bet 后的跟注范围也最宽',
      ranges: {
        raise: 'QQ+, JJ:75, TT:25, AKs, AKo, A5s, A4s, A3s:50, A2s:25, KQs:25, K5s:50, K4s:25',
        call: 'JJ:25, TT:50, 99-22, AQs, AJs, ATs, A9s, A8s:50, KQs:75, KJs, KTs, ' +
              'K9s:50, QJs, QTs, Q9s:25, JTs, J9s:50, T9s, 98s, 87s:50, 76s:25, ' +
              'AQo, AJo:75, ATo:25, KQo, KJo:50'
      }
    },
    {
      id: '4bet.sb.vs_bb', group: '4 Bet', hero: 'SB', vs: 'BB',
      title: 'SB 被 BB 3bet', facing: 'BB 再加注到 12BB',
      labels: { raise: 'Raise 26BB', call: 'Call 9BB' },
      sizing: { raise: 26, call: 9 },
      expect: [7, 14],
      note: 'SB 开池范围本身只有 19.6%，8.7% 的绝对防守量已经是开池范围的 44%',
      ranges: {
        raise: 'JJ+, TT:50, AQs+, AKo, AQo:50, A5s, A4s:75, A3s:25, KQs:50',
        call: 'TT:50, 99, 88, 77:50, AJs, ATs, A9s:25, KQs:50, KJs, KTs:50, QJs, ' +
              'QTs:25, JTs:50, T9s:25, AQo:50, AJo:25'
      }
    }
  ];

  global.SCENARIOS = SCENARIOS;
})(typeof window !== 'undefined' ? window : this);
