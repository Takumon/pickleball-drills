// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

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
			sidebar: [
				{ label: 'ドリル', items: [{ autogenerate: { directory: 'drills' } }] },
				{ label: '用語集', slug: 'glossary' },
			],
		}),
	],
});
