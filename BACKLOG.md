# Backlog

## Deferred (by request)

- [ ] **Landing page + GitHub Pages** — a small marketing/docs site for the tool
      that also hosts `PRIVACY.md` at a public URL (needed for the Web Store
      listing). Kills two birds: marketing + privacy-policy hosting. _Deferred
      2026-07-25; do after the first release._

## Deferred — closed positions / cash operations / dividends

Fully diagnosed; deferred because it needs a cross-origin iframe injection +
a new permission, and XTB's terminal already has a native **Export** button for
exactly this data.

**Findings (verified live):**
- This data is on **ipax gRPC** (same protocol we decode), NOT the worker socket
  (that only carries live quotes/charts, and isn't needed — open positions come
  from `PositionService`).
- Services: `PortfolioClosedPositionService/GetClosedPositions` (+ NetProfit /
  Filters / SubscribeToClosedPositionEvent) and
  `PortfolioCashOperationService/GetCashOperations` (+ same siblings).
- **The blocker:** the terminal (Historia view) runs inside a **cross-origin
  iframe `https://xcontainer.xtb.com/`**, so its ipax calls originate there. The
  extension only injects into `xstation5.xtb.com`, so `inject.js` never patches
  that iframe's `fetch` and the calls aren't captured (confirmed: the request
  fires 200 but never reaches `__XTB_DEBUG`).

_The partial routing (ALLOW entries + mapper keys + collection) was reverted to
keep the 1.0 release clean; re-add it together with the iframe injection below._

**To finish:**
1. Add `https://xcontainer.xtb.com/*` to `content_scripts.matches` +
   `host_permissions`, and set `"all_frames": true` so `inject.js` (MAIN) and
   `content.js` (ISOLATED) run in the iframe too.
2. `content.js` already persists to the shared `chrome.storage.local`, so the
   iframe instance's captures merge automatically; verify no double-counting.
3. One calibration read of `__XTB_DEBUG['...GetClosedPositions']` /
   `GetCashOperations` → write named field mappers + `Closed positions CSV` /
   `Cash operations CSV` exports + tests. Optionally teach `captureAll` to open
   the terminal's Historia tabs.
4. The extra `xcontainer.xtb.com` host permission must be disclosed in the store
   listing / PRIVACY.md.

## Refactors (deferred from /simplify — behavior-affecting, not worth the risk pre-1.0)

- **Opaque bucket IDs.** `content.js` uses English display strings (`My
  Transactions`, `Investment Plans`) as the canonical bucket keys that flow
  through storage and CSV exports, so `popup.js` keeps a parallel translation
  table to re-map them for i18n. A cleaner design emits stable IDs (`main`,
  `plans`, `IKE`, `IKZE`) from the data layer and lets the popup own every
  label. Skipped for now: it changes stored keys and export column values.
- **Single method registry.** The set of captured gRPC methods is declared in
  three shapes — `inject.js` `ALLOW`, `mappers.js` `match()`, `content.js`
  `ingest` branches. Deriving all three from one `method → key → mapper` table
  would stop them drifting. Skipped: touches all three files with no user-facing
  win.

## Ideas (not scheduled)

- Auto-snapshot in the background (alarms) to build history without manual clicks
- "What changed since last capture" diff
- Copy-to-clipboard / XLSX export
- Options page (default format, capture dwell time)
- Firefox port (same MV3)
- Benchmark comparison (vs S&P 500 etc.)
