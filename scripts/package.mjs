// Portable Windows build.
//
//   npm run package              -> release/GeoMetaMap-win64.zip  (empty data/)
//   npm run package -- --with-data  -> same, but with a COPY of your clues
//
// Produces a folder a friend can unzip and run by double-clicking one file:
// Node is bundled inside, there is nothing to install, and all state lives in
// the folder's own data/ directory.
//
// DATA RULE: --with-data COPIES data/. It never moves, deletes or writes to the
// original — the script verifies the source is byte-identical afterwards.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const AdmZip = require('adm-zip');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.join(ROOT, 'scratch');
const RELEASE = path.join(ROOT, 'release');
const OUT = path.join(RELEASE, 'GeoMetaMap');

const WITH_DATA = process.argv.includes('--with-data');
const NODE_MAJOR = process.versions.node.split('.')[0];

const log = (...a) => console.log('[package]', ...a);
const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';

function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  if (!fs.existsSync(dir)) return { files, bytes };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const s = dirStats(p);
      files += s.files;
      bytes += s.bytes;
    } else {
      files++;
      bytes += fs.statSync(p).size;
    }
  }
  return { files, bytes };
}

// ---- 1. frontend + server bundle -------------------------------------------

function buildFrontend() {
  log('vite build …');
  execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
}

async function bundleServer() {
  log('bundling server -> server.cjs …');
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'server', 'index.ts')],
    outfile: path.join(OUT, 'server.cjs'),
    platform: 'node',
    target: `node${NODE_MAJOR}`,
    format: 'cjs',
    bundle: true,
    minify: false, // keep stack traces readable if a friend has to send us one
    // better-sqlite3 has a native .node binding that can't be bundled; it's
    // copied next to the output and resolved from there at runtime.
    external: ['better-sqlite3'],
    // the ESM sources use import.meta.url; give CJS an equivalent
    banner: { js: 'const import_meta_url = require("url").pathToFileURL(__filename).href;' },
    define: { 'import.meta.url': 'import_meta_url' },
    logLevel: 'warning',
  });
}

/**
 * better-sqlite3 resolves its binding by walking its own package layout, so we
 * ship a minimal copy of the package (JS + the prebuilt .node) rather than the
 * bare binding, and require it normally.
 */
function copySqlite() {
  const src = path.join(ROOT, 'node_modules', 'better-sqlite3');
  const dst = path.join(OUT, 'node_modules', 'better-sqlite3');
  fs.mkdirSync(dst, { recursive: true });
  for (const rel of ['package.json', 'lib']) {
    fs.cpSync(path.join(src, rel), path.join(dst, rel), { recursive: true });
  }
  const binding = path.join(src, 'build', 'Release', 'better_sqlite3.node');
  const bindingDst = path.join(dst, 'build', 'Release', 'better_sqlite3.node');
  fs.mkdirSync(path.dirname(bindingDst), { recursive: true });
  fs.copyFileSync(binding, bindingDst);
  log(`better-sqlite3 binding: ${mb(fs.statSync(binding).size)}`);
}

// ---- 2. bundled Node --------------------------------------------------------

async function fetchNodeExe() {
  const ver = process.version; // e.g. v18.20.8 — pin to what we're tested on
  const name = `node-${ver}-win-x64`;
  const zipPath = path.join(SCRATCH, `${name}.zip`);
  fs.mkdirSync(SCRATCH, { recursive: true });

  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1000) {
    const url = `https://nodejs.org/dist/${ver}/${name}.zip`;
    log('downloading', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Node download failed: ${res.status} ${url}`);
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  } else {
    log('cached:', path.basename(zipPath));
  }

  const zip = new AdmZip(zipPath);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith('/node.exe'));
  if (!entry) throw new Error('node.exe not found inside the Node zip');
  fs.writeFileSync(path.join(OUT, 'node.exe'), entry.getData());
  log(`node.exe: ${mb(fs.statSync(path.join(OUT, 'node.exe')).size)} (${ver})`);
}

// ---- 3. assemble ------------------------------------------------------------

// ASCII-only on purpose: a .cmd file with non-ASCII bytes renders as mojibake in
// the console's OEM codepage. All Japanese text is printed by node instead — and
// `chcp 65001` switches the console to UTF-8 first, otherwise that Japanese line
// is itself mojibake on a default (932/850) codepage.
const CMD = `@echo off
chcp 65001 >nul
title GeoMeta Map
cd /d "%~dp0"
set GEOMETA_PACKAGED=1
set NODE_ENV=production
"%~dp0node.exe" "%~dp0server.cjs"
if errorlevel 1 (
  echo.
  echo GeoMeta Map stopped unexpectedly.
  pause
)
`;

const GUIDE_JA = `GeoMeta Map — はじめかた

1. このZIPを右クリックして「すべて展開」を選びます。
   （ZIPの中から直接ひらくと動きません）
2. 出てきたフォルダーの「GeoMetaMap.cmd」をダブルクリックします。
3. 「WindowsによってPCが保護されました」と出たら、
   「詳細情報」→「実行」を押します。
4. ブラウザーが自動でひらきます。
   ひらかないときは、黒い画面に出ているアドレスをひらいてください。
5. 終わるときは、黒い画面を閉じます。
6. メモと画像は「data」フォルダーの中にあります。
   バックアップはこのフォルダーをコピーするだけです。
`;

const GUIDE_EN = `GeoMeta Map — Start here

1. Right-click this ZIP and choose "Extract All".
   (Running it from inside the ZIP will not work.)
2. Open the extracted folder and double-click "GeoMetaMap.cmd".
3. If Windows shows "Windows protected your PC",
   click "More info" then "Run anyway".
4. Your browser opens by itself.
   If it doesn't, open the address shown in the black window.
5. To quit, close the black window.
6. Your notes and images live in the "data" folder.
   To back them up, just copy that folder.
`;

/** Notepad needs a BOM to read UTF-8 Japanese correctly. */
function writeUtf8Bom(file, text) {
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]));
}

function assemble() {
  fs.cpSync(path.join(ROOT, 'dist'), path.join(OUT, 'dist'), { recursive: true });

  // seed JSON the server reads on first run
  const seedOut = path.join(OUT, 'seed');
  fs.mkdirSync(seedOut, { recursive: true });
  for (const f of ['categories.seed.json', 'coverage.seed.json']) {
    fs.copyFileSync(path.join(ROOT, 'src', 'data', f), path.join(seedOut, f));
  }

  fs.writeFileSync(path.join(OUT, 'GeoMetaMap.cmd'), CMD, 'ascii');
  writeUtf8Bom(path.join(OUT, 'はじめかた.txt'), GUIDE_JA);
  writeUtf8Bom(path.join(OUT, 'START_HERE.txt'), GUIDE_EN);

  const dataOut = path.join(OUT, 'data');
  fs.mkdirSync(path.join(dataOut, 'images'), { recursive: true });

  if (WITH_DATA) {
    const src = path.join(ROOT, 'data');
    const before = dirStats(src);
    if (!fs.existsSync(src)) {
      log('--with-data: no data/ to copy, shipping empty');
    } else {
      // COPY only. Never move, never write to the source.
      fs.cpSync(src, dataOut, { recursive: true });
      // Drop the packager's own UI-language choice so the recipient still gets
      // the navigator default (a Japanese browser -> Japanese UI).
      stripLangSetting(path.join(dataOut, 'app.db'));
      const after = dirStats(src);
      const identical = before.files === after.files && before.bytes === after.bytes;
      log(`--with-data: copied ${before.files} files (${mb(before.bytes)})`);
      log(`source data/ untouched: ${identical ? 'YES' : 'NO — ABORTING'} ` +
          `(${after.files} files, ${mb(after.bytes)})`);
      if (!identical) throw new Error('source data/ changed during packaging');
    }
  }
}

/** Remove the `lang` row from the COPIED db so friends get their own default. */
function stripLangSetting(dbFile) {
  if (!fs.existsSync(dbFile)) return;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbFile);
    const n = db.prepare("DELETE FROM settings WHERE key = 'lang'").run().changes;
    db.close();
    if (n) log('cleared the `lang` setting in the copy (recipient gets their browser default)');
  } catch (e) {
    log('WARNING: could not clear `lang` in the copy:', e.message);
  }
}

// ---- 4. zip -----------------------------------------------------------------

function makeZip() {
  const zipPath = path.join(RELEASE, 'GeoMetaMap-win64.zip');
  fs.rmSync(zipPath, { force: true });
  const zip = new AdmZip();
  zip.addLocalFolder(OUT, 'GeoMetaMap');
  zip.writeZip(zipPath);
  const size = fs.statSync(zipPath).size;
  log(`zip: ${path.relative(ROOT, zipPath)} — ${mb(size)}`);
  if (size > 150 * 1024 * 1024) log('WARNING: zip exceeds the ~150 MB target.');
  return zipPath;
}

// ---- run --------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  buildFrontend();
  await bundleServer();
  copySqlite();
  await fetchNodeExe();
  assemble();
  const zipPath = makeZip();

  const folder = dirStats(OUT);
  log(`folder: ${folder.files} files, ${mb(folder.bytes)}`);
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  log(`run it: ${path.join(path.relative(ROOT, OUT), 'GeoMetaMap.cmd')}`);
  log(`share:  ${path.relative(ROOT, zipPath)}`);
}

main().catch((err) => {
  console.error('[package] FAILED:', err);
  process.exit(1);
});
