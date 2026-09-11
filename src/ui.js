/* 通用界面与存储原语，翻前与翻后两个应用共用。 */
(function (global) {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function shuffled(a) {
    var c = a.slice();
    for (var i = c.length - 1; i > 0; i--) {
      var j = rand(i + 1); var t = c[i]; c[i] = c[j]; c[j] = t;
    }
    return c;
  }
  function num(x) { return (Math.round(x * 10) / 10).toString(); }

  // 自建确认框：Artifact 的 iframe 沙箱会拦掉 window.confirm
  function ask(msg, onYes) {
    var over = el('div', 'modal');
    var box = el('div', 'modalbox');
    box.appendChild(el('p', null, msg));
    var row = el('div', 'modalrow');
    var no = el('button', 'mbtn', '取消');
    var yes = el('button', 'mbtn danger', '确定');
    var close = function () { if (over.parentNode) document.body.removeChild(over); };
    no.onclick = close;
    yes.onclick = function () { close(); onYes(); };
    over.onclick = function (e) { if (e.target === over) close(); };
    row.appendChild(no); row.appendChild(yes);
    box.appendChild(row); over.appendChild(box);
    document.body.appendChild(over);
  }

  // 个人错误热力图的着色：练过的格子按错误率，没练过的留空
  function heatFill(rec) {
    if (!rec || !rec.n) return '#243347';
    var err = 1 - rec.correct / rec.n;
    if (err <= 0) return 'rgba(47,168,119,.5)';
    return 'rgba(229,83,61,' + (0.3 + err * 0.6).toFixed(2) + ')';
  }

  /* 本机存储：统计、错题本、设置。两个应用各用各的 key。 */
  function createStore(key, blankFn) {
    var data = read();

    function read() {
      try {
        var raw = JSON.parse(localStorage.getItem(key));
        if (!raw || !raw.settings) return blankFn();
        var b = blankFn();
        raw.stats = raw.stats || {};
        raw.mistakes = raw.mistakes || [];
        for (var k in b.settings) if (raw.settings[k] == null) raw.settings[k] = b.settings[k];
        return raw;
      } catch (e) { return blankFn(); }
    }

    function findMistake(id, hand) {
      for (var i = 0; i < data.mistakes.length; i++) {
        var m = data.mistakes[i];
        if (m.id === id && m.key === hand) return i;
      }
      return -1;
    }

    var api = {
      get data() { return data; },
      save: function () {
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
      },
      reset: function () { data = blankFn(); api.save(); },
      statOf: function (id) {
        if (!data.stats[id]) data.stats[id] = { hands: 0, correct: 0, wrong: 0, byHand: {} };
        return data.stats[id];
      },
      aggregate: function (ids) {
        var t = { hands: 0, correct: 0, wrong: 0 };
        ids.forEach(function (id) {
          var s = data.stats[id];
          if (!s) return;
          t.hands += s.hands; t.correct += s.correct; t.wrong += s.wrong;
        });
        return t;
      },
      // 同一手牌只留一条，答错重新计数，连续答对两次移出
      noteMistake: function (id, hand, chose) {
        var i = findMistake(id, hand);
        if (i >= 0) {
          data.mistakes[i].cleared = 0;
          data.mistakes[i].chose = chose;
          data.mistakes[i].ts = Date.now();
          return;
        }
        data.mistakes.push({ id: id, key: hand, chose: chose, ts: Date.now(), cleared: 0 });
        if (data.mistakes.length > 300) data.mistakes.shift();
      },
      clearMistake: function (id, hand) {
        var i = findMistake(id, hand);
        if (i < 0) return;
        data.mistakes[i].cleared = (data.mistakes[i].cleared || 0) + 1;
        if (data.mistakes[i].cleared >= 2) data.mistakes.splice(i, 1);
      },
      mistakesFor: function (ids, valid) {
        return data.mistakes.filter(function (m) {
          return ids.indexOf(m.id) >= 0 && (!valid || valid(m.id));
        });
      }
    };
    return api;
  }

  global.UI = {
    el: el, clear: clear, rand: rand, shuffled: shuffled, num: num,
    ask: ask, heatFill: heatFill, createStore: createStore
  };
})(typeof window !== 'undefined' ? window : this);
