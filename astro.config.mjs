// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import preact from '@astrojs/preact';
import { categories } from './src/config/categories.ts';

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
			components: {
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			sidebar: [
				{ label: 'ドリル一覧', slug: 'drills' },
				{ label: '図の見方', slug: 'legend' },
				{ label: '大原則', slug: 'principles' },
				...categories.map((c) => ({
					label: c.label,
					collapsed: true,
					items: [{ autogenerate: { directory: `drills/${c.code}` } }],
				})),
				{ label: '用語集', slug: 'glossary' },
			],
		}),
	],
});
