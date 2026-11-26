/**
 * ページの head に、共有のプレビュー画像（og:image）を足す。
 * ドリルのページは、ビルドのあとに書き出す /og/<ID>.png（scripts/og-images.mjs）を使う。
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const drill = route.entry.data.drill;
	if (!drill) return;
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	const image = new URL(`${base}/og/${drill.id}.png`, context.site).href;
	route.head.push(
		{ tag: 'meta', attrs: { property: 'og:image', content: image } },
		{ tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
		{ tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
		{ tag: 'meta', attrs: { name: 'twitter:image', content: image } },
	);
});
