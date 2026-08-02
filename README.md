# GeoMeta Map

A local GeoGuessr study tool. An interactive world map where you file the clues you
learn — license plates, bollards, road lines, scripts — per country, with screenshots,
and review them on the map over time.

Everything runs on your own machine. No account, no cloud, and the map needs no tile
provider or API key. Your notes live in a plain `data/` folder you can copy to back up.

- Only countries with Street View coverage are clickable; hover to highlight, click to
  open its notes.
- Countries are coloured by **driving side** (blue = right, violet = left) and by
  **coverage tier** (full vs. limited).
- Notes hold **Markdown + pasted screenshots**, and can apply to a whole country or to
  specific regions/prefectures.
- A **country ID card** shows the constants at a glance: domain, phone code, currency,
  driving side, language — plus the **alphabet** (`ก ข ค` for Thailand, `ő ű` for Hungary).
  You can paste in your own alphabet chart per country.
- **Tags** and a **By category** map mode: pick "license plates" and every country you
  have a plate note for lights up — and expands into a list of exactly which ones, so
  nothing gets overlooked. A tag can carry **two colours**, because most plate and sign
  clues are a pair (yellow on black, blue on white).
- Optional **road overlay** shows where roads actually are (Peru's roads hug the coast;
  the Amazon is empty).
- UI in **English or 日本語** (Settings → 🌐).
- **Study mode** (press `F`) hides the text so you can quiz yourself on the images.

---

## Run it

**Requirements:** [Node.js 18 or newer](https://nodejs.org/) and npm. That's it.

```bash
npm install
```
```bash
npm run dev
```

Then open **http://localhost:5173**.

That's development mode, with hot reload. For everyday use, build it once and run it on
a single port instead:

```bash
npm run build
```
```bash
npm start
```

Then open **http://127.0.0.1:5174**. The server binds to localhost only — it is not
exposed to your network, and there is no login.

> **Switched Node versions?** `better-sqlite3` is a compiled module tied to one Node
> ABI, so `npm start` will complain about `NODE_MODULE_VERSION`. One command fixes it:
> `npm rebuild better-sqlite3`.

### Windows: a version that needs no Node at all

`npm run package` produces `release/GeoMetaMap-win64.zip` (~35 MB) — a self-contained
folder with Node bundled inside. Unzip it, double-click **GeoMetaMap.cmd**, and the app
opens in your browser. Nothing gets installed; everything lives in that folder. Handy for
sharing with someone who doesn't develop.

Add `-- --with-data` to include a copy of your own notes in the package:

```bash
npm run package -- --with-data
```

---

## Your notes

Everything you write lives in `data/`:

```
data/
  app.db      SQLite database (notes, categories, tags, settings)
  images/     your screenshots
```

You don't need to create it — the app builds a fresh database on first run. A new
install starts with the map, 12 default categories and the built-in alphabet samples,
and no notes. `data/` is git-ignored, so it never ends up in a commit.

**To back up**, copy that folder. Or use **Settings → Export backup (.zip)**, which
bundles the database and images into one file; **Import backup…** restores it (your
current data is copied to a `data-backup-…` folder first, so importing is never
destructive).

Upgrading is safe: the database migrates itself on start, and existing notes are never
rewritten.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl/⌘ + K` | Search countries |
| `F` | Study mode |
| `Ctrl/⌘ + Enter` | Save the note you're editing |
| `Esc` | Close whatever is on top |

## Regenerating the map data (optional)

The borders in `public/geo/` are generated and committed, so a clone runs immediately.
You only need this if you want to change the source data or the simplification:

```bash
npm run geodata
```

Downloads Natural Earth admin-0 / admin-1 / roads, simplifies them with mapshaper, and
rewrites `public/geo/`. Downloaded archives are cached in `scratch/`.

Natural Earth's 50m country layer drops the smallest dependencies, so a few places that
do have Street View would otherwise have no polygon at all. `prepare-geodata.mjs`
backfills those from the 10m data — add to its `SUPPLEMENT` list if you find another.

---

## Credits and licences

The **code** is MIT — see [LICENSE](LICENSE). Bundled data and libraries keep their own:

| Source | Used for | Licence |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) | country + region borders, roads | Public domain |
| [mledoze/countries](https://github.com/mledoze/countries) | domains, calling codes, currencies, country names | **ODbL v1.0** |
| [MapLibre GL JS](https://maplibre.org/) | map rendering | BSD-3-Clause |
| [flag-icons](https://github.com/lipis/flag-icons) | flags | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | sanitising note Markdown | Apache-2.0 |

`src/data/country-facts.json` is derived from mledoze/countries and so stays under
**ODbL**, not MIT. The code that reads it is unaffected.

The **Street View coverage overlay** (Settings → Experimental, **off by default**) reads
an undocumented Google endpoint. It's useful for studying, but it isn't a supported API,
it may stop working at any time, and it's intended for personal use. Nothing else in the
app talks to the network.

A personal study tool — not affiliated with or endorsed by GeoGuessr.
