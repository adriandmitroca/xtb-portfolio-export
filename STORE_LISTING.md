# Chrome Web Store — every field, paste-ready

Chrome blocks extensions from scripting the Web Store, so the Dashboard form must
be filled by hand. Everything you need is below: copy each value into the matching
field, upload the listed asset files. English is the default listing; a Polish
locale is included (add it under **Store listing → + Add language**).

> **Naming:** the visible name is **“Portfolio Export for XTB”** (no “unofficial”
> in the name — cleaner, and Google allows the descriptive “for XTB”). The
> required “unofficial / not affiliated” disclaimer lives in the description,
> the popup footer and the screenshots.

---

## Package to upload

`dist/xtb-portfolio-export-1.0.0.zip`  (rebuild with `scripts/build.sh`)

---

# STORE LISTING tab

### Name
- **EN:** `Portfolio Export for XTB`
- **PL:** `Portfolio Export dla XTB`

### Summary (short description, ≤ 132 chars)
- **EN:**
  ```
  Save your XTB (xStation) portfolio to JSON or CSV: positions, P&L, IKE, IKZE, plans and history. Unofficial, runs 100% locally.
  ```
- **PL:**
  ```
  Zapisz portfel XTB (xStation) do JSON lub CSV: pozycje, zysk/strata, IKE, IKZE, plany i historia. Nieoficjalne, działa lokalnie.
  ```

### Category
`Productivity`  (alternative: `Developer Tools`)

### Language
Default: **English**. Add **Polish** as a second locale for the PL fields above/below.

### Detailed description
- **EN:**
  ```
  Portfolio Export for XTB is an unofficial add-on that saves your xStation
  portfolio as JSON or CSV, so you can work with it in a spreadsheet or your own
  tools.

  What one capture gives you:
  • Open positions with P&L, average cost, and each purchase lot (date, size, result)
  • IKE, IKZE and single-buy accounts, kept separate
  • Investment Plans, with each holding's allocation, value and return
  • A summary per account and for the whole portfolio (holdings plus free cash)
  • Portfolio value day by day, which you can export as CSV

  You can download a full JSON report, or CSV files for positions, plans and
  history. The interface is English and Polish, and follows your browser language.

  It runs entirely in your browser. There are no servers and no network calls.
  Your session token is never stored or sent anywhere; the extension only reads
  the account number from it, in memory, to tell the accounts apart. Exports are
  plain files you save yourself.

  Why it exists: XTB closed its public API in 2025. This reads the data the
  xStation web app already loads once you're signed in, and lets you export it.
  No API key, no second login.

  Not affiliated with or endorsed by XTB. The name "XTB" only says what the tool
  works with. Use it with your own account, at your own risk.
  ```
- **PL:**
  ```
  Portfolio Export for XTB to nieoficjalny dodatek, który zapisuje Twój portfel
  z xStation jako JSON lub CSV, żebyś mógł pracować z nim w arkuszu lub własnych
  narzędziach.

  Co daje jedno przechwycenie:
  • Otwarte pozycje z zyskiem/stratą, średnim kosztem i każdą transzą zakupu
    (data, wielkość, wynik)
  • Konta IKE, IKZE i zwykłe zakupy, trzymane osobno
  • Plany Inwestycyjne z alokacją, wartością i wynikiem każdego składnika
  • Podsumowanie per konto i dla całego portfela (pozycje plus wolne środki)
  • Wartość portfela dzień po dniu, do eksportu jako CSV

  Możesz pobrać pełny raport JSON albo pliki CSV dla pozycji, planów i historii.
  Interfejs jest po polsku i angielsku, zależnie od języka przeglądarki.

  Działa w całości w Twojej przeglądarce. Bez serwerów i bez połączeń sieciowych.
  Token sesji nigdy nie jest zapisywany ani nigdzie wysyłany; dodatek czyta z niego
  tylko numer konta, w pamięci, żeby rozróżnić konta. Eksporty to zwykłe pliki,
  które zapisujesz sam.

  Dlaczego powstało: XTB zamknęło publiczne API w 2025. To narzędzie czyta dane,
  które aplikacja xStation i tak ładuje po zalogowaniu, i pozwala je wyeksportować.
  Bez klucza API, bez drugiego logowania.

  Niepowiązane z XTB ani przez nie wspierane. Nazwa „XTB" mówi tylko, z czym dodatek
  współpracuje. Używasz na własnym koncie i na własną odpowiedzialność.
  ```

### Graphic assets (upload)
| Field | Size | File |
| --- | --- | --- |
| Store icon | 128×128 | `store-assets/store-icon-128.png` |
| Screenshot 1 | 1280×800 | `store-assets/screenshot-1.png` (EN) · `store-assets/screenshot-pl-1.png` (PL) |
| Screenshot 2 | 1280×800 | `store-assets/screenshot-2.png` (EN) · `store-assets/screenshot-pl-2.png` (PL) |
| Screenshot 3 | 1280×800 | `store-assets/screenshot-3.png` (EN) · `store-assets/screenshot-pl-3.png` (PL) |
| Small promo tile (optional) | 440×280 | `store-assets/promo-440x280.png` |
| Marquee promo tile (optional) | 1400×560 | `store-assets/marquee-1400x560.png` |

**Localized screenshots:** screenshots are per-locale. Upload the English set to
the default (English) listing and the Polish set (`screenshot-pl-*`) to the Polish
locale. If you skip the Polish screenshots, the Polish locale simply falls back to
the English ones — the extension UI still shows in the viewer's language.

---

# PRIVACY tab

### Single purpose
```
Export the signed-in user's own XTB xStation portfolio to local JSON/CSV files
for personal analysis.
```

### Permission justifications
- **storage** — Persist captured portfolio data locally between account switches
  (switching xStation accounts reloads the app), so the whole portfolio can be
  exported at once. Never leaves the device.
- **Host permission `https://xstation5.xtb.com/*`** — Read the portfolio data the
  page already loads and add the export popup. This is the only site the extension
  runs on.

### Are you using remote code?
**No** — all logic ships inside the package; nothing is fetched or eval'd.

### Data usage
Recommended (accurate) answer: **the extension does not collect or transmit user
data.** All portfolio data is processed on the user's device and written to local
files; there are no servers and no network requests.

Certifications (check all three — all true):
- I do **not** sell or transfer user data to third parties (outside approved uses).
- I do **not** use or transfer user data for purposes unrelated to the single purpose.
- I do **not** use or transfer user data to determine creditworthiness / for lending.

_If the form makes you pick a data type because the extension reads financial
holdings, select “Financial and payment information” and keep the three
certifications — nothing is transmitted either way._

### Privacy policy URL
The repo is public, so `PRIVACY.md` is already hosted. Paste:

```
https://github.com/adriandmitroca/xtb-portfolio-export/blob/main/PRIVACY.md
```

---

# DISTRIBUTION tab

- **Visibility:** start **Unlisted** (shake out review feedback), switch to
  **Public** once approved and you're happy.
- **Pricing:** Free.
- **Regions:** All regions.

---

## Trademark note for review

Using “XTB” descriptively (“for XTB”) is allowed; do not imply you are XTB or are
endorsed by them. The name avoids their logo/red-X wordmark (the icon is a ledger
page with an export arrow, and carries none of XTB’s brand colours), and the
description states “unofficial / not affiliated with XTB”.
Reviewers may also ask about the token read — it only inspects the non-secret
account-number claim in memory and transmits nothing (documented in `PRIVACY.md`).
