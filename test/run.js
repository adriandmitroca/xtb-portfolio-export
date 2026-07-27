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

// ---- savings / plans -----------------------------------------------------
{
  const sav = {
    f2: {
      f7: 'PLN',
      f8: 100000,
      f9: 500000,
      f5: [
        {
          f1: 1, f3: 'Growth', f4: 2, f9: 400000, f7: 500000, f5: 100000, f6: 25.0, f10: 10000,
          f13: [{ f1: { f1: 'TEST.UK' }, f2: 50.0, f3: 100, f4: 90000, f5: 22.5, f6: 400000, f7: 490000 }],
        },
      ],
    },
  };
  MAP.resetWarnings();
  const s = MAP.mapSavings([sav]);
  near(s.totalValue, 5000.0, 'plans total value');
  eq(s.plans.length, 1, 'one plan');
  eq(s.plans[0].name, 'Growth', 'plan name');
  near(s.plans[0].cash, 100.0, 'plan cash');
  near(s.plans[0].holdings[0].netPL, 900.0, 'holding netPL (value - cost)');
  eq(MAP.getWarnings().length, 0, 'plans invariant holds');
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
