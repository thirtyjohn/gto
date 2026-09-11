/* 牌桌渲染与自适应。调用方给出座位状态，这里只管画和量。
 * 翻前与翻后共用：翻后多传一个 board 数组即可。
 */
(function (global) {
  'use strict';

  var el = UI.el, num = UI.num;

  var ORDER = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  var SUITS = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED = { h: 1, d: 1 };

  // 座位坐标：slot 0 是英雄，逆时针依次是后面行动的位置。
  // x/y 是座位中心，bx/by 是下注筹码，都是牌桌的百分比。
  // dside 是按钮位标记贴在座位的哪一侧，它是座位的子元素，跟着座位走，不会因缩放而错位。
  var SLOTS = [
    { x: 50, y: 89, bx: 50, by: 62, dside: 'l' },
    { x: 20, y: 60, bx: 34, by: 50, dside: 'r' },
    { x: 20, y: 33, bx: 34, by: 43, dside: 'r' },
    { x: 50, y: 10, bx: 50, by: 18, dside: 'l' },
    { x: 80, y: 33, bx: 66, by: 43, dside: 'l' },
    { x: 80, y: 60, bx: 66, by: 50, dside: 'l' }
  ];

  function cardNode(c, cls) {
    var n = el('div', cls + (RED[c[1]] ? ' red' : ''));
    n.appendChild(el('div', 'r', c[0]));
    n.appendChild(el('div', 's', SUITS[c[1]]));
    return n;
  }

  // 把 "A5s" 这样的等价类展开成两张带花色的具体牌
  function dealCards(key) {
    var r1 = key[0], r2 = key[1], type = key[2];
    var s = UI.shuffled(['s', 'h', 'd', 'c']);
    if (!type) return [r1 + s[0], r2 + s[1]];
    if (type === 's') return [r1 + s[0], r2 + s[0]];
    return [r1 + s[0], r2 + s[1]];
  }

  // 牌桌尺寸由 JS 量算：填满可用区域，但不允许比宽度的 1.67 倍更高。
  // --u 是牌桌宽度的百分之一，桌上所有元素都按它缩放。
  function fit(felt, retried) {
    var box = felt.parentNode;
    if (!box) return;
    var cs = window.getComputedStyle(box);
    var W = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var H = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (W <= 0 || H <= 0) {
      // 容器还没拿到尺寸（比如所在页面刚切换过来），下一帧再量一次
      if (!retried) requestAnimationFrame(function () { fit(felt, true); });
      return;
    }
    var w = Math.min(W, 560);
    var h = Math.min(H, w / 0.6);
    felt.style.width = Math.round(w) + 'px';
    felt.style.height = Math.round(h) + 'px';
    // 元素尺寸取宽高里更紧的那一维，桌子被压扁时元素跟着缩，不会互相压到
    felt.style.setProperty('--u', (Math.min(w, h * 0.68) / 100) + 'px');
  }

  // 横竖屏切换、窗口变化、Safari 地址栏收起都要重新量
  function watch(getFelt) {
    var refit = function () {
      var f = getFelt();
      if (f) fit(f);
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
  }

  /* state = {
   *   seats: [{ pos, folded, bet, hero }]  按 ORDER 顺序
   *   heroPos: 'UTG'
   *   pot: 1.5
   *   hole: ['Ac', '5d']
   *   board: ['Kh','7d','2c']   翻后用，可省略
   * } */
  function render(state) {
    var felt = el('div', 'felt');
    var idx = {};
    ORDER.forEach(function (p, i) { idx[p] = i; });
    var heroIdx = idx[state.heroPos];

    var pot = el('div', 'pot');
    pot.appendChild(el('small', null, 'Total Pot'));
    pot.appendChild(el('span', null, num(state.pot) + ' BB'));
    felt.appendChild(pot);

    if (state.board && state.board.length) {
      var board = el('div', 'board');
      state.board.forEach(function (c) { board.appendChild(cardNode(c, 'bcard')); });
      felt.appendChild(board);
    }

    for (var slot = 0; slot < 6; slot++) {
      var pos = ORDER[(heroIdx + slot) % 6];
      var seat = state.seats[idx[pos]];
      var S = SLOTS[slot];

      // hidden 的位置整个不画。翻前用变暗表示"刚刚弃牌"，翻后只剩两人，
      // 再画四个暗圈就只是干扰。
      if (seat.hidden) continue;

      var node = el('div', 'seat' + (seat.folded ? ' folded' : '') + (seat.hero ? ' hero' : ''));
      node.style.left = S.x + '%';
      node.style.top = S.y + '%';
      node.appendChild(el('div', 'badge', pos));
      // 已弃牌的人剩多少筹码与决策无关，只留一个变暗的位置圆圈，桌面才干净
      if (!seat.folded) node.appendChild(el('div', 'stack', num(100 - seat.bet) + ' BB'));
      if (pos === 'BTN') node.appendChild(el('div', 'dealer ' + S.dside, 'D'));
      felt.appendChild(node);

      if (seat.bet > 0 && !seat.folded) {
        var bet = el('div', 'bet');
        bet.style.left = S.bx + '%';
        bet.style.top = S.by + '%';
        bet.appendChild(el('b'));
        bet.appendChild(el('span', null, num(seat.bet) + ' BB'));
        felt.appendChild(bet);
      }
    }

    var hole = el('div', 'hole');
    state.hole.forEach(function (c) { hole.appendChild(cardNode(c, 'pcard')); });
    felt.appendChild(hole);

    return felt;
  }

  global.Table = {
    ORDER: ORDER, SUITS: SUITS, RED: RED, SLOTS: SLOTS,
    cardNode: cardNode, dealCards: dealCards,
    fit: fit, watch: watch, render: render
  };
})(typeof window !== 'undefined' ? window : this);
