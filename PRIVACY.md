# Privacy Policy — Portfolio Export for XTB

_Last updated: 2026-07-27_

This is an unofficial browser extension, not affiliated with or endorsed by
X-Trade Brokers (XTB). It lets you export your own portfolio from the xStation
web app for your own use.

The short version: everything happens in your browser. The extension has no
server, makes no network calls of its own, and sends your data nowhere.

## What it accesses

While you are signed in to `https://xstation5.xtb.com/`, the extension reads the
portfolio data the page already loads over XTB's own API (`ipax.xtb.com`,
gRPC-Web): open positions, account balances, IKE/IKZE holdings, and investment
plans.

To label each capture with the right account (IKE, IKZE, or main), it reads one
thing from the request's session token — the account-number claim — in memory.
Nothing else in the token is touched.

## What it does with it

Captured data is saved only in `chrome.storage.local` on your device. It stays
there so that switching accounts, which reloads the app, can build up the full
portfolio before you export. Exports are JSON or CSV files you choose to save
yourself. That is the whole flow, start to finish, on your machine.

## What it never does

It never stores, exports, logs, or transmits your session token, password, or
any credential. The token's signature is never read; the account number is
inspected in memory and dropped. It runs on no site other than
`xstation5.xtb.com`. And it does not sell your data, share it, use it for
anything unrelated to the export, or use it to judge creditworthiness — there is
nothing to sell or share, because nothing ever leaves your device.

## Permissions

- `storage` — keep captured data between account switches, on your device only.
- Host access to `xstation5.xtb.com` — read the portfolio the page loads, and
  add the export popup.

## Deleting your data

Click **Clear** in the popup to erase every stored capture. Uninstalling the
extension removes everything it kept.

## Changes

If this policy changes, the date at the top changes with it, and the new version
is committed to the public repository.

## Contact

Questions or concerns: open an issue at
<https://github.com/adriandmitroca/xtb-portfolio-export>.
