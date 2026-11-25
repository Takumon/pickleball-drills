/**
 * ドリルの一覧データ。メニュー表示とビルダーが読み込む。
 * 並びはカテゴリの順 → 表示順（sidebar.order）。
 */
import { getCollection } from 'astro:content';
import { categories } from '../config/categories';
import type { CatalogDrill } from '../lib/menu';

export async function GET() {
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	const docs = await getCollection('docs', (e) => !!e.data.drill);
	const catIndex = (code: string) => categories.findIndex((c) => c.code === code);
	const list: CatalogDrill[] = docs
		.map((e) => {
			const d = e.data.drill!;
			return {
				id: d.id,
				title: e.data.title,
				category: d.category,
				categoryLabel: categories.find((c) => c.code === d.category)?.label ?? d.category,
				order: e.data.sidebar?.order ?? 999,
				url: `${base}/${e.id}/`,
				fragment: `${base}/fragments/${d.id}/`,
				variants: d.variants.map((v) => ({ key: v.key, name: v.name, default: v.default })),
				builderDefault: d.builderDefault,
			};
		})
		.sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.order - b.order || a.id.localeCompare(b.id));
	return new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
