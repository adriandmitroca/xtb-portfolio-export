# Release & distribution

## Build a package

```sh
scripts/build.sh          # -> dist/xtb-portfolio-export-<version>.zip
```

The zip contains the `extension/` folder contents (manifest at the root), ready
to upload to the Chrome Web Store or to load unpacked.

## Release plan

1. **Now — personal use:** load unpacked. No account, no review.
2. **First store submission (manual, one-time):** create the item in the
   Developer Dashboard, upload the zip, fill the listing (below), submit for
   review. This must be manual — it's what creates the extension ID and accepts
   the data-use disclosures. Start **Unlisted** to shake out review feedback,
   then flip to **Public** once it's approved and you're happy.
3. **Every update after that — automated:** merge conventional commits to
   `main`. The `Release` workflow picks the next version and publishes it (see
   [Automated releases](#automated-releases-cicd)).

## Options, simplest first

### 1. Load unpacked (personal use)
`chrome://extensions` → Developer mode → **Load unpacked** → `extension/`.
Zero cost, nothing to review. Best if it's just for you.

### 2. Chrome Web Store — Unlisted
Published, but only reachable via a direct link (not searchable). Good for
sharing with a few people without a public listing. Still goes through review.

### 3. Chrome Web Store — Public
Searchable listing. Most review scrutiny.

## Chrome Web Store checklist

- [ ] **Developer account** — one-time \$5 registration at the
      [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
- [ ] **Name / trademark** — using “XTB” **descriptively** is allowed (like the
      many “… for Gmail / Notion / YouTube” extensions) as long as you don’t imply
      endorsement. Ship name: **“Portfolio Export for XTB (unofficial)”**, with
      “unofficial / not affiliated with XTB” in the description. Do **not** use
      XTB’s logo or red-X wordmark in the icon (the shipped icon is a generic
      chart glyph). Implying you *are* XTB, or official, is the rejection risk —
      naming what you’re compatible with is not.
- [ ] **Single purpose** — state it plainly: *“Export the signed-in user’s own
      xStation portfolio to JSON/CSV files.”*
- [ ] **Permissions justification**
      - `storage` — persist captured portfolio data locally between account
        switches.
      - host `https://xstation5.xtb.com/*` — read the portfolio data the page
        loads and add the export UI.
- [ ] **Privacy policy URL** — host `PRIVACY.md` at a public URL (e.g. a public
      GitHub repo, GitHub Pages, or a Gist) and link it in the listing. Required
      because the extension handles financial/personal data.
- [ ] **Data-use disclosures** (in the dashboard’s Privacy tab)
      - Collects: “Financial and payment information” (portfolio holdings).
      - Not sold to third parties. Not used/transferred for anything unrelated
        to the single purpose. Not used for creditworthiness/lending.
      - Because nothing leaves the device, these are all easy to answer honestly.
- [ ] **Assets** — 128×128 icon (`extension/icons/icon128.png`) and three ready
      1280×800 screenshots in `store-assets/screenshot-{1,2,3}.png`. Optionally a
      440×280 small promo tile. Regenerate every asset from its HTML template
      with `scripts/render-assets.sh`; regenerate the icons with
      `node scripts/generate-icons.js`.
- [ ] **Review note (optional but wise)** — proactively explain that the
      extension reads only the account-number claim from the session token, in
      memory, and transmits nothing. This preempts questions about token access.

## Notes on review risk

- Reading a value from the session token can draw reviewer attention. The
  mitigations: it is read only in memory, only the account-number claim, never
  stored/exported, and there are no network calls at all. `PRIVACY.md` documents
  this.
- Keeping the host permission narrow (only `xstation5.xtb.com`) and permissions
  minimal (`storage` only) helps.

## Automated releases (CI/CD)

Two GitHub Actions workflows are included:

- **`.github/workflows/ci.yml`** — on every push/PR: validates the manifest,
  `node --check`s all scripts, fails on Unicode noncharacters (which Chrome's
  content-script loader rejects), builds the zip, and uploads it as an artifact.
- **`.github/workflows/release.yml`** — on every push to `main`: runs the
  tests, then [semantic-release] (`.releaserc.json`) reads the conventional
  commits since the last `v*` tag and picks the next version:

  | Commit | Release |
  | --- | --- |
  | `fix: …` | patch (1.1.0 → 1.1.1) |
  | `feat: …` | minor (1.1.0 → 1.2.0) |
  | `feat!: …` or a `BREAKING CHANGE:` footer | major (1.1.0 → 2.0.0) |
  | `docs:`, `chore:`, `ci:`, `test:`, `refactor:`, `style:` | none |

  When a release is due it writes the version into `extension/manifest.json`,
  commits it back as `chore(release): X.Y.Z [skip ci]`, tags `vX.Y.Z`, creates
  a GitHub Release with the zip, and uploads + publishes the zip to the Chrome
  Web Store via [`mnao305/chrome-extension-upload`] (Web Store API v2). Run
  `git pull` after a release to pick up the version commit.

### One-time secret setup

The `Release` workflow needs five repository secrets
(**Settings → Secrets and variables → Actions**, or `gh secret set NAME`):

| Secret | Where it comes from |
| --- | --- |
| `CHROME_EXTENSION_ID` | The item's ID, shown in the Dashboard after the first manual upload. |
| `CHROME_PUBLISHER_ID` | Developer Dashboard → **Publisher → Settings**. |
| `CHROME_CLIENT_ID` | Google Cloud OAuth 2.0 **Desktop** client. |
| `CHROME_CLIENT_SECRET` | …same OAuth client. |
| `CHROME_REFRESH_TOKEN` | Generated once via the OAuth consent flow (below). |

Steps:

1. **Create the item** with one manual upload → copy the **extension ID**.
2. In **Google Cloud Console**: create a project → enable the **Chrome Web Store
   API** → **OAuth consent screen** (External, add yourself as a test user,
   then set the publishing status to **In production** — in *Testing* the
   refresh token expires after 7 days) → **Credentials → Create OAuth client
   ID → Desktop app**. Copy the client ID and secret.
3. **Get a refresh token** (scope `https://www.googleapis.com/auth/chromewebstore`):
   open
   `https://accounts.google.com/o/oauth2/auth?response_type=code&access_type=offline&prompt=consent&scope=https://www.googleapis.com/auth/chromewebstore&redirect_uri=http://localhost:8818&client_id=CLIENT_ID`,
   approve, copy `code` from the failed `localhost` redirect, then exchange it:

   ```sh
   curl -s https://oauth2.googleapis.com/token -d client_id=CLIENT_ID \
     -d client_secret=CLIENT_SECRET -d code=CODE \
     -d grant_type=authorization_code -d redirect_uri=http://localhost:8818
   ```

4. Add the five values as repository secrets.

### When the store upload fails

The tag and GitHub Release already exist, so a normal re-run releases nothing.
Fix the cause, then **Actions → Release → Run workflow** with `republish` set to
the version (e.g. `1.1.1`). It rebuilds from that tag and uploads it again.

Notes:
- `publish: true` submits the new version for review immediately. Set it to
  `false` in `release.yml` to upload a draft and click Publish yourself.
- Both third-party actions are pinned to commit SHAs.

[semantic-release]: https://semantic-release.gitbook.io
[`mnao305/chrome-extension-upload`]: https://github.com/mnao305/chrome-extension-upload

## Versioning

Do not edit `version` in `extension/manifest.json` by hand — semantic-release
owns it. The commit type decides the next version (table above).
