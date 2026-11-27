/**
 * ページの head に、共有のプレビュー画像（og:image）を足す。
 * ドリルのページは、手元で作ってコミットした public/og/<ID>.png（`npm run og`）を使う。画像がまだなければ付けない。
 * 画像の URL の後ろに、画像の材料の指紋（public/og/manifest.json）を ?v= で付ける。LINE や Facebook は画像を URL ごとに
 * 覚えるので、画像を作り直したときだけ URL を変えて、新しい画像を読み直してもらうため。
 */
import { existsSync, readFileSync } from 'node:fs';
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { getCollection } from 'astro:content';
import { rallyLabel } from './config/drill-display';

/** ドリルのページの URL（末尾の / なし）→ ラリーかどうかの印 */
let rallyByPath: Map<string, string> | undefined;
const rallyMap = async () => {
	if (rallyByPath) return rallyByPath;
	const docs = await getCollection('docs', (e) => !!e.data.drill?.diagram);
	rallyByPath = new Map(docs.map((e) => [e.id.replace(/\/$/, ''), rallyLabel(e.data.drill!.diagram!.rally)]));
	return rallyByPath;
};
type SidebarEntry = { type: string; href?: string; badge?: unknown; entries?: SidebarEntry[] };

let cache: Record<string, string> | undefined;
const manifest = () => (cache ??= existsSync('public/og/manifest.json') ? JSON.parse(readFileSync('public/og/manifest.json', 'utf8')) : {});

export const onRequest = defineRouteMiddleware(async (context) => {
	const route = context.locals.starlightRoute;
	// サイドバーのドリル名の後ろに、ラリーかどうかの印を出す（題名には書かない。書き手と決めた）
	const map = await rallyMap();
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	const mark = (entries: SidebarEntry[]) => {
		for (const e of entries) {
			if (e.entries) mark(e.entries);
			const key = e.href?.replace(base, '').replace(/^\/|\/$/g, '');
			const label = key ? map.get(key) : undefined;
			if (label) e.badge = { text: label, variant: 'default', class: label === 'ラリー' ? 'rally-badge' : 'rally-badge no' };
		}
	};
	mark(route.sidebar as unknown as SidebarEntry[]);
	const drill = route.entry.data.drill;
	// ドリルのページはそのドリルの画像、ほかのページ（トップページ・練習メニューなど）はサイト共通の画像
	const name = drill ? drill.id : 'site';
	if (!existsSync(`public/og/${name}.png`)) return;
	const image = new URL(`${base}/og/${name}.png`, context.site);
	const hash: string | undefined = manifest()[name];
	if (hash) image.searchParams.set('v', hash.slice(0, 8));
	route.head.push(
		{ tag: 'meta', attrs: { property: 'og:image', content: image.href } },
		{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
		{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
		{ tag: 'meta', attrs: { name: 'twitter:image', content: image.href } },
	);
});
