/**
 * ページの head に、共有のプレビュー画像（og:image）を足す。
 * ドリルのページは、public/og/<ID>.png（`npm run og` で書き出してコミットしたもの）を使う。
 * 画像がまだないドリルは、プレビュー画像なしにして、ビルドのときに知らせる。
 */
import { existsSync } from 'node:fs';
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const drill = route.entry.data.drill;
	if (!drill) return;
	if (!existsSync(`public/og/${drill.id}.png`)) {
		console.warn(`[og] ${drill.id}: プレビュー画像がありません。npm run og で作ってください`);
		return;
	}
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	const image = new URL(`${base}/og/${drill.id}.png`, context.site).href;
	route.head.push(
		{ tag: 'meta', attrs: { property: 'og:image', content: image } },
		{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
		{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
		{ tag: 'meta', attrs: { name: 'twitter:image', content: image } },
	);
});
