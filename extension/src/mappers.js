// Semantic mappers: turn generic field-number trees (fN) from the protobuf
// decoder into named objects. Field numbers are stable across app deploys
// (protobuf contract), so these maps only change if XTB changes the .proto.
//
// All confirmed live against the xStation UI (2026-07):
//   MainAccountService/GetRetirementAccounts        -> IKE/IKZE account list
//   PositionService/SubscribePortfolioPositionGroups-> open positions per account
//   InvestmentPlanService/SubscribeInvestmentPlans  -> Investment Plans (v2)
//   RetirePortfolioService/GetAccountBalance        -> IKE/IKZE balance
//
// Encoding notes:
//   money  = signed 64-bit varint, minor units (÷100); plans v2 use scaled
//            money { f1: signed unscaled, f2: scale } instead
//   volume = Decimal { f1: unscaled, f2: scale } -> f1 * 10^-f2
//   price  = float32/float64, as-is
//   time   = unix epoch milliseconds
(function () {
  'use strict';

  const TWO64 = 18446744073709551616n;
  const TWO63 = 9223372036854775808n;

  // Interpret a varint (possibly returned as Number or decimal string) as a
  // signed 64-bit integer. Negative protobuf ints arrive as huge unsigned.
  function signed(v) {
    if (v === null || v === undefined) return 0;
    let b;
    try {
      b = typeof v === 'bigint' ? v : BigInt(typeof v === 'number' ? Math.round(v) : v);
    } catch (e) {
      return Number(v) || 0;
    }
    if (b >= TWO63) b -= TWO64;
    return Number(b);
  }

  const money = (v) => Math.round(signed(v)) / 100;

  // Scaled money { f1: signed unscaled, f2: scale } (e.g. {12345, 2} = 123.45).
  function amount(m) {
    if (!m || typeof m !== 'object') return 0;
    return round(signed(m.f1) * Math.pow(10, -(Number(m.f2) || 0)), Number(m.f2) || 0);
  }

  function decimal(d) {
    if (d === null || d === undefined) return 0;
    if (typeof d === 'object') return (Number(d.f1) || 0) * Math.pow(10, -(Number(d.f2) || 0));
    return Number(d) || 0;
  }

  const round = (n, p) => {
    const f = Math.pow(10, p == null ? 2 : p);
    return Math.round(n * f) / f;
  };

  const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const iso = (ms) => (ms && ms > 1e12 ? new Date(ms).toISOString() : null);

  // ---- Schema-drift detection -------------------------------------------
  // The mappers rely on stable protobuf field numbers. If XTB renumbers a
  // field, our named output silently shifts. We guard with invariants that
  // must hold for correctly-decoded data (verified live): P/L == value - cost,
  // equity == market value + free funds, etc. A broken invariant raises a
  // warning so the UI can flag a possibly-incomplete export instead of lying.
  let warnings = [];
  const warn = (m) => {
    if (warnings.indexOf(m) < 0) warnings.push(m);
  };
  const approx = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1 : tol);

  // ---- Retirement accounts (IKE / IKZE) ---------------------------------
  const RETIREMENT_TYPE = { 1: 'IKE', 2: 'IKZE' };
  function mapRetirementAccounts(frames) {
    const out = [];
    for (const fr of frames) {
      const list = arr(fr && fr.f1);
      for (const a of list) {
        out.push({
          bucket: RETIREMENT_TYPE[a.f1] || 'type' + a.f1,
          typeCode: a.f1,
          accountId: a.f3 && a.f3.f1,
          server: a.f3 && a.f3.f2,
        });
      }
    }
    return out;
  }

  // ---- Positions ---------------------------------------------------------
  // Each group: g.f2.f1.f1 = instrument, g.f2.f3 = per-symbol aggregate.
  function mapPositions(frames) {
    let best = null;
    let n = -1;
    for (const f of frames) {
      const c = Array.isArray(f.f2) ? f.f2.length : f.f2 ? 1 : 0;
      if (c > n) {
        n = c;
        best = f;
      }
    }
    if (!best || !best.f2) return [];
    const groups = arr(best.f2);
    const rows = [];
    for (const g of groups) {
      const inst = g.f2 && g.f2.f1 && g.f2.f1.f1;
      const agg = g.f2 && g.f2.f3;
      if (!inst || !agg) continue;
      const volume = round(decimal(agg.f1), 6);
      const marketValue = money(agg.f2);
      const cost = money(agg.f8);
      const netPL = money(agg.f3);
      if (typeof inst.f2 !== 'string') warn('positions: symbol is not a string — schema may have changed');
      if (!approx(marketValue - cost, netPL, Math.max(1, Math.abs(netPL) * 0.02)))
        warn('positions: P/L != marketValue - cost — field mapping may have changed');
      // Individual purchase tranches (lots) — useful for per-transaction analysis.
      const lotsRaw = arr(g.f2 && g.f2.f2);
      const lots = lotsRaw
        .map((l) => ({
          volume: l.f3 ? round(decimal(l.f3.f1), 6) : null,
          openTime: l.f3 ? iso(l.f3.f10) : null,
          marketValue: l.f2 ? money(l.f2.f5) : null,
          netPL: l.f2 ? money(l.f2.f1) : null,
          plPct: l.f2 ? l.f2.f2 : null,
        }))
        .filter((l) => l.volume != null);
      const openTimes = lots.map((l) => l.openTime).filter(Boolean).sort();
      rows.push({
        symbol: inst.f2,
        name: inst.f3,
        description: inst.f4,
        currency: inst.f8,
        instrumentId: inst.f1,
        logoUrl: inst.f5,
        volume,
        price: agg.f5,
        marketValue,
        cost,
        avgCost: volume ? round(cost / volume, 4) : null,
        netPL,
        plPct: agg.f4,
        swap: money(agg.f7),
        openTimeFirst: openTimes[0] || null,
        openTimeLast: openTimes[openTimes.length - 1] || null,
        lots,
      });
    }
    return rows;
  }

  // ---- Investment plans (saving.v2) --------------------------------------
  // Every frame is a full snapshot; root = frame.f1.f1 {f1[] plans, f2 P/L,
  // f4 total value}. v2 carries no currency and no holding price.
  function mapSavings(frames, currency) {
    let root = null;
    for (const f of frames) if (f && f.f1 && f.f1.f1 && f.f1.f1.f1) root = f.f1.f1;
    if (!root) return { totalValue: 0, totalPL: 0, currency: currency || null, plans: [] };
    const plans = arr(root.f1).map((p) => {
      const currentValue = amount(p.f5);
      const netPL = amount(p.f6 && p.f6.f1);
      return {
        planId: p.f1,
        accountNo: p.f2,
        name: p.f3,
        statusCode: p.f4,
        unbalanced: p.f9 === 1,
        invested: round(currentValue - netPL),
        currentValue,
        cash: amount(p.f7 && p.f7.f1),
        netPL,
        plPct: p.f6 && p.f6.f2,
        createdAt: iso(p.f12),
        updatedAt: iso(p.f13),
        holdings: arr(p.f10).map((h) => {
          const value = amount(h.f3);
          const cost = amount(h.f5);
          const hPL = amount(h.f4 && h.f4.f1);
          if (!approx(value - cost, hPL, Math.max(1, Math.abs(hPL) * 0.02)))
            warn('plans: holding P/L != value - cost — schema may have changed');
          return {
            symbol: h.f1 && h.f1.f3,
            name: h.f1 && h.f1.f2,
            instrumentId: h.f1 && h.f1.f1,
            currentPct: h.f2 && h.f2.f1,
            targetPct: h.f2 && h.f2.f2,
            cost,
            value,
            netPL: hPL,
            plPct: h.f4 && h.f4.f2,
          };
        }),
      };
    });
    const totalValue = amount(root.f4);
    const sumPlans = plans.reduce((s, p) => s + (p.currentValue || 0), 0);
    if (plans.length && !approx(sumPlans, totalValue, Math.max(2, totalValue * 0.01)))
      warn('plans: total value != sum of plans — schema may have changed');
    return {
      currency: currency || null,
      totalValue,
      totalPL: amount(root.f2 && root.f2.f1),
      plans,
    };
  }

  // ---- Account balance (IKE / IKZE) -------------------------------------
  function mapBalance(frames) {
    const b = frames[frames.length - 1] || {};
    const equity = money(b.f1);
    const marketValue = money(b.f3);
    const freeFunds = money(b.f4);
    if ((equity || marketValue) && !approx(equity, marketValue + freeFunds, 1))
      warn('balance: equity != market value + free funds — schema may have changed');
    return { equity, marketValue, pl: money(b.f2), freeFunds, currency: b.f6 };
  }

  window.__XTB_MAP = {
    signed,
    money,
    amount,
    decimal,
    round,
    RETIREMENT_TYPE,
    mapRetirementAccounts,
    mapPositions,
    mapSavings,
    mapBalance,
    resetWarnings() {
      warnings = [];
    },
    getWarnings() {
      return warnings.slice();
    },
    match(method) {
      if (/GetRetirementAccounts/.test(method)) return 'retirement';
      if (/SubscribePortfolioPositionGroups/.test(method)) return 'positions';
      if (/SubscribeInvestmentPlans/.test(method)) return 'savings';
      if (/GetAccountBalance/.test(method)) return 'balance';
      return 'other';
    },
  };
})();
