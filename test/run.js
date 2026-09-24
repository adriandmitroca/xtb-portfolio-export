// Zero-dependency test runner. Loads decode.js + mappers.js in a sandbox with a
// `window` shim and checks the decoder, the field mappers, and the schema-drift
// invariants (#5). All fixtures are synthetic. Run: node test/run.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWindow(files) {
  const sandbox = { window: {}, TextDecoder, DataView, BigInt, Math, Date, Number, Array, Object, JSON, Uint8Array, ArrayBuffer, console };
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
  return sandbox.window;
}

const root = path.join(__dirname, '..', 'extension', 'src');
const win = loadWindow([path.join(root, 'decode.js'), path.join(root, 'mappers.js')]);
const DEC = win.__XTB_DECODE;
const MAP = win.__XTB_MAP;

let pass = 0;
const fails = [];
const ok = (cond, msg) => (cond ? pass++ : fails.push(msg));
const eq = (a, b, msg) => ok(a === b, `${msg} (got ${a}, want ${b})`);
const near = (a, b, msg, tol) => ok(Math.abs(a - b) <= (tol || 0.001), `${msg} (got ${a}, want ${b})`);

// ---- protobuf/grpc-web encoders (test fixtures) -------------------------
function varint(n) {
  let bi = BigInt(n);
  if (bi < 0n) bi += 1n << 64n; // two's complement, like real protobuf
  const out = [];
  do {
    let b = Number(bi & 0x7fn);
    bi >>= 7n;
    if (bi > 0n) b |= 0x80;
    out.push(b);
  } while (bi > 0n);
  return out;
}
const tag = (field, wire) => varint((BigInt(field) << 3n) | BigInt(wire));
const vfield = (field, n) => [...tag(field, 0), ...varint(n)];
const lenDelim = (field, bytes) => [...tag(field, 2), ...varint(bytes.length), ...bytes];
const strField = (field, s) => lenDelim(field, [...Buffer.from(s, 'utf8')]);
const cat = (...parts) => [].concat(...parts);
function grpcFrame(bytes) {
  const len = bytes.length;
  return Uint8Array.from([0, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...bytes]);
}

// ---- decoder + signed/decimal -------------------------------------------
{
  const m = cat(vfield(1, 300), vfield(2, -2434), strField(3, 'TEST.DE'), lenDelim(4, cat(vfield(1, 7845), vfield(2, 4))));
  const d = DEC.dataFrames(grpcFrame(m)).map((f) => DEC.decode(f.payload))[0];
  eq(d.f1, 300, 'decode positive varint');
  eq(d.f3, 'TEST.DE', 'decode string');
  near(MAP.money(d.f2), -24.34, 'signed money handles negative varint');
  near(MAP.decimal(d.f4), 0.7845, 'decimal {unscaled,scale}');
}

// ---- positions: lots sum to aggregate, no false warnings ----------------
// Synthetic: 10 units, value 10000, cost 8000, so P/L 2000. Two lots (4 + 6).
const posGroup = {
  f2: {
    f1: { f1: { f1: 99001, f2: 'TEST.US', f3: 'Test Instrument', f4: 'TEST.US, Test Inc', f5: 'logo', f8: 'PLN' } },
    f2: [
      { f2: { f1: 120000, f2: 25.0, f5: 600000 }, f3: { f1: { f1: 40000, f2: 4 }, f10: 1700000000000 } },
      { f2: { f1: 80000, f2: 25.0, f5: 400000 }, f3: { f1: { f1: 60000, f2: 4 }, f10: 1700000100000 } },
    ],
    f3: { f1: { f1: 100000, f2: 4 }, f2: 1000000, f3: 200000, f4: 25.0, f5: 100.0, f7: 0, f8: 800000 },
  },
};
{
  MAP.resetWarnings();
  const rows = MAP.mapPositions([{ f2: [posGroup] }]);
  eq(rows.length, 1, 'one position');
  const r = rows[0];
  eq(r.symbol, 'TEST.US', 'position symbol');
  near(r.volume, 10.0, 'position volume');
  near(r.marketValue, 10000.0, 'position marketValue');
  near(r.cost, 8000.0, 'position cost');
  near(r.netPL, 2000.0, 'position netPL');
  eq(r.lots.length, 2, 'two lots');
  near(r.lots[0].volume + r.lots[1].volume, r.volume, 'lots sum to volume');
  near(r.lots[0].netPL + r.lots[1].netPL, r.netPL, 'lots sum to netPL', 0.02);
  ok(!!r.lots[0].openTime, 'lot has open time');
  eq(MAP.getWarnings().length, 0, 'no warnings for consistent data');
}

// ---- #5 schema drift: broken P/L invariant raises a warning -------------
{
  const bad = JSON.parse(JSON.stringify(posGroup));
  bad.f2.f3.f3 = 999999; // netPL no longer equals value - cost
  MAP.resetWarnings();
  MAP.mapPositions([{ f2: [bad] }]);
  ok(MAP.getWarnings().some((w) => /P\/L/.test(w)), 'warns when P/L != value - cost');
}

// ---- balance invariant ---------------------------------------------------
{
  MAP.resetWarnings();
  const b = MAP.mapBalance([{ f1: 1000000, f2: 200000, f3: 990000, f4: 10000, f6: 'PLN' }]);
  near(b.equity, 10000.0, 'balance equity');
  near(b.marketValue, 9900.0, 'balance marketValue');
  near(b.freeFunds, 100.0, 'balance freeFunds');
  eq(MAP.getWarnings().length, 0, 'balance invariant holds');
  MAP.resetWarnings();
  MAP.mapBalance([{ f1: 9999999, f2: 0, f3: 990000, f4: 10000, f6: 'PLN' }]);
  ok(MAP.getWarnings().some((w) => /equity/.test(w)), 'warns when equity != mv + free');
}

// ---- savings / plans (saving.v2) ----------------------------------------
// Synthetic: one plan worth 5000.00 = holding 4900.00 + cash 100.00; holding
// cost 4000.00, P/L 900.00. Second plan is at a loss (negative scaled money).
const amt = (v) => ({ f1: v, f2: 2 });
const planV2 = {
  f1: 1, f2: 50000009, f3: 'Growth', f4: 1, f9: 1,
  f5: amt(500000), f6: { f1: amt(90000), f2: 21.95 }, f7: { f1: amt(10000), f2: 2.0 },
  f10: [{ f1: { f1: 99002, f2: 'Test ETF', f3: 'TEST.UK', f4: 2 }, f2: { f1: 98.0, f2: 100 }, f3: amt(490000), f4: { f1: amt(90000), f2: 22.5 }, f5: amt(400000) }],
  f12: 1700000000000, f13: 1700000100000,
};
const lossPlan = {
  f1: 2, f3: 'Dip', f4: 1,
  f5: amt(9000), f6: { f1: amt(-1000), f2: -10 }, f7: { f1: amt(0), f2: 0 },
  f10: [{ f1: { f1: 99003, f2: 'Other', f3: 'OTHR.DE' }, f2: { f1: 100, f2: 100 }, f3: amt(9000), f4: { f1: amt(-1000), f2: -10 }, f5: amt(10000) }],
};
const savV2 = (plans, total, pl) => ({ f1: { f1: { f1: plans, f2: { f1: amt(pl), f2: 0 }, f4: amt(total) } } });
{
  // Round-trip the negative scaled money through the real decoder.
  const d = DEC.decode(Uint8Array.from(lenDelim(1, cat(vfield(1, -1000), vfield(2, 2)))));
  near(MAP.amount(d.f1), -10.0, 'signed scaled money handles negative unscaled');

  MAP.resetWarnings();
  const s = MAP.mapSavings([savV2([], 0, 0), savV2([planV2, lossPlan], 509000, 89000)], 'PLN');
  near(s.totalValue, 5090.0, 'plans total value (last frame wins)');
  near(s.totalPL, 890.0, 'plans total P/L');
  eq(s.currency, 'PLN', 'plans currency comes from the account');
  eq(s.plans.length, 2, 'two plans');
  const p = s.plans[0];
  eq(p.name, 'Growth', 'plan name');
  eq(p.accountNo, 50000009, 'plan account number');
  eq(p.unbalanced, true, 'plan unbalanced flag');
  near(p.currentValue, 5000.0, 'plan value');
  near(p.cash, 100.0, 'plan cash');
  near(p.invested, 4100.0, 'plan invested = value - P/L');
  ok(!!p.createdAt && !!p.updatedAt, 'plan timestamps');
  const h = p.holdings[0];
  eq(h.symbol, 'TEST.UK', 'holding symbol');
  eq(h.name, 'Test ETF', 'holding name');
  near(h.currentPct, 98.0, 'holding current %');
  near(h.targetPct, 100, 'holding target %');
  near(h.value, 4900.0, 'holding value');
  near(h.cost, 4000.0, 'holding cost');
  near(h.netPL, 900.0, 'holding netPL');
  near(h.value + p.cash, p.currentValue, 'holdings + cash = plan value');
  near(s.plans[1].netPL, -10.0, 'loss plan negative P/L');
  eq(s.plans[1].unbalanced, false, 'plan without f9 is balanced');
  eq(MAP.getWarnings().length, 0, 'plans invariants hold');

  MAP.resetWarnings();
  MAP.mapSavings([savV2([planV2], 999999, 900)], 'PLN');
  ok(MAP.getWarnings().some((w) => /total value/.test(w)), 'warns when plan total != sum of plans');

  eq(MAP.match('pl.xtb.ipax.pub.grpc.investmentplan.saving.v2.InvestmentPlanService/SubscribeInvestmentPlans'), 'savings', 'v2 plans method routes to savings');
  eq(MAP.match('pl.xtb.ipax.pub.grpc.investmentplan.assignment.v1.InvestmentPlanFlagsService/SubscribeInvestmentPlanFlags'), 'other', 'plan flags stream is ignored');
}

// ---- retirement accounts -------------------------------------------------
{
  const r = MAP.mapRetirementAccounts([{ f1: [{ f1: 1, f3: { f1: 50000001, f2: 'SRV1' } }, { f1: 2, f3: { f1: 50000002, f2: 'SRV1' } }] }]);
  eq(r.length, 2, 'two retirement accounts');
  eq(r[0].bucket, 'IKE', 'type 1 -> IKE');
  eq(r[1].bucket, 'IKZE', 'type 2 -> IKZE');
  eq(r[0].accountId, 50000001, 'IKE account id');
}

// ---- report --------------------------------------------------------------
if (fails.length) {
  console.error(`\n${fails.length} FAILED:`);
  fails.forEach((f) => console.error('  ✗ ' + f));
  console.error(`\n${pass} passed, ${fails.length} failed`);
  process.exit(1);
}
console.log(`✓ all ${pass} assertions passed`);
