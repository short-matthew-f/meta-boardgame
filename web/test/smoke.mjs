// Browser smoke test for the web UI. Dev-only: Playwright is NOT a dependency of
// this repo. Install it anywhere and point NODE_PATH at it, or install it globally:
//
//   mkdir /tmp/pw && cd /tmp/pw && npm i playwright
//   npm run build:web
//   NODE_PATH=/tmp/pw/node_modules node web/test/smoke.mjs [--shots DIR] [--chromium PATH]
//
// It serves dist/ over HTTP, plays a whole 4-bot game at instant speed and fails on
// any console error, then (second pass) watches a game at normal speed and a human
// turn, saving screenshots of the setup screen, a bot's thinking panel, a human turn
// with a shop tile selected, and the game-over banner into --shots.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', '..', 'dist');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const SHOTS = arg('--shots', null);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function unwrap(mod) { return mod && mod.chromium ? mod : mod && mod.default && mod.default.chromium ? mod.default : mod; }

async function loadPlaywright() {
  try { return unwrap(await import('playwright')); } catch { /* fall through */ }
  const roots = (process.env.NODE_PATH ?? '').split(path.delimiter).filter(Boolean);
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch { /* ignore */ }
  roots.push('/usr/local/lib/node_modules', '/usr/lib/node_modules');
  for (const root of roots) {
    const pkg = path.join(root, 'playwright');
    if (fs.existsSync(pkg)) return unwrap(createRequire(path.join(root, 'x.js'))('playwright'));
  }
  throw new Error('playwright not found: install it (npm i playwright) and set NODE_PATH to its node_modules');
}

function chromiumPath() {
  const given = arg('--chromium', null);
  const cands = [given, process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].filter(Boolean);
  for (const c of cands) {
    if (!fs.existsSync(c)) continue;
    if (fs.statSync(c).isDirectory()) {
      for (const sub of ['chrome', 'chrome-linux/chrome', 'chromium']) if (fs.existsSync(path.join(c, sub))) return path.join(c, sub);
    } else return c;
  }
  return undefined; // let Playwright use its own download
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
function serve() {
  const server = http.createServer((req, res) => {
    // Served under a sub-path like GitHub Pages: /meta-boardgame/
    let p = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/meta-boardgame/, '');
    if (p === '/' || p === '') p = '/index.html';
    const f = path.join(DIST, path.normalize(p));
    if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/meta-boardgame/` })));
}

const problems = [];
function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${label} console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`${label} request failed: ${r.url()}`));
}

async function setup(page, { seats, speed, seed, mode, value }) {
  await page.waitForSelector('#start');
  const n = seats.length;
  await page.click(`.seg[aria-label="Players"] button:nth-child(${n - 1})`);
  for (let i = 0; i < n; i++) await page.selectOption(`#seat${i}`, seats[i]);
  if (mode) await page.selectOption('#endmode', mode);
  if (value) await page.fill('#endvalue', String(value));
  if (seed != null) await page.fill('#seed', String(seed));
  await page.click(`.seg[aria-label="Initial speed"] button:has-text("${speed}")`);
}

const shot = async (page, name) => { if (SHOTS) { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); console.log('shot', f); } };
const ok = (cond, msg) => { if (!cond) problems.push(`assertion failed: ${msg}`); else console.log('ok  ', msg); };

const pw = await loadPlaywright();
const { server, url } = await serve();
const browser = await pw.chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
try {
  // ---------------------------------------------------------------- pass 1: instant, 4 bots, to the end
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    watch(page, 'instant');
    await page.goto(url);
    await shot(page, '1-setup');
    await setup(page, { seats: ['scorer', 'greedy', 'aggressor', 'turtle'], speed: 'Instant', seed: 5 });
    await page.click('#start');
    await page.waitForSelector('#gameover', { timeout: 90_000 });
    const text = await page.textContent('#gameover');
    ok(/Player \d wins/.test(text) && text.includes('Seed 5'), 'instant 4-bot game ends with a winner banner showing the seed');
    ok((await page.locator('.log li').count()) > 100, 'event log filled during the game');
    await shot(page, '5-gameover');
    // Same seed, same seats, same winner (deterministic replay).
    const first = (await page.textContent('#gameover h2')).trim();
    await page.click('#rematch');
    await page.waitForSelector('#gameover', { timeout: 90_000 });
    ok((await page.textContent('#gameover h2')).trim() === first, 'replaying the seed gives the same winner');
    await page.click('#new-game');
    await page.waitForSelector('#start');
    ok(true, 'New game returns to setup');
    await page.close();
  }

  // ---------------------------------------------------------------- pass 2: normal speed, watch a bot think
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    watch(page, 'normal');
    await page.goto(url);
    await setup(page, { seats: ['scorer', 'lookahead', 'aggressor', 'expander'], speed: 'Normal', seed: 777 });
    await page.click('#start');
    await page.waitForSelector('.cands li', { timeout: 10_000 });
    ok((await page.locator('.cands li').count()) >= 1, 'thinking panel lists candidates');
    // First decision with real options (a shop turn): candidates shown, then the pick highlighted.
    await page.waitForSelector('.think.pondering .cands li:nth-child(3)', { timeout: 60_000 });
    await shot(page, '2-thinking');
    // ... wait for a pick that buys a tile, so the preview and the flight can be seen.
    await page.waitForFunction(() => /→ slot/.test(document.querySelector('.think.picked .chosen .why')?.textContent ?? ''), null, { timeout: 90_000 });
    await page.waitForTimeout(300);
    await shot(page, '2b-thinking-picked');
    await page.waitForTimeout(1000); // the chosen tile flies to its slot
    await shot(page, '2c-bought');
    // Take over seat 2 mid-game, then hand it back.
    await page.click('.board[data-player="1"] .seat-btn');
    ok((await page.textContent('.board[data-player="1"] .seat-btn')).includes('Hand back'), 'Take over flips the seat button');
    await page.click('.board[data-player="1"] .seat-btn');
    ok((await page.textContent('.board[data-player="1"] .seat-btn')).includes('Take over'), 'Hand back flips it again');
    // Pause, step, and play.
    await page.click('.controls .btn:has-text("Pause")');
    await page.waitForTimeout(2200); // the beat in flight finishes (at most 1.5 s), then it holds
    const before = await page.locator('.log li').count();
    await page.waitForTimeout(2500);
    ok((await page.locator('.log li').count()) === before, 'pause stops the log');
    await page.click('.controls .btn:has-text("Step")');
    await page.waitForTimeout(300);
    await page.click('.controls .btn:has-text("Play")');
    await page.waitForTimeout(9000); // ~15 s of play in total
    ok(await page.locator('.board.large').count() === 1, 'exactly one large board');
    // Speed up until tiles are on the boards, then capture the table.
    await page.click('.controls .segbtn:has-text("Fast")');
    await page.waitForFunction(() => Number(document.querySelector('.round')?.textContent?.replace(/\D/g, '')) >= 5, null, { timeout: 90_000 });
    await page.click('.controls .btn:has-text("Pause")');
    await page.waitForTimeout(2200);
    await shot(page, '4-midgame');
    await page.close();
  }

  // ---------------------------------------------------------------- expanders (growing boards) and attacks
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    watch(page, 'expanders');
    await page.goto(url);
    await setup(page, { seats: ['expander', 'expander', 'scorer', 'lookahead'], speed: 'Instant', seed: 9, value: 25 });
    await page.click('#start');
    await page.waitForSelector('#gameover', { timeout: 90_000 });
    ok(true, 'second instant game (expanders, 25 rounds) finished');
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    watch(page, 'attacks');
    await page.goto(url);
    await setup(page, { seats: ['aggressor', 'aggressor', 'aggressor', 'greedy'], speed: 'Fast', seed: 3, value: 15 });
    await page.click('#start');
    try {
      await page.waitForSelector('.overlay .arrow', { timeout: 60_000 });
      await shot(page, '7-attack');
      ok(true, 'an attack arrow was drawn');
    } catch { problems.push('assertion failed: no attack arrow within 60 s at Fast'); }
    await page.close();
  }

  // ---------------------------------------------------------------- humans only: every click path, to the end
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    watch(page, 'humans');
    await page.goto(url);
    await setup(page, { seats: ['human', 'human', 'aggressor'], speed: 'Instant', seed: 21, mode: 'turnCap', value: 12 });
    await page.click('#start');
    const seen = { expansion: 0, replace: 0, target: 0, buy: 0, mod: 0, sell: 0 };
    const deadline = Date.now() + 120_000;
    let rounds = 0;
    while (Date.now() < deadline && !(await page.locator('#gameover').count())) {
      const prompt = (await page.locator('.human .prompt').first().textContent({ timeout: 1000 }).catch(() => '')) ?? '';
      if (/^Choose a target/.test(prompt)) { await page.locator('.board.targetable').first().click(); seen.target++; continue; }
      if (/^Roll|^You rolled/.test(prompt)) { await page.locator('.human .btn.primary').first().click(); continue; }
      if (/^Pick a slot|^Where does/.test(prompt)) {
        const gap = page.locator('.gap').first();
        if (await gap.count()) { await gap.click(); seen.expansion++; continue; }
        const rep = page.locator('.board.large .slot.target-replace').first();
        if (await rep.count()) { await rep.click(); seen.replace++; continue; }
        await page.locator('.board.large .slot.target-empty').first().click(); seen.buy++; continue;
      }
      if (/^Sell /.test(prompt)) { await page.locator('.human .btn.danger').click(); seen.sell++; continue; }
      if (/^Buy a tile|^Nothing/.test(prompt)) {
        rounds++;
        const pick = page.locator('.stile.clickable', { hasText: /Expansion|Bandit|Saboteur|Trebuchet|Tax/ }).first();
        const any = page.locator('.stile.clickable').first();
        // Every third turn replace/sell something if there is a tile of ours to sell.
        const sellable = page.locator('.board.large .slot.sellable').first();
        if (rounds % 5 === 0 && await sellable.count()) { await sellable.click(); continue; }
        if (rounds % 7 === 0 && await page.locator('.smod.clickable').count()) { await page.locator('.smod.clickable').first().click(); seen.mod++; continue; }
        if (await pick.count()) { await pick.click(); continue; }
        if (await any.count()) { await any.click(); continue; }
        await page.locator('.human .btn.primary, .human .btn.secondary').first().click();
        continue;
      }
      await page.waitForTimeout(30);
    }
    ok(await page.locator('#gameover').count() === 1, 'two humans and a bot play a whole game through the click paths');
    console.log('click paths exercised:', JSON.stringify(seen));
    ok(seen.buy + seen.replace + seen.expansion > 0, 'humans bought tiles');
    await page.close();
  }

  // ---------------------------------------------------------------- pass 3: a human turn
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
    const page = await browser.newPage({ viewport });
    watch(page, `human ${viewport.width}`);
    await page.goto(url);
    await setup(page, { seats: ['human', 'scorer', 'turtle', 'greedy'], speed: 'Fast', seed: 31 });
    await page.click('#start');
    let selected = false;
    for (let turn = 0; turn < 12 && !selected; turn++) {
      await page.waitForSelector('.human .btn', { timeout: 30_000 });
      const prompt = await page.textContent('.human .prompt');
      if (prompt.startsWith('Roll')) { await page.click('.human .btn.primary'); continue; }
      if (prompt.startsWith('Buy')) {
        const tile = page.locator('.stile.clickable').first();
        if (await tile.count()) {
          await tile.click();
          await page.waitForSelector('.slot.target-empty, .slot.target-replace, .gap', { timeout: 5000 });
          await page.waitForTimeout(400);
          await shot(page, viewport.width === 1280 ? '3-human-slots' : '3b-human-slots-1024');
          ok((await page.locator('.board.large .slot.target-empty, .board.large .slot.target-replace, .board.large .gap').count()) > 0, `legal slots highlighted on the large board at ${viewport.width}px`);
          selected = true;
          // Buy onto the first highlighted slot and see the board change.
          const slotCount = await page.locator('.board.large .slot.target-empty, .board.large .slot.target-replace').count();
          if (slotCount > 0) {
            await page.locator('.board.large .slot.target-empty, .board.large .slot.target-replace').first().click();
            await page.waitForSelector('.log li:has-text("buys")', { timeout: 5000 });
            ok(true, 'clicking a highlighted slot buys the tile');
          } else await page.click('.human .btn.ghost');
          break;
        }
      }
      await page.click('.human .btn.primary, .human .btn.secondary');
    }
    ok(selected, `a human shop turn with a selectable tile was reached at ${viewport.width}px`);
    const fonts = await page.evaluate(() => {
      const r = document.querySelector('.board.large .ring').getBoundingClientRect();
      const t = document.querySelector('.board.large .slot .tile-name');
      return { ring: Math.round(r.width), name: t ? Math.round(t.getBoundingClientRect().height) : 0 };
    });
    console.log(`large ring ${fonts.ring}px at ${viewport.width}x${viewport.height}`);
    ok(fonts.ring >= (viewport.width >= 1280 ? 480 : 400), `large board is wide enough at ${viewport.width}px (got ${fonts.ring})`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok(!overflow, `no horizontal overflow at ${viewport.width}px`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('\nSMOKE FAILED:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('\nsmoke ok');
