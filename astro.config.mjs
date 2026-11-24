// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { categories } from './src/config/categories.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://takumon.github.io',
	base: '/pickleball-drills',
	integrations: [
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
			customCss: ['./src/styles/custom.css'],
			components: {
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			sidebar: [
				{ label: 'ドリル一覧', slug: 'drills' },
				{ label: '図の見方', slug: 'legend' },
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
