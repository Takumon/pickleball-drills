// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import preact from '@astrojs/preact';
import { existsSync, readdirSync } from 'node:fs';
import { categories } from './src/config/categories.ts';

// サイドバーのカテゴリ名の後ろに、ドリルの数を小さく出す（custom.css の .drill-count）。
// 設定を読むときに数えるので、ドリルを足したら開発サーバーを起動し直す
const drillCount = (code) => {
	const dir = `src/content/docs/drills/${code}`;
	return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')).length : 0;
};

// https://astro.build/config
export default defineConfig({
	site: 'https://takumon.github.io',
	base: '/pickleball-drills',
	integrations: [
		// ビルダー（/builder/）の画面部品にだけ使う
		preact(),
		starlight({
			title: 'ピックルボール ドリル集',
			locales: {
				root: { label: '日本語', lang: 'ja' },
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/Takumon/pickleball-drills' },
			],
			// ドリルページの見出しは目次に出ない作りで、目次が役に立たないため表示しない（スマホの「目次」バーも消える）
			tableOfContents: false,
			// ページ下の「前へ」「次へ」は使わないので出さない
			pagination: false,
			customCss: ['./src/styles/custom.css'],
			// 共有のプレビュー画像（og:image）をドリルのページに足す
			routeMiddleware: './src/routeData.ts',
			// iPhone のホーム画面やブックマークのアイコン（npm run og で public/favicon.svg から作る）
			head: [{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/pickleball-drills/apple-touch-icon.png' } }],
			components: {
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			sidebar: [
				{ label: 'ドリル一覧', slug: 'drills' },
				...categories.map((c) => ({
					label: c.label,
					badge: { text: String(drillCount(c.code)), class: 'drill-count' },
					collapsed: true,
					items: [{ autogenerate: { directory: `drills/${c.code}` } }],
				})),
				// 図の見方・大原則・用語集は、ほぼ書き手しか見ないので、カテゴリのあとに置く（書き手と決めた）
				{ label: '図の見方', slug: 'legend' },
				{ label: '大原則', slug: 'principles' },
				{ label: '用語集', slug: 'glossary' },
			],
		}),
	],
});
