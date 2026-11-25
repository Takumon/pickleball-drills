// ドリルの frontmatter から日本語の文章を抜き出し、yomiyasu で確認するための Markdown にする
// 使い方: node scripts/extract-prose.mjs <カテゴリコード または カテゴリ/ID> ... > 出力.md
//   例: node scripts/extract-prose.mjs drp spd        （カテゴリ内の全ドリル）
//   例: node scripts/extract-prose.mjs drp/drp001     （1つのドリル）
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';

const root = 'src/content/docs/drills';
const files = process.argv.slice(2).flatMap((arg) =>
	arg.includes('/')
		? [`${root}/${arg.replace(/\.md$/, '')}.md`]
		: readdirSync(`${root}/${arg}`)
				.filter((n) => n.endsWith('.md'))
				.sort()
				.map((n) => `${root}/${arg}/${n}`),
);

const out = [];
for (const file of files) {
	const fm = parse(readFileSync(file, 'utf8').split('---')[1]);
	const d = fm.drill;
	out.push(
		`# ${fm.title}`,
		fm.description,
		`想定する試合の場面: ${d.scene}`,
		`その場面でやりたいこと: ${d.purpose}`,
		`練習の目的: ${d.focus}`,
		`人数・配置: ${d.setup}`,
		`球出し: ${d.feed}`,
	);
	d.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
	(d.points ?? []).forEach((p) => out.push(`- ${p}`));
	(d.variants ?? []).forEach((v) => out.push(`派生形 ${v.name}: ${v.note ?? ''}`));
	if (d.notes) out.push(`補足: ${d.notes}`);
	out.push('');
}
console.log(out.join('\n'));
