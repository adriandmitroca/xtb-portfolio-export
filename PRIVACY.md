# Privacy Policy — Portfolio Export for XTB

_Last updated: 2026-07-24_

This is an **unofficial** browser extension, not affiliated with, endorsed by, or
connected to X-Trade Brokers (XTB). It exists to let you export **your own**
portfolio data from the xStation web app for your own analysis.

## What it accesses

While you are logged into `https://xstation5.xtb.com/`, the extension reads the
portfolio data the page **already loads** over its own API (`ipax.xtb.com`,
gRPC-Web): your open positions, account balances, IKE/IKZE holdings, and
investment plans. To label each capture with the correct account (IKE / IKZE /
main), it reads **only the account-number claim** from the request's session
token, in memory.

## What it does with it

- **Nothing is transmitted.** There are no servers, no analytics, no third
  parties, no network calls made by the extension.
- Captured portfolio data is stored **only** in `chrome.storage.local` on your
  own device, so that switching accounts (which reloads the app) can accumulate
  every bucket before you export.
- Exports (JSON / CSV) are files **you** choose to save locally.

## What it never does

- It **never stores, exports, logs, or transmits** your session token, password,
  or any credential. The token's signature is never read; only the public
  account-number claim is inspected in memory and immediately discarded.
- It does not read any site other than `xstation5.xtb.com`.
- It does not sell or share any data (there is nothing to sell or share — no
  data ever leaves your device).

## Permissions

- **`storage`** — remember captured data between account switches, on your
  device only.
- **Host access to `xstation5.xtb.com`** — read the portfolio data the page
  loads, and add the export UI.

## Deleting your data

- Click **Clear** in the popup to erase all stored captures.
- Uninstalling the extension removes everything it stored.

## Contact

Open an issue on the project's repository.
