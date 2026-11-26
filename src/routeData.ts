/**
 * ページの head に、共有のプレビュー画像（og:image）を足す。
 * ドリルのページは、手元で作ってコミットした public/og/<ID>.png（`npm run og`）を使う。画像がまだなければ付けない。
 */
import { existsSync } from 'node:fs';
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const drill = route.entry.data.drill;
	// ドリルのページはそのドリルの画像、ほかのページ（トップページ・練習メニューなど）はサイト共通の画像
	const name = drill ? drill.id : 'site';
	if (!existsSync(`public/og/${name}.png`)) return;
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	const image = new URL(`${base}/og/${name}.png`, context.site).href;
	route.head.push(
		{ tag: 'meta', attrs: { property: 'og:image', content: image } },
		{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
		{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
		{ tag: 'meta', attrs: { name: 'twitter:image', content: image } },
	);
});
