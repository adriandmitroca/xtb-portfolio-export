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
3. **Every update after that — automated:** bump `version` in
   `extension/manifest.json`, commit, then push a matching tag:

   ```sh
   git tag v0.3.1 && git push origin v0.3.1
   ```

   The `Release` GitHub Action builds the zip and publishes the new version to
   the Store. No manual upload again.

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
- **`.github/workflows/release.yml`** — on a `v*` tag: verifies the tag matches
  the manifest version, builds the zip, and publishes it to the Chrome Web Store
  via the [`mnao305/chrome-extension-upload`] action.

### One-time secret setup

The `Release` workflow needs four repository secrets
(**Settings → Secrets and variables → Actions**):

| Secret | Where it comes from |
| --- | --- |
| `CHROME_EXTENSION_ID` | The item's ID, shown in the Dashboard after the first manual upload. |
| `CHROME_CLIENT_ID` | Google Cloud OAuth 2.0 **Desktop** client. |
| `CHROME_CLIENT_SECRET` | …same OAuth client. |
| `CHROME_REFRESH_TOKEN` | Generated once via the OAuth consent flow (below). |

Steps:

1. **Create the item** with one manual upload → copy the **extension ID**.
2. In **Google Cloud Console**: create a project → enable the **Chrome Web Store
   API** → **OAuth consent screen** (External, add yourself as a test user) →
   **Credentials → Create OAuth client ID → Desktop app**. Copy the client ID and
   secret.
3. **Get a refresh token** (scope `https://www.googleapis.com/auth/chromewebstore`):
   open the consent URL with your client ID, approve, exchange the returned code
   for a refresh token. The action's
   [README](https://github.com/mnao305/chrome-extension-upload#how-to-get-the-keys)
   walks through the exact `curl` calls.
4. Add the four values as repository secrets.

### Cutting a release

```sh
# bump extension/manifest.json "version", commit, then:
git tag v0.3.1
git push origin v0.3.1
```

Notes:
- The tag and `manifest.json` version must match, or the workflow fails fast.
- `publish: true` submits the new version for review immediately. Set it to
  `false` in `release.yml` if you'd rather upload a draft and click Publish
  yourself.
- For extra supply-chain safety, pin the publish action to a commit SHA instead
  of `@v5.0.0`.

[`mnao305/chrome-extension-upload`]: https://github.com/mnao305/chrome-extension-upload

## Versioning

Bump `version` in `extension/manifest.json` (semver) before each upload; the
Store rejects re-uploads of an existing version number. The `Release` workflow
enforces that the git tag equals the manifest version.
