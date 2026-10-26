  <script>
  /* =====================================================================
     行情交易终端 · 应用逻辑（独立作用域，不与博客脚本冲突）
     ===================================================================== */
  (function () {
    'use strict';

    /* ---------------- 常量 ---------------- */
    const FX = 7.12;            // 美元兑人民币（仅用于折算积分）
    const FEE_RATE = 0.0003;    // 手续费 0.03%
    const FEE_MIN = 1;          // 最低 1 积分
    const GIFT_POINTS = 20000;  // 一次性新手积分
    const MIN_BUY = 2000;       // 低于此值禁止买入
    const LS = {
      personal: 'tt_personal',
      gift: 'tt_gift',
      giftDone: 'tt_gift_done',
      holdings: 'tt_holdings',
      orders: 'tt_orders',
      watch: 'tt_watch'
    };

    /* ---------------- 行情数据 ---------------- */
/*__STOCKS__*/

    const LOGO_OVERRIDES = {
      '600519.SH': '茅', '300750.SZ': '宁', '601318.SH': '平', '600036.SH': '招',
      '000858.SZ': '五', '000568.SZ': '泸', '600809.SH': '汾', '603288.SH': '海',
      '600887.SH': '伊', '000333.SZ': '美', '000651.SZ': '格', '601888.SH': '免',
      '002594.SZ': '比', '688981.SH': '芯', '688256.SH': '寒', '300059.SZ': '东',
      '513100.SH': '纳', '513500.SH': '标'
    };
    STOCKS.forEach((s) => {
      if (LOGO_OVERRIDES[s.id]) s.logo = LOGO_OVERRIDES[s.id];
      if (s.series && s.high > 0 && s.low > 0) {
        const hi = Math.max(s.high, s.low);
        const lo = Math.min(s.high, s.low);
        s.series = s.series.map((v) => Math.min(hi, Math.max(lo, v)));
      }
    });

    const INDICES = [
      { name: '上证指数', code: '000001.SH', value: 3690.48, pct: 0.89 },
      { name: '深证成指', code: '399001.SZ', value: 11673.83, pct: 2.79 },
      { name: '沪深 300', code: '000300.SH', value: 4105.33, pct: 1.71 },
      { name: '恒生指数', code: 'HSI.HK', value: 23093.37, pct: 0.69 },
      { name: '纳斯达克', code: 'IXIC.US', value: 25955.34, pct: -0.21 },
      { name: '标普 500', code: 'SPX.US', value: 7596.3, pct: -0.52 }
    ];

    /* ---------------- 小工具 ---------------- */
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
    const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
    const num = (v, d) => Number(v).toLocaleString('en-US', {
      minimumFractionDigits: d === undefined ? 1 : d,
      maximumFractionDigits: d === undefined ? 1 : d
    });
    const fmtPrice = (v, d) => Number(v).toLocaleString('en-US', {
      minimumFractionDigits: d === undefined ? 2 : d,
      maximumFractionDigits: d === undefined ? 2 : d
    });
    const signedPct = (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%';
    const toneOf = (v) => (v >= 0 ? 'up' : 'down');
    const isUS = (s) => s.currency === '$';
    const findStock = (id) => STOCKS.find((s) => s.id === id);
    const todayKey = () => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const nowHM = () => {
      const d = new Date();
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    const parseAmount = (txt) => {
      const m = String(txt || '').match(/([\d.]+)\s*(亿|万)?/);
      if (!m) return 0;
      const base = parseFloat(m[1]) || 0;
      return m[2] === '亿' ? base * 1e8 : m[2] === '万' ? base * 1e4 : base;
    };

    /* ---------------- 存储 ---------------- */
    function readNum(key, def) {
      const raw = localStorage.getItem(key);
      if (raw === null) return def;
      const v = parseFloat(raw);
      return isNaN(v) ? def : v;
    }
    function writeNum(key, v) {
      try { localStorage.setItem(key, String(r1(v))); } catch (e) {}
    }
    function readJSON(key, def) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : def;
      } catch (e) { return def; }
    }
    function writeJSON(key, v) {
      try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
    }

    const getPersonal = () => r1(readNum(LS.personal, 0));
    const setPersonal = (v) => writeNum(LS.personal, Math.max(0, v));
    const getGift = () => r1(readNum(LS.gift, 0));
    const setGift = (v) => writeNum(LS.gift, Math.max(0, v));
    const getAvail = () => r1(getPersonal() + getGift());

    function getBlogPoints() {
      try {
        if (typeof window.getPoints === 'function') return Number(window.getPoints()) || 0;
      } catch (e) {}
      return parseInt(localStorage.getItem('user_points') || '0', 10) || 0;
    }
    function addBlogPoints(delta) {
      if (typeof window.updatePoints === 'function') return window.updatePoints(delta);
      const next = Math.max(0, getBlogPoints() + delta);
      localStorage.setItem('user_points', String(next));
      const el = document.getElementById('pointsVal');
      if (el) el.textContent = next;
      return next;
    }

    /* ---------------- 持仓与 T+1 ---------------- */
    let holdings = readJSON(LS.holdings, []);
    let orders = readJSON(LS.orders, []);
    let watchIds = readJSON(LS.watch, []);

    function saveHoldings() { writeJSON(LS.holdings, holdings.filter((h) => h.shares > 0)); }
    function saveOrders() { writeJSON(LS.orders, orders.slice(0, 30)); }
    function saveWatch() { writeJSON(LS.watch, watchIds); }

    const isWatched = (id) => watchIds.indexOf(id) >= 0;

    function toggleWatch(id) {
      const s = findStock(id);
      if (!s || s.tradable === false) return;
      if (isWatched(id)) {
        watchIds = watchIds.filter((x) => x !== id);
        showToast('已取消自选「' + s.name + '」');
      } else {
        if (watchIds.length >= 12) { showToast('自选最多 12 只，先移除几只吧'); return; }
        watchIds.push(id);
        showToast('已加入自选「' + s.name + '」');
      }
      saveWatch();
      renderWatchlist();
      renderDeskTable();
      renderMarket();
      syncWatchBtn();
    }

    function settleT1() {
      const today = todayKey();
      let changed = false;
      holdings.forEach((h) => {
        h.pending = h.pending || [];
        const ready = h.pending.filter((p) => p.date < today);
        if (ready.length) {
          h.available += ready.reduce((s, p) => s + p.qty, 0);
          h.pending = h.pending.filter((p) => p.date >= today);
          changed = true;
        }
      });
      if (changed) saveHoldings();
    }

    const holdingOf = (id) => holdings.find((h) => h.id === id);

    function portfolio() {
      let value = 0;
      let cost = 0;
      holdings.forEach((h) => {
        const s = findStock(h.id);
        if (!s) return;
        value += priceCNY(s) * h.shares;
        cost += h.cost;
      });
      return { value: r1(value), cost: r1(cost), pnl: r1(value - cost) };
    }

    const priceCNY = (s) => (isUS(s) ? s.price * FX : s.price);
    const valueCNY = (s, qty) => r1(priceCNY(s) * qty);

    function todayOrders() {
      const t = todayKey();
      return orders.filter((o) => o.date === t);
    }

    /* ---------------- 视图状态 ---------------- */
    const state = {
      view: 'desk',
      selectedId: '600519.SH',
      side: 'buy',
      qty: 100,
      cat: '全部',
      search: '',
      mkCat: '全部',
      mkSearch: '',
      mkSort: 'none',
      booted: false
    };

    const toastEl = $('#toast');
    let toastTimer = null;
    function showToast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
    }

    /* ---------------- 渲染：账户 ---------------- */
    function renderAccount() {
      const p = getPersonal();
      const g = getGift();
      const avail = r1(p + g);
      const pf = portfolio();
      const total = r1(avail + pf.value);
      const pnlPct = pf.cost > 0 ? (pf.pnl / pf.cost) * 100 : 0;

      $('#ttPersonal').textContent = num(p);
      $('#ttGift').textContent = num(g);
      $('#ttAvail').textContent = num(avail);
      $('#ttTotalAssets').textContent = num(total);
      $('#ttHoldValue').textContent = num(pf.value);
      $('#ttRoi').textContent = signedPct(pnlPct);
      $('#ttRoi').className = 'num ' + (pnlPct >= 0 ? 'up' : 'down');
      $('#ttTodayTrades').textContent = todayOrders().length + ' 笔';
      $('#ttLevel').textContent = 'LV.' + Math.max(1, Math.floor(total / 50000) + 1);

      const line = $('#ttPnlLine');
      line.className = 'wealth-delta ' + (pf.pnl >= 0 ? 'up' : 'down');
      line.innerHTML = '<span>持仓盈亏 ' + (pf.pnl >= 0 ? '+' : '') + num(pf.pnl) + '（' + signedPct(pnlPct) + '）</span>';

      $('#ttWalletVal').textContent = num(avail);
      $('#ttAccSub').textContent = '积分账户 · 个人 ' + num(p) + ' / 赠送 ' + num(g);

      // 弹窗同步
      const mB = $('#mBlogPoints');
      if (mB) {
        mB.textContent = getBlogPoints();
        $('#mPersonal').textContent = num(p);
        $('#mGift').textContent = num(g);
        $('#mAvail').textContent = num(avail);
      }
    }

    /* ---------------- 渲染：持仓列表（交易台） ---------------- */
    function renderHoldings() {
      const box = $('#holdingsList');
      const list = holdings.filter((h) => h.shares > 0);
      const cnt = $('#posCount');
      if (cnt) cnt.textContent = list.length;
      if (!list.length) {
        box.innerHTML = '<div class="tt-empty tt-empty-compact"><div class="tt-empty-desc">暂无持仓，去行情买入第一手</div></div>';
        return;
      }
      box.innerHTML = list.map((h) => {
        const s = findStock(h.id);
        if (!s) return '';
        const val = valueCNY(s, h.shares);
        const pnl = val - h.cost;
        const pct = h.cost > 0 ? (pnl / h.cost) * 100 : 0;
        return '' +
          '<div class="holding-row" data-hold="' + h.id + '">' +
            '<div class="holding-logo">' + s.logo + '</div>' +
            '<div class="holding-info">' +
              '<div class="holding-name">' + s.name + '</div>' +
              '<div class="holding-code">' + h.shares.toLocaleString() + ' 股 · 可卖 ' + h.available.toLocaleString() + '</div>' +
            '</div>' +
            '<div class="holding-value">' +
              '<b>' + num(val) + '</b>' +
              '<span class="' + toneOf(pnl) + '">' + signedPct(pct) + '</span>' +
            '</div>' +
          '</div>';
      }).join('');
      $$('#holdingsList [data-hold]').forEach((row) => {
        row.addEventListener('click', () => {
          setView('desk');
          selectStock(row.dataset.hold, true);
        });
      });
    }

    /* ---------------- 渲染：交易台行情表 ---------------- */
    function filteredStocks(cat, query) {
      const q = String(query || '').trim().toLowerCase();
      return STOCKS.filter((s) => {
        const okCat = cat === '全部' || s.category === cat;
        const okQ = !q || s.name.toLowerCase().indexOf(q) >= 0 || s.code.toLowerCase().indexOf(q) >= 0;
        return okCat && okQ;
      });
    }

    function renderDeskTable() {
      const list = filteredStocks(state.cat, state.search);
      $('#marketRows').innerHTML = list.map((s) => {
        const pct = ((s.price - s.prev) / s.prev) * 100;
        const tone = toneOf(pct);
        const tradable = s.tradable !== false;
        const cls = (s.id === state.selectedId ? 'active ' : '') + (tradable ? '' : 'non-tradable');
        return '' +
          '<tr data-id="' + s.id + '" class="' + cls.trim() + '">' +
            '<td><div class="asset-cell">' +
              (tradable
                ? '<button class="star-btn' + (isWatched(s.id) ? ' on' : '') + '" data-star="' + s.id + '" aria-label="自选">★</button>'
                : '<span class="star-ghost" aria-hidden="true"></span>') +
              '<span class="asset-tag' + (isUS(s) ? ' us' : '') + (s.category === '指数' ? ' index' : '') + '">' + s.marketLabel + '</span>' +
              '<div><div class="asset-name">' + s.name + '</div>' +
              '<div class="asset-code">' + s.code + (s.board ? ' · ' + s.board : '') + '</div></div>' +
            '</div></td>' +
            '<td class="price-cell">' + s.currency + fmtPrice(s.price, s.decimals) + '</td>' +
            '<td class="change-cell ' + tone + '">' + signedPct(pct) + '</td>' +
            '<td>' + s.currency + fmtPrice(s.open, s.decimals) + '</td>' +
            '<td>' + s.currency + fmtPrice(s.high, s.decimals) + '</td>' +
            '<td>' + s.currency + fmtPrice(s.low, s.decimals) + '</td>' +
            '<td>' + s.amount + '</td>' +
            '<td>' + (tradable ? '<button class="row-trade-btn" data-trade="' + s.id + '">交易</button>' : '<span class="row-static">仅展示</span>') + '</td>' +
          '</tr>';
      }).join('');
      $('#tableCount').textContent = '显示 ' + list.length + ' 个标的 · 2 分钟刷新';

      $$('#marketRows tr').forEach((row) => {
        row.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-trade]')) return;
          if (ev.target.closest('[data-star]')) return;
          const s = findStock(row.dataset.id);
          if (!s) return;
          if (s.tradable === false) { showToast('「' + s.name + '」为指数，仅展示不参与交易'); return; }
          selectStock(row.dataset.id);
        });
      });
      $$('#marketRows [data-star]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleWatch(btn.dataset.star);
        });
      });
      $$('#marketRows [data-trade]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectStock(btn.dataset.trade, true);
        });
      });
    }

    /* ---------------- 渲染：行情页 ---------------- */
    function renderMarket() {
      const line = $('#mkIndexLine');
      line.innerHTML = INDICES.map((i) =>
        '<span class="mk-index-item">' + i.name + ' <b>' + fmtPrice(i.value, 2) + '</b>' +
        '<i class="' + toneOf(i.pct) + '">' + signedPct(i.pct) + '</i></span>'
      ).join('');

      let list = filteredStocks(state.mkCat, state.mkSearch);
      if (state.mkSort === 'pct') {
        list = list.slice().sort((a, b) => ((b.price - b.prev) / b.prev) - ((a.price - a.prev) / a.prev));
      } else if (state.mkSort === 'amount') {
        list = list.slice().sort((a, b) => parseAmount(b.amount) - parseAmount(a.amount));
      }

      $('#mkRows').innerHTML = list.map((s) => {
        const pct = ((s.price - s.prev) / s.prev) * 100;
        const tone = toneOf(pct);
        const tradable = s.tradable !== false;
        return '' +
          '<tr data-id="' + s.id + '" class="' + (tradable ? '' : 'non-tradable') + '">' +
            '<td><div class="asset-cell">' +
              (tradable
                ? '<button class="star-btn' + (isWatched(s.id) ? ' on' : '') + '" data-star="' + s.id + '" aria-label="自选">★</button>'
                : '<span class="star-ghost" aria-hidden="true"></span>') +
              '<span class="asset-tag' + (isUS(s) ? ' us' : '') + (s.category === '指数' ? ' index' : '') + '">' + s.marketLabel + '</span>' +
              '<div><div class="asset-name">' + s.name + '</div>' +
              '<div class="asset-code">' + s.code + (s.board ? ' · ' + s.board : '') + '</div></div>' +
            '</div></td>' +
            '<td class="price-cell">' + s.currency + fmtPrice(s.price, s.decimals) + '</td>' +
            '<td class="change-cell ' + tone + '">' + signedPct(pct) + '</td>' +
            '<td>' + s.currency + fmtPrice(s.open, s.decimals) + '</td>' +
            '<td>' + s.currency + fmtPrice(s.high, s.decimals) + '</td>' +
            '<td>' + s.currency + fmtPrice(s.low, s.decimals) + '</td>' +
            '<td>' + s.amount + '</td>' +
            '<td>' + s.turnover + '</td>' +
            '<td>' + (tradable ? '<button class="row-trade-btn" data-trade="' + s.id + '">交易</button>' : '<span class="row-static">仅展示</span>') + '</td>' +
          '</tr>';
      }).join('');
      $('#mkFoot').textContent = '共 ' + list.length + ' 个标的 · 行情每 2 分钟刷新一档';

      $$('#mkRows tr').forEach((row) => {
        row.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-trade]')) return;
          if (ev.target.closest('[data-star]')) return;
          const s = findStock(row.dataset.id);
          if (!s) return;
          if (s.tradable === false) { showToast('「' + s.name + '」为指数，仅展示不参与交易'); return; }
          setView('desk');
          selectStock(row.dataset.id, true);
        });
      });
      $$('#mkRows [data-star]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleWatch(btn.dataset.star);
        });
      });
      $$('#mkRows [data-trade]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setView('desk');
          selectStock(btn.dataset.trade, true);
        });
      });
    }

    /* ---------------- 渲染：持仓页 ---------------- */
    function renderPositions() {
      const pf = portfolio();
      const avail = getAvail();
      const pnlPct = pf.cost > 0 ? (pf.pnl / pf.cost) * 100 : 0;
      const tOrders = todayOrders();
      const fees = tOrders.reduce((s, o) => s + (o.fee || 0), 0);

      $('#posValue').textContent = num(pf.value);
      $('#posPnl').textContent = (pf.pnl >= 0 ? '+' : '') + num(pf.pnl);
      $('#posPnl').className = toneOf(pf.pnl);
      $('#posPnlPct').textContent = signedPct(pnlPct);
      $('#posAvail').textContent = num(avail);
      $('#posTrades').textContent = tOrders.length + ' 笔';
      $('#posFees').textContent = num(fees);

      const list = holdings.filter((h) => h.shares > 0);
      $('#posFoot').textContent = '共 ' + list.length + ' 只 · 当日买入次日可卖（T+1）';
      $('#posEmpty').classList.toggle('tt-hidden', list.length > 0);

      $('#posRows').innerHTML = list.map((h) => {
        const s = findStock(h.id);
        if (!s) return '';
        const val = valueCNY(s, h.shares);
        const pnl = val - h.cost;
        const pct = h.cost > 0 ? (pnl / h.cost) * 100 : 0;
        const costPrice = h.cost / h.shares;
        return '' +
          '<tr data-id="' + h.id + '">' +
            '<td><div class="asset-cell">' +
              '<span class="asset-tag' + (isUS(s) ? ' us' : '') + '">' + s.marketLabel + '</span>' +
              '<div><div class="asset-name">' + s.name + '</div>' +
              '<div class="asset-code">' + s.code + '</div></div>' +
            '</div></td>' +
            '<td>' + h.shares.toLocaleString() + '</td>' +
            '<td>' + h.available.toLocaleString() + '</td>' +
            '<td>' + fmtPrice(costPrice, 2) + '</td>' +
            '<td class="price-cell">' + s.currency + fmtPrice(s.price, s.decimals) + '</td>' +
            '<td>' + num(val) + '</td>' +
            '<td class="change-cell ' + toneOf(pnl) + '">' + (pnl >= 0 ? '+' : '') + num(pnl) + '</td>' +
            '<td class="change-cell ' + toneOf(pnl) + '">' + signedPct(pct) + '</td>' +
            '<td><button class="row-trade-btn" data-sell="' + h.id + '">卖出</button></td>' +
          '</tr>';
      }).join('');

      $$('#posRows [data-sell]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setView('desk');
          selectStock(btn.dataset.sell, true);
          setSide('sell');
        });
      });

      renderAlloc();
      renderOrders();
    }

    function renderAlloc() {
      const groups = { 'A 股': 0, ETF: 0, 美股: 0 };
      holdings.forEach((h) => {
        const s = findStock(h.id);
        if (!s) return;
        const key = s.category === 'ETF' ? 'ETF' : s.category === '美股' ? '美股' : 'A 股';
        groups[key] += valueCNY(s, h.shares);
      });
      const cash = getAvail();
      const total = groups['A 股'] + groups.ETF + groups['美股'] + cash || 1;
      const rows = [
        { name: 'A 股', v: groups['A 股'], color: '#34d399' },
        { name: 'ETF', v: groups.ETF, color: '#fbbf24' },
        { name: '美股', v: groups['美股'], color: '#67a9ff' },
        { name: '现金', v: cash, color: '#405c52' }
      ];
      const bar = $('#posAllocBar');
      if (bar) {
        $$('i', bar).forEach((el, i) => { el.style.width = ((rows[i].v / total) * 100).toFixed(2) + '%'; });
      }
      const legend = $('#posAllocLegend');
      if (legend) {
        legend.innerHTML = rows.map((r) =>
          '<div class="alloc-item"><i style="background:' + r.color + '"></i> ' + r.name +
          ' <b>' + ((r.v / total) * 100).toFixed(1) + '%</b></div>'
        ).join('');
      }
    }

    function renderOrders() {
      const list = orders.slice(0, 12);
      const html = list.length
        ? list.map((o) =>
            '<div class="order-item">' +
              '<span class="order-side ' + o.side + '">' + (o.side === 'buy' ? '买' : '卖') + '</span>' +
              '<div class="order-info"><b>' + o.name + ' <span class="num">' + o.qty.toLocaleString() + ' 股</span></b>' +
              '<span>@ ' + o.price + ' · ' + o.time + ' · 手续费 ' + num(o.fee) + '</span></div>' +
              '<span class="order-status done">已成交</span>' +
            '</div>'
          ).join('')
        : '<div class="tt-empty tt-empty-compact"><div class="tt-empty-desc">今天还没有委托记录</div></div>';

      const a = $('#orderList');
      if (a) a.innerHTML = html;
      const b = $('#posOrderList');
      if (b) b.innerHTML = html;
      const c = $('#ordCount');
      if (c) c.textContent = todayOrders().length + ' 笔';
    }

    /* ---------------- 渲染：自选股（交易台左栏） ---------------- */
    function renderWatchlist() {
      const box = $('#wlList');
      if (!box) return;
      const cnt = $('#wlCount');
      if (cnt) cnt.textContent = watchIds.length;

      const list = watchIds.map(findStock).filter((s) => !!s);
      if (!list.length) {
        box.innerHTML = '<div class="tt-empty" style="padding:10px 4px;">' +
          '<div class="tt-empty-desc">还没有自选股。在行情表里点 ★ 就能加进来。</div></div>';
        return;
      }

      box.innerHTML = list.map((s) => {
        const pct = ((s.price - s.prev) / s.prev) * 100;
        return '' +
          '<div class="wl-row" data-wl="' + s.id + '" title="点击带入下单面板">' +
            '<div class="wl-logo">' + s.logo + '</div>' +
            '<div class="wl-main">' +
              '<div class="wl-name">' + s.name + '</div>' +
              '<div class="wl-code">' + s.code + '</div>' +
            '</div>' +
            '<div class="wl-right">' +
              '<div class="wl-price">' + s.currency + fmtPrice(s.price, s.decimals) + '</div>' +
              '<div class="wl-pct ' + toneOf(pct) + '">' + signedPct(pct) + '</div>' +
            '</div>' +
            '<button class="wl-del" type="button" data-wl-del="' + s.id + '" aria-label="移出自选">×</button>' +
          '</div>';
      }).join('');

      $$('#wlList [data-wl]').forEach((row) => {
        row.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-wl-del]')) return;
          setView('desk');
          selectStock(row.dataset.wl, true);
        });
      });
      $$('#wlList [data-wl-del]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleWatch(btn.dataset.wlDel);
        });
      });
    }

    /* 股票详情页那颗「☆ 自选」跟着真实状态走 */
    function syncWatchBtn() {
      const btn = $('#watchBtn');
      if (!btn) return;
      const on = isWatched(state.selectedId);
      btn.classList.toggle('active', on);
      btn.textContent = on ? '★ 已自选' : '☆ 自选';
    }

    /* ---------------- 图表 ---------------- */
    function drawChart(stock) {
      const values = stock.series;
      const W = 1000;
      const H = 240;
      const padX = 8;
      const topPad = 18;
      const bottomPad = 24;
      const min = Math.min.apply(null, values);
      const max = Math.max.apply(null, values);
      const span = max - min || 1;
      const pts = values.map((v, i) => [
        padX + (i / (values.length - 1)) * (W - padX * 2),
        topPad + (1 - (v - min) / span) * (H - topPad - bottomPad)
      ]);

      let line = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1];
        const c = pts[i];
        const cx = (p[0] + c[0]) / 2;
        line += ' C' + cx.toFixed(2) + ' ' + p[1].toFixed(2) + ', ' + cx.toFixed(2) + ' ' + c[1].toFixed(2) + ', ' + c[0].toFixed(2) + ' ' + c[1].toFixed(2);
      }
      const area = line + ' L' + pts[pts.length - 1][0].toFixed(2) + ' ' + (H - bottomPad) + ' L' + pts[0][0].toFixed(2) + ' ' + (H - bottomPad) + ' Z';
      const isUp = stock.price >= stock.prev;
      const color = isUp ? '#ff7b72' : '#4ade80';

      $('#linePath').setAttribute('d', line);
      $('#linePath').setAttribute('stroke', color);
      $('#areaPath').setAttribute('d', area);
      $('#areaPath').setAttribute('fill', isUp ? 'url(#areaUp)' : 'url(#areaDown)');

      $('#volumeBars').innerHTML = values.map((v, i) => {
        const bw = ((W - padX * 2) / values.length) * 0.45;
        const x = padX + (i / (values.length - 1)) * (W - padX * 2) - bw / 2;
        const ratio = 0.25 + ((v - min) / span) * 0.75;
        const bh = (H - topPad - bottomPad) * 0.13 * ratio;
        return '<rect x="' + x.toFixed(2) + '" y="' + (H - bottomPad - bh).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + bh.toFixed(2) + '" rx="1" fill="' + color + '" opacity="0.09"/>';
      }).join('');

      const lastY = pts[pts.length - 1][1];
      const dot = $('#chartDot');
      dot.style.top = ((lastY / H) * 100) + '%';
      dot.className = 'chart-dot' + (isUp ? '' : ' down');

      const hi = Math.max(stock.high, max);
      const lo = Math.min(stock.low, min);
      $('#chartYHigh').textContent = fmtPrice(hi, stock.decimals);
      $('#chartYMid').textContent = fmtPrice((hi + lo) / 2, stock.decimals);
      $('#chartYLow').textContent = fmtPrice(lo, stock.decimals);
    }

    /* ---------------- 选中标的 ---------------- */
    function selectStock(id, fromTrade) {
      const s = findStock(id);
      if (!s || s.tradable === false) return;
      state.selectedId = id;
      const pct = ((s.price - s.prev) / s.prev) * 100;
      const chg = s.price - s.prev;

      $('#stockLogo').textContent = s.logo;
      $('#stockName').textContent = s.name;
      $('#stockMarketTag').textContent = s.tag;
      $('#stockMarketTag').className = 'market-tag' + (isUS(s) ? ' us' : '');
      $('#stockCode').textContent = s.code;
      $('#stockSector').textContent = s.sector;
      $('#stockSession').textContent = s.session;
      $('#priceCurrency').textContent = s.currency;
      $('#priceMain').textContent = fmtPrice(s.price, s.decimals);
      $('#priceChange').textContent = (chg >= 0 ? '+' : '') + fmtPrice(chg, s.decimals);
      $('#pricePct').textContent = signedPct(pct);
      $('.price-change').className = 'price-change ' + toneOf(pct);

      $('#statOpen').textContent = fmtPrice(s.open, s.decimals);
      $('#statHigh').textContent = fmtPrice(s.high, s.decimals);
      $('#statLow').textContent = fmtPrice(s.low, s.decimals);
      $('#statAmount').textContent = s.amount;
      $('#statTurnover').textContent = s.turnover;
      $('#statPrev').textContent = fmtPrice(s.prev, s.decimals);

      $('#chartX').innerHTML = isUS(s)
        ? '<span>09:30</span><span>11:00</span><span>13:00</span><span>15:00</span><span>16:00</span>'
        : '<span>09:30</span><span>10:30</span><span>11:30</span><span>13:00</span><span>14:00</span><span>15:00</span>';

      drawChart(s);
      state.qty = s.lot;
      state.side = state.side || 'buy';
      renderDeskTable();
      updateOrderPanel();
      syncWatchBtn();
      if (fromTrade) showToast('已把「' + s.name + '」带入下单面板');
    }

    /* ---------------- 下单计算 ---------------- */
    function orderMath() {
      const s = findStock(state.selectedId);
      const qty = Math.max(0, Number(state.qty) || 0);
      const amount = valueCNY(s, qty);
      const fee = qty > 0 ? Math.max(FEE_MIN, r1(amount * FEE_RATE)) : 0;
      return { stock: s, qty: qty, amount: amount, fee: r1(fee), total: r1(amount + fee) };
    }

    function maxBuyLots() {
      const s = findStock(state.selectedId);
      const avail = getAvail();
      const lot = s.lot || 100;
      let qty = Math.floor(avail / (priceCNY(s) * lot)) * lot;
      while (qty > 0) {
        const amt = valueCNY(s, qty);
        const fee = Math.max(FEE_MIN, r1(amt * FEE_RATE));
        if (amt + fee <= avail) break;
        qty -= lot;
      }
      return Math.max(0, qty);
    }

    function updateOrderPanel() {
      const s = findStock(state.selectedId);
      const pct = ((s.price - s.prev) / s.prev) * 100;
      const m = orderMath();
      const avail = getAvail();
      const isBuy = state.side === 'buy';
      const h = holdingOf(s.id);
      const sellable = h ? h.available : 0;

      $('#orderLogo').textContent = s.logo;
      $('#orderName').textContent = s.name;
      $('#orderCode').textContent = s.code;
      $('#orderPrice').textContent = fmtPrice(s.price, s.decimals);
      $('#orderPct').textContent = signedPct(pct);
      $('#orderPct').className = toneOf(pct);

      $$('.side-btn').forEach((b) => b.classList.toggle('active', b.dataset.side === state.side));

      $('#qtyInput').value = m.qty;
      $('#qtyInput').step = s.lot || 100;
      $('#lotHint').textContent = (s.lot || 100) + ' 股 / 手' + (isUS(s) ? ' · 按汇率 ' + FX + ' 折算' : '');

      const lot = s.lot || 100;
      const maxQty = isBuy ? maxBuyLots() : sellable;
      const quick = [lot, lot * 5, lot * 10];
      $('#quickQty').innerHTML = quick.map((v) => '<button type="button" data-qty="' + v + '">' + v.toLocaleString() + '</button>').join('') +
        '<button type="button" data-qty="max">最大 ' + maxQty.toLocaleString() + '</button>';
      $$('#quickQty [data-qty]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.qty = btn.dataset.qty === 'max' ? maxQty : Number(btn.dataset.qty);
          updateOrderPanel();
        });
      });

      $('#orderEstimate').textContent = '¥' + num(m.amount);
      $('#orderFee').textContent = '¥' + num(m.fee);
      $('#orderBalance').textContent = num(avail);

      const totalEl = $('#orderTotal');
      if (isBuy) {
        const rest = r1(avail - m.total);
        totalEl.textContent = num(rest);
        totalEl.className = rest < 0 ? 'tt-down' : '';
      } else {
        totalEl.textContent = '+' + num(r1(m.amount - m.fee));
        totalEl.className = 'tt-up';
      }

      // 提示分两种：低于门槛禁止买入（独立提示条）；本次积分不够（直接写在按钮上，不占额外高度）
      const blocked = isBuy && avail < MIN_BUY;
      const shortfall = isBuy && m.total > avail;
      $('#orderWarn').classList.toggle('tt-hidden', !blocked);

      const btn = $('#submitOrder');
      btn.textContent = isBuy
        ? (shortfall ? '积分不足 · 差 ' + num(r1(m.total - avail)) + ' 分' : '确认买入')
        : '确认卖出';

      btn.classList.toggle('sell-mode', !isBuy);
      let disabled = false;
      if (blocked) disabled = true;
      else if (isBuy && m.total > avail) disabled = true;
      else if (!isBuy && (m.qty <= 0 || m.qty > sellable)) disabled = true;
      else if (m.qty <= 0) disabled = true;
      btn.disabled = disabled;
      btn.classList.toggle('is-disabled', disabled);

      syncRulesFade();
    }

    function setSide(side) {
      state.side = side;
      const s = findStock(state.selectedId);
      const h = holdingOf(s.id);
      state.qty = side === 'sell' && h ? Math.min(h.available, s.lot || 100) : (s.lot || 100);
      updateOrderPanel();
    }

    function debitPoints(total) {
      let g = getGift();
      let p = getPersonal();
      const fromGift = Math.min(g, total);
      g = r1(g - fromGift);
      p = r1(p - (total - fromGift));
      setGift(g);
      setPersonal(p);
    }

    function submitOrder() {
      const m = orderMath();
      const s = m.stock;
      const avail = getAvail();
      const isBuy = state.side === 'buy';
      const h = holdingOf(s.id);

      if (m.qty <= 0) { showToast('请输入有效数量（最少 1 手）'); return; }
      if (isBuy) {
        if (avail < MIN_BUY) { showToast('可用积分低于 2,000，暂不可买入'); return; }
        if (m.total > avail) { showToast('可用积分不足，还差 ' + num(r1(m.total - avail)) + ' 分'); return; }
        debitPoints(m.total);
        if (h) {
          h.shares += m.qty;
          h.cost = r1(h.cost + m.total);
          h.pending.push({ qty: m.qty, date: todayKey() });
        } else {
          holdings.push({ id: s.id, shares: m.qty, available: 0, cost: r1(m.total), pending: [{ qty: m.qty, date: todayKey() }] });
        }
      } else {
        if (!h || m.qty > h.available) { showToast('可卖数量不足（T+1：当日买入次日可卖）'); return; }
        const costOut = r1(h.cost * (m.qty / h.shares));
        h.shares -= m.qty;
        h.available -= m.qty;
        h.cost = r1(h.cost - costOut);
        setPersonal(r1(getPersonal() + m.amount - m.fee));
        if (h.shares <= 0) holdings = holdings.filter((x) => x.id !== h.id);
      }

      orders.unshift({
        id: s.id, name: s.name, code: s.code, side: state.side, qty: m.qty,
        price: fmtPrice(s.price, s.decimals), amount: m.amount, fee: m.fee,
        time: nowHM(), date: todayKey()
      });
      saveHoldings();
      saveOrders();

      renderAccount();
      renderHoldings();
      renderPositions();
      renderDeskTable();
      updateOrderPanel();
      showToast((isBuy ? '买入' : '卖出') + '成交：' + s.name + ' ' + m.qty.toLocaleString() + ' 股 · 手续费 ' + num(m.fee) + ' 分');
    }

    /* ---------------- 视图切换 ---------------- */
    function setView(name) {
      state.view = name;
      const map = { desk: '#ttViewDesk', market: '#ttViewMarket', positions: '#ttViewPos' };
      Object.keys(map).forEach((k) => {
        const el = $(map[k]);
        if (el) el.classList.toggle('tt-hidden', k !== name);
      });
      $$('.nav-btn').forEach((b) => {
        const t = b.dataset.nav;
        const hit = (name === 'desk' && t === '交易台') || (name === 'market' && t === '行情') || (name === 'positions' && t === '持仓');
        b.classList.toggle('active', hit);
      });
      if (name === 'market') renderMarket();
      if (name === 'positions') renderPositions();
      if (name === 'desk') { renderAccount(); renderHoldings(); renderDeskTable(); updateOrderPanel(); }
    }

    /* ---------------- 积分账户弹窗 ---------------- */
    function openAccount() {
      renderAccount();
      $('#mAmount').value = '';
      $('#ttAccountModal').classList.add('show');
    }
    function closeAccount() {
      $('#ttAccountModal').classList.remove('show');
    }
    function doTransfer() {
      const v = Math.floor(Number($('#mAmount').value) || 0);
      if (v <= 0) { showToast('请输入大于 0 的积分数量'); return; }
      const blog = getBlogPoints();
      if (v > blog) { showToast('博客积分不足，当前 ' + blog + ' 分'); return; }
      addBlogPoints(-v);
      setPersonal(r1(getPersonal() + v));
      renderAccount();
      renderPositions();
      updateOrderPanel();
      showToast('已从博客积分转入 ' + v + ' 分');
    }
    function doWithdraw() {
      const v = Math.floor(Number($('#mAmount').value) || 0);
      if (v <= 0) { showToast('请输入大于 0 的积分数量'); return; }
      const p = getPersonal();
      if (v > p) { showToast('个人积分不足，当前 ' + num(p) + ' 分（赠送积分不可提现）'); return; }
      setPersonal(r1(p - v));
      addBlogPoints(v);
      renderAccount();
      renderPositions();
      updateOrderPanel();
      showToast('已提现 ' + v + ' 分到博客积分');
    }

    /* ---------------- 行情刷新（2 分钟一档） ---------------- */
    function refreshQuotes() {
      STOCKS.forEach((s) => {
        if (s.tradable === false) return;
        const drift = (Math.random() - 0.5) * 0.012;
        const next = Math.max(0.01, s.price * (1 + drift));
        const d = s.decimals || 2;
        s.price = Math.round(next * Math.pow(10, d)) / Math.pow(10, d);
        s.high = Math.max(s.high, s.price);
        s.low = Math.min(s.low, s.price);
        const last = s.series[s.series.length - 1];
        s.series.push(Math.max(s.low, Math.min(s.high, (last + s.price) / 2)));
        s.series.shift();
      });
      INDICES.forEach((i) => { i.pct = r1((i.pct + (Math.random() - 0.5) * 0.3) * 10) / 10; i.value = Math.round(i.value * (1 + (Math.random() - 0.5) * 0.002) * 100) / 100; });
      renderAccount();
      renderHoldings();
      renderDeskTable();
      renderMarket();
      renderPositions();
      updateOrderPanel();
      const s = findStock(state.selectedId);
      if (s) selectStock(s.id);
      showToast('行情已刷新（2 分钟一档）');
    }

    /* ---------------- 开关终端 ---------------- */
    function bootOnce() {
      if (state.booted) return;
      state.booted = true;
      settleT1();
      if (!localStorage.getItem(LS.giftDone)) {
        setGift(r1(getGift() + GIFT_POINTS));
        try { localStorage.setItem(LS.giftDone, '1'); } catch (e) {}
        $('#ttGiftModal').classList.add('show');
      }
      selectStock(state.selectedId);
      renderAccount();
      renderHoldings();
      renderDeskTable();
      renderOrders();
      renderPositions();
      updateOrderPanel();
    }

    function openTerminal() {
      $('#ttApp').classList.add('tt-open');
      $('#ttApp').setAttribute('aria-hidden', 'false');
      document.body.classList.add('tt-locked');
      bootOnce();
      setView('desk');
    }

    function closeTerminal() {
      $('#ttApp').classList.remove('tt-open');
      $('#ttApp').setAttribute('aria-hidden', 'true');
      document.body.classList.remove('tt-locked');
      closeAccount();
      $('#ttGiftModal').classList.remove('show');
    }

    /* ---------------- 事件绑定 ---------------- */
    function bind() {
      // 导航
      $$('.nav-btn').forEach((b) => {
        b.addEventListener('click', () => {
          const t = b.dataset.nav;
          setView(t === '交易台' ? 'desk' : t === '行情' ? 'market' : 'positions');
        });
      });

      $('#ttCloseBtn').addEventListener('click', closeTerminal);
      $('#ttWalletBtn').addEventListener('click', openAccount);
      $('#ttOpenTransfer').addEventListener('click', openAccount);
      $('#ttOpenWithdraw').addEventListener('click', openAccount);
      $('#mCloseBtn').addEventListener('click', closeAccount);
      $('#mTransferBtn').addEventListener('click', doTransfer);
      $('#mWithdrawBtn').addEventListener('click', doWithdraw);
      $('#ttGiftOkBtn').addEventListener('click', () => $('#ttGiftModal').classList.remove('show'));
      $$('.tt-quick [data-amt]').forEach((b) => {
        b.addEventListener('click', () => {
          $('#mAmount').value = b.dataset.amt === 'all' ? getBlogPoints() : b.dataset.amt;
        });
      });

      // 交易台筛选
      $$('#watchTabs .watch-tab').forEach((b) => {
        b.addEventListener('click', () => {
          state.cat = b.dataset.category;
          $$('#watchTabs .watch-tab').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          renderDeskTable();
        });
      });
      $('#searchInput').addEventListener('input', (e) => {
        state.search = e.target.value;
        renderDeskTable();
      });
      $('#holdingsMore').addEventListener('click', () => setView('positions'));

      // 下单
      $$('.side-btn').forEach((b) => b.addEventListener('click', () => setSide(b.dataset.side)));
      $('#qtyMinus').addEventListener('click', () => {
        const lot = findStock(state.selectedId).lot || 100;
        state.qty = Math.max(0, (Number(state.qty) || 0) - lot);
        updateOrderPanel();
      });
      $('#qtyPlus').addEventListener('click', () => {
        const lot = findStock(state.selectedId).lot || 100;
        const max = state.side === 'buy' ? maxBuyLots() : (holdingOf(state.selectedId) ? holdingOf(state.selectedId).available : 0);
        const next = (Number(state.qty) || 0) + lot;
        state.qty = max > 0 ? Math.min(next, max) : next;
        updateOrderPanel();
      });
      $('#qtyInput').addEventListener('input', (e) => {
        state.qty = Math.max(0, Number(e.target.value) || 0);
        updateOrderPanel();
      });
      $('#submitOrder').addEventListener('click', submitOrder);
      $('#quickBuyBtn').addEventListener('click', () => { setSide('buy'); showToast('已切换到买入'); });
      $('#quickSellBtn').addEventListener('click', () => { setSide('sell'); showToast('已切换到卖出'); });
      $('#watchBtn').addEventListener('click', () => {
        toggleWatch(state.selectedId);
      });
      $('#wlGoMarket').addEventListener('click', () => setView('market'));

      // 时间区间按钮（视觉）
      $$('.range-btn').forEach((b) => {
        b.addEventListener('click', () => {
          $$('.range-btn').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
        });
      });

      // 行情页
      $$('#mkTabs .watch-tab').forEach((b) => {
        b.addEventListener('click', () => {
          state.mkCat = b.dataset.cat;
          $$('#mkTabs .watch-tab').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          renderMarket();
        });
      });
      $('#mkSearch').addEventListener('input', (e) => {
        state.mkSearch = e.target.value;
        renderMarket();
      });
      $$('.sort-btn[data-sort]').forEach((b) => {
        b.addEventListener('click', () => {
          state.mkSort = state.mkSort === b.dataset.sort ? 'none' : b.dataset.sort;
          $$('.sort-btn[data-sort]').forEach((x) => x.classList.toggle('active', x.dataset.sort === state.mkSort));
          renderMarket();
        });
      });
      $('#posGoMarket').addEventListener('click', () => setView('market'));
      $('#posGoDesk').addEventListener('click', () => setView('desk'));
      $('#posEmptyBtn').addEventListener('click', () => setView('market'));

      // 播报速度
      const track = $('.ticker-track');
      const SPEED = { slow: '70s', normal: '38s', fast: '18s' };
      $$('.speed-btn').forEach((b) => {
        b.addEventListener('click', () => {
          $$('.speed-btn').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          track.style.animation = 'none';
          void track.offsetWidth;
          track.style.animation = 'tickerScroll ' + (SPEED[b.dataset.speed] || '38s') + ' linear infinite';
        });
      });

      // 刷新倒计时 + 2 分钟换一档
      let sec = 118;
      setInterval(() => {
        sec--;
        if (sec < 0) {
          sec = 120;
          refreshQuotes();
        }
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        const el = $('#refreshCountdown');
        if (el) el.textContent = mm + ':' + ss;
      }, 1000);

      // 顶栏时钟
      const clock = $('#ttClock');
      const tick = () => {
        const d = new Date();
        if (clock) clock.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' · ' + nowHM();
      };
      tick();
      setInterval(tick, 30000);

      // ESC 关闭
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if ($('#ttAccountModal').classList.contains('show')) { closeAccount(); return; }
        if ($('#ttGiftModal').classList.contains('show')) { $('#ttGiftModal').classList.remove('show'); return; }
        if ($('#ttApp').classList.contains('tt-open')) closeTerminal();
      });

      // 博客入口
      const openBtn = document.getElementById('openTerminalBtn');
      if (openBtn) openBtn.addEventListener('click', openTerminal);
      const lobbyBtn = document.getElementById('lobbyTerminalBtn');
      if (lobbyBtn) {
        lobbyBtn.addEventListener('click', () => {
          const m = document.getElementById('gameModal');
          if (m) m.classList.remove('active');
          openTerminal();
        });
      }
    }

    /* ---------------- 启动 ---------------- */
    // 规则区底部的渐隐遮罩只在「确实还有内容要滚动」时出现，
    // 否则内容刚好放得下时，最后一条会被这层渐变无谓地压暗。
    function syncRulesFade() {
      const box = $('.order-rules');
      const body = $('#rulesBody');
      if (!box || !body) return;
      box.classList.toggle('can-scroll', body.scrollHeight - body.clientHeight > 1);
    }

    function init() {
      bind();
      settleT1();
      renderAccount();
      renderDeskTable();
      renderOrders();
      renderWatchlist();
      syncWatchBtn();
      updateOrderPanel();
      syncRulesFade();
      const s = findStock(state.selectedId);
      if (s) drawChart(s);

      let rz = null;
      window.addEventListener('resize', () => {
        clearTimeout(rz);
        rz = setTimeout(syncRulesFade, 150);
      });
    }
    init();
  })();
  </script>
