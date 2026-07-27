// Isolated world. Headless by design: no injected page UI. It receives decoded
// gRPC-Web frames from the MAIN-world hook, persists them per-account in
// chrome.storage.local (so switching accounts — which reloads the SPA —
// accumulates every bucket), and serves the toolbar popup: summary, one-click
// auto-capture, and file exports. All data stays on this machine.
(function () {
  'use strict';

  const MAP = window.__XTB_MAP;
  const EXP = window.__XTB_EXPORT;
  const KEY = 'xtbExport:v1';
  const HKEY = 'xtbExport:history';
  const HISTORY_MAX = 400;

  const state = { retirement: [], caps: {}, history: [] };

  const capKey = (method, account) => method + '|' + (account ? account.accountNo : 'unknown');
  const round2 = (n) => Math.round(n * 100) / 100;

  function persist() {
    try {
      chrome.storage.local.set({ [KEY]: { retirement: state.retirement, caps: state.caps }, [HKEY]: state.history });
    } catch (e) {
      /* storage unavailable */
    }
  }

  function load(cb) {
    try {
      chrome.storage.local.get([KEY, HKEY], (r) => {
        const s = r && r[KEY];
        if (s) {
          state.retirement = s.retirement || [];
          state.caps = s.caps || {};
        }
        state.history = (r && r[HKEY]) || [];
        cb();
      });
    } catch (e) {
      cb();
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== 'xtb-export' || d.kind !== 'capture') return;
    ingest(d.method, d.decoded, d.account);
  });

  function ingest(method, frames, account) {
    const key = MAP.match(method);
    if (key === 'retirement') state.retirement = MAP.mapRetirementAccounts(frames);
    if (key === 'positions' || key === 'savings' || key === 'balance') {
      state.caps[capKey(method, account)] = { method, key, account: account || null, frames, receivedAt: new Date().toISOString() };
    }
    persist();
  }

  function bucketOf(accountNo) {
    const r = state.retirement.find((a) => String(a.accountId) === String(accountNo));
    return r ? r.bucket : 'My Transactions';
  }

  function buildSnapshot() {
    MAP.resetWarnings();
    const positions = [];
    const balances = [];
    let savings = null;

    for (const rec of Object.values(state.caps)) {
      const accountNo = rec.account && rec.account.accountNo;
      const bucket = bucketOf(accountNo);
      if (rec.key === 'positions') MAP.mapPositions(rec.frames).forEach((p) => positions.push({ bucket, accountNo, ...p }));
      else if (rec.key === 'balance') balances.push({ bucket, accountNo, ...MAP.mapBalance(rec.frames) });
      else if (rec.key === 'savings') savings = MAP.mapSavings(rec.frames);
    }

    const agg = {};
    for (const p of positions) {
      const b = (agg[p.bucket] = agg[p.bucket] || { marketValue: 0, cost: 0, netPL: 0, positions: 0 });
      b.marketValue += p.marketValue || 0;
      b.cost += p.cost || 0;
      b.netPL += p.netPL || 0;
      b.positions += 1;
    }
    if (savings) {
      agg['Investment Plans'] = {
        marketValue: savings.totalValue, // already includes plan cash
        cost: savings.totalValue - savings.totalPL,
        netPL: savings.totalPL,
        positions: (savings.plans || []).reduce((n, pl) => n + (pl.holdings || []).length, 0),
      };
    }
    // Free cash per bucket, from the captured balances — xStation's account
    // value = holdings market value + free funds, so add it in.
    const freeByBucket = {};
    for (const bal of balances) freeByBucket[bal.bucket] = (freeByBucket[bal.bucket] || 0) + (bal.freeFunds || 0);

    const buckets = {};
    const total = { marketValue: 0, freeFunds: 0, value: 0, cost: 0, netPL: 0 };
    for (const [b, v] of Object.entries(agg)) {
      const free = freeByBucket[b] || 0;
      buckets[b] = {
        value: round2(v.marketValue + free),
        marketValue: round2(v.marketValue),
        freeFunds: round2(free),
        cost: round2(v.cost),
        netPL: round2(v.netPL),
        positions: v.positions,
      };
      total.marketValue += v.marketValue;
      total.freeFunds += free;
      total.value += v.marketValue + free;
      total.cost += v.cost;
      total.netPL += v.netPL;
    }

    return {
      capturedAt: new Date().toISOString(),
      origin: location.origin,
      summary: {
        buckets,
        total: {
          value: round2(total.value),
          marketValue: round2(total.marketValue),
          freeFunds: round2(total.freeFunds),
          cost: round2(total.cost),
          netPL: round2(total.netPL),
        },
      },
      retirementAccounts: state.retirement,
      positions,
      balances,
      investmentPlans: savings,
      warnings: MAP.getWarnings(),
    };
  }

  function summaryPayload() {
    const snap = buildSnapshot();
    const ccy =
      (snap.positions.find((p) => p.currency) || {}).currency ||
      (snap.balances.find((b) => b.currency) || {}).currency ||
      (snap.investmentPlans && snap.investmentPlans.currency) ||
      '';
    return {
      accounts: snap.retirementAccounts,
      buckets: snap.summary.buckets,
      total: snap.summary.total,
      currency: ccy,
      hasSavings: !!snap.investmentPlans,
      positionsCount: snap.positions.length,
      historyCount: (state.history || []).length,
      warnings: snap.warnings,
      capturedAt: snap.capturedAt,
    };
  }

  // ---- History (#2): one snapshot per day, for value-over-time analysis ---
  function recordHistory() {
    const snap = buildSnapshot();
    if (!Object.keys(snap.summary.buckets).length) return; // nothing captured yet
    const day = snap.capturedAt.slice(0, 10);
    const entry = { date: day, ts: snap.capturedAt, total: snap.summary.total, buckets: snap.summary.buckets };
    state.history = (state.history || []).filter((e) => e.date !== day);
    state.history.push(entry);
    state.history.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    if (state.history.length > HISTORY_MAX) state.history = state.history.slice(-HISTORY_MAX);
    persist();
  }

  function historyRows() {
    const val = (o) => (o.value != null ? o.value : o.marketValue);
    const rows = [];
    for (const e of state.history || []) {
      rows.push({ date: e.date, bucket: 'TOTAL', value: val(e.total), marketValue: e.total.marketValue, cost: e.total.cost, netPL: e.total.netPL });
      for (const [b, v] of Object.entries(e.buckets || {})) {
        rows.push({ date: e.date, bucket: b, value: val(v), marketValue: v.marketValue, cost: v.cost, netPL: v.netPL });
      }
    }
    return rows;
  }

  // ---- Auto-navigation ("capture all") -----------------------------------
  // Only match inside the left sidebar (x < SIDEBAR_MAX). The same labels
  // ("IKE", "Moje Transakcje"…) also appear as dashboard tiles and, once the
  // terminal is open, as text in tables (e.g. "IKE" in the closed-positions
  // source column) — clicking those does nothing, which was skipping buckets.
  const SIDEBAR_MAX = 220;
  function deepFindByText(text, maxLeft) {
    const stack = [document];
    while (stack.length) {
      const root = stack.pop();
      const els = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (const el of els) {
        if (el.childElementCount === 0 && (el.textContent || '').trim() === text) {
          if (maxLeft == null) return el;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.left < maxLeft) return el;
        }
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
    return null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let capturing = false;

  async function captureAll(dwellMs) {
    if (capturing) return;
    capturing = true;
    const dwell = dwellMs || 3500;
    // Match the xStation sidebar label in either the Polish or English UI.
    const targets = [
      ['My Transactions', 'Moje Transakcje', 'Transactions'],
      ['IKE'],
      ['IKZE'],
      ['Investment Plans', 'Plany Inwestycyjne', 'Savings Plans'],
    ];
    try {
      for (const candidates of targets) {
        let el = null;
        for (const t of candidates) {
          el = deepFindByText(t, SIDEBAR_MAX);
          if (el) break;
        }
        if (el) {
          el.click();
          await sleep(dwell);
        }
      }
      const start = deepFindByText('Start', SIDEBAR_MAX);
      if (start) start.click();
    } finally {
      capturing = false;
    }
  }

  // ---- Exports (run in page context so downloads work) -------------------
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function exportJSON() {
    const snap = buildSnapshot();
    snap.history = state.history || [];
    EXP.download('xtb-portfolio-' + stamp() + '.json', EXP.toJSON(snap), 'application/json');
  }

  function exportPositionsCSV() {
    const rows = buildSnapshot().positions;
    if (!rows.length) return false;
    const cols = ['bucket', 'accountNo', 'symbol', 'name', 'currency', 'volume', 'price', 'avgCost', 'marketValue', 'cost', 'netPL', 'plPct', 'swap', 'openTimeFirst', 'openTimeLast', 'instrumentId'];
    EXP.download('xtb-positions-' + stamp() + '.csv', EXP.toCSV(rows, cols), 'text/csv');
    return true;
  }

  function planRows(savings) {
    if (!savings || !savings.plans) return [];
    const rows = [];
    for (const p of savings.plans) {
      (p.holdings || []).forEach((h) =>
        rows.push({
          plan: p.name,
          planId: p.planId,
          planValue: p.currentValue,
          planInvested: p.invested,
          planCash: p.cash,
          planPL: p.netPL,
          symbol: h.symbol,
          targetPct: h.targetPct,
          units: h.units,
          price: h.price,
          cost: h.cost,
          value: h.value,
          netPL: h.netPL,
          plPct: h.plPct,
        })
      );
    }
    return rows;
  }

  function exportPlansCSV() {
    const rows = planRows(buildSnapshot().investmentPlans);
    if (!rows.length) return false;
    EXP.download('xtb-plans-' + stamp() + '.csv', EXP.toCSV(rows), 'text/csv');
    return true;
  }

  function exportHistoryCSV() {
    const rows = historyRows();
    if (!rows.length) return false;
    EXP.download('xtb-history-' + stamp() + '.csv', EXP.toCSV(rows, ['date', 'bucket', 'value', 'marketValue', 'cost', 'netPL']), 'text/csv');
    return true;
  }

  function doClear() {
    state.retirement = [];
    state.caps = {};
    persist();
  }

  // ---- Popup bridge ------------------------------------------------------
  try {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case 'xtb-summary':
          reply(summaryPayload());
          return false;
        case 'xtb-capture-all':
          captureAll().then(() => {
            recordHistory();
            reply({ ok: true, summary: summaryPayload() });
          });
          return true; // async reply
        case 'xtb-export-json':
          exportJSON();
          reply({ ok: true });
          return false;
        case 'xtb-export-positions':
          reply({ ok: exportPositionsCSV() });
          return false;
        case 'xtb-export-plans':
          reply({ ok: exportPlansCSV() });
          return false;
        case 'xtb-export-history':
          reply({ ok: exportHistoryCSV() });
          return false;
        case 'xtb-clear':
          doClear();
          reply({ ok: true, summary: summaryPayload() });
          return false;
        default:
          reply({ ok: false });
          return false;
      }
    });
  } catch (e) {
    /* not in an extension context */
  }

  load(() => {});
})();
