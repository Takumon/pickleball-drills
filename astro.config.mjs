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
			components: {
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			sidebar: [
				{ label: 'ドリル一覧', slug: 'drills' },
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
