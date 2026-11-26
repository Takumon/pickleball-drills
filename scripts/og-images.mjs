// 共有のプレビュー画像（OGP、1200×630）を書き出す。`npm run build` の中で、`astro build` のあとに動く。
// ビルドしたドリルごとの /og/<ID>/ のページをヘッドレスのブラウザで開き、dist/og/<ID>.png に保存する。
// ビルドのたびに全部作り直すので、画像が古くなることはない（画像はリポジトリに入れない）。
// ページの中身（どの手を描くか、文字の並び）は src/pages/og/[id].astro と src/lib/og.ts が決める。
//
// ブラウザ: Google Chrome があればそれを、なければ playwright-core の Chromium を使う。
//   GitHub Actions では Chromium と日本語フォント（fonts-noto-cjk）を入れてから動かす（.github/workflows）。
// 日本語のフォント: Mac はヒラギノ、GitHub Actions は Noto Sans CJK JP。
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = 'dist';
const OUT = join(DIST, 'og');
const BASE = '/pickleball-drills';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

// dist を BASE の下に置いたものとして配る、小さな静的サーバー
const server = createServer((req, res) => {
	let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
	if (!path.startsWith(BASE)) return res.writeHead(404).end();
	let file = join(DIST, path.slice(BASE.length));
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (!existsSync(file)) return res.writeHead(404).end();
	res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

const ids = readdirSync(join(DIST, 'og')).filter((id) => existsSync(join(DIST, 'og', id, 'index.html')));

mkdirSync(OUT, { recursive: true });
let browser;
try {
	browser = await chromium.launch({ channel: 'chrome' });
} catch {
	browser = await chromium.launch();
}
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const id of ids) {
	await page.goto(`http://127.0.0.1:${port}${BASE}/og/${id}/`, { waitUntil: 'networkidle' });
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: join(OUT, `${id}.png`) });
}
await browser.close();
server.close();
console.log(`[og] ${ids.length} 枚のプレビュー画像を書き出しました（${OUT}/<ID>.png）`);
