// 共有のプレビュー画像（OGP、1200×630）を手元で作る。CI では作らない（デプロイを速く保つため）。
//
//   npm run og            古い画像・ない画像だけを作り直す（public/og/<ID>.png。サイト共通は public/og/site.png）
//   npm run og -- --check 古い画像・ない画像を一覧にするだけ（作らない）
//   npm run og -- --all   全部作り直す
//
// 古いかどうかは「画像の材料の指紋（ハッシュ）」で見分ける。材料は、画像に出るもの（ドリル名・カテゴリ・
// 練習の目的・図のデータ）と、描く側のコード（RENDERER）。作ったときの指紋を public/og/manifest.json に残し、
// 今の指紋と違えば古いとみなす。描く側のコードを変えると、全部が古くなる。
// 作った画像と manifest.json はコミットする。
//
// 作り方: サイトをビルドし、ドリルごとの /og/<ID>/ のページ（src/pages/og/[id].astro）をブラウザで撮る。
// ブラウザは、この PC の Google Chrome（なければ playwright-core の Chromium）。
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parse } from 'yaml';

const DRILLS = 'src/content/docs/drills';
const OUT = 'public/og';
const MANIFEST = join(OUT, 'manifest.json');
const DIST = 'dist';
const BASE = '/pickleball-drills';
/** 描く側のコード。どれかが変わると、全部の画像が古くなる */
const RENDERER = [
	'src/pages/og/[id].astro',
	'src/lib/og.ts',
	'src/components/Court.astro',
	'src/components/CourtFrame.astro',
	'src/styles/court.css',
	'src/config/court.ts',
	'src/config/categories.ts',
	'src/config/og.ts',
	'public/favicon.svg',
	'src/content.config.ts',
];

const args = new Set(process.argv.slice(2));

// ホーム画面・ブックマーク用のアイコン（180×180）。ボールの絵（public/favicon.svg）から作る。ブラウザはいらない
{
	const sharp = (await import('sharp')).default;
	const svg = readFileSync('public/favicon.svg');
	const icon = 'public/apple-touch-icon.png';
	// 角が丸く切られても欠けないよう、白地の真ん中に少し小さく置く
	const ball = await sharp(svg, { density: 600 }).resize(150, 150).png().toBuffer();
	await sharp({ create: { width: 180, height: 180, channels: 4, background: '#ffffff' } })
		.composite([{ input: ball, gravity: 'center' }])
		.png()
		.toFile(icon);
}
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const rendererHash = sha(RENDERER.map((f) => readFileSync(f, 'utf8')).join('\n'));

// ドリルごとの指紋
const drills = readdirSync(DRILLS, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.flatMap((d) => readdirSync(join(DRILLS, d.name)).filter((n) => n.endsWith('.md')).map((n) => join(DRILLS, d.name, n)))
	.map((file) => {
		const fm = parse(readFileSync(file, 'utf8').split('---')[1]);
		const d = fm.drill;
		const hash = sha(JSON.stringify({ r: rendererHash, title: fm.title, category: d.category, focus: d.focus, diagram: d.diagram }));
		return { id: d.id, hash, path: `/og/${d.id}/` };
	})
	.sort((a, b) => a.id.localeCompare(b.id));
// サイト共通の画像（トップページと練習メニュー）。材料はそのページとボールの絵
drills.push({ id: 'site', hash: sha(['src/pages/og/site.astro', 'src/config/og.ts', 'public/favicon.svg'].map((f) => readFileSync(f, 'utf8')).join('\n')), path: '/og/site/' });

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const stale = drills.filter((d) => args.has('--all') || manifest[d.id] !== d.hash || !existsSync(join(OUT, `${d.id}.png`)));

if (stale.length === 0) {
	console.log('[og] プレビュー画像はすべて最新です');
	process.exit(0);
}
console.log(`[og] 古い・ない画像: ${stale.map((d) => d.id).join(', ')}`);
if (args.has('--check')) process.exit(1);

// ビルドして、古いものだけ撮る
execSync('npx astro build', { stdio: 'ignore' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
	if (!path.startsWith(BASE)) return res.writeHead(404).end();
	let file = join(DIST, path.slice(BASE.length));
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (!existsSync(file)) return res.writeHead(404).end();
	res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

const { chromium } = await import('playwright-core');
let browser;
try {
	browser = await chromium.launch({ channel: 'chrome' });
} catch {
	browser = await chromium.launch();
}
mkdirSync(OUT, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
for (const d of stale) {
	await page.goto(`http://127.0.0.1:${port}${BASE}${d.path}`, { waitUntil: 'networkidle' });
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: join(OUT, `${d.id}.png`) });
	manifest[d.id] = d.hash;
}
await browser.close();
server.close();
// 消えたドリルの記録は外す
const ids = new Set(drills.map((d) => d.id));
for (const k of Object.keys(manifest)) if (!ids.has(k)) delete manifest[k];
writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, '\t') + '\n');
console.log(`[og] ${stale.length} 枚を作り直しました（${OUT}/）。画像と manifest.json をコミットしてください`);
