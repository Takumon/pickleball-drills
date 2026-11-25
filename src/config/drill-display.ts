/**
 * ドリルの各項目を「最初から見せる」か「折りたたむ（どのトグルに入れるか）」かの定義。
 * ドリルページとメニュー表示の両方がこのファイルを参照する。
 * 項目を移したいときは、配列の間で項目名を移動するだけでよい（配列内の順番が表示順）。
 * ここに書かない項目はページに出さない。
 */
export const fieldLabels = {
	setup: '人数・配置',
	feed: '球出し',
	steps: 'やり方',
	points: 'ポイント',
	diagram: '図',
	purpose: '目的',
	variants: '派生形',
	notes: '補足',
	links: '関連リンク',
} as const;

export type DrillField = keyof typeof fieldLabels;

/** 最初から見せる項目（練習中に必ず見てほしいもの） */
// 練習中に長い文は読まない。動き（配置・球出し・やり方）はアニメーションで伝わるので、
// 最初から見せるのは、図と、なぜやるか（目的）と、意識すること（ポイント）だけにする
export const visibleFields: DrillField[] = ['diagram', 'purpose', 'points'];

/**
 * 折りたたんで見せる項目のまとまり。趣旨の違うものは別のトグルにする（配列の順が表示順）。
 * まとまりの中が1項目で、見出しがトグルの名前と同じときは、中の見出しを省く。
 */
export const detailGroups: { label: string; fields: DrillField[]; /** 中身がなくてもトグルを出し、「なし」と書く */ showWhenEmpty?: boolean }[] = [
	{ label: '練習方法の詳細', fields: ['setup', 'feed', 'steps', 'variants', 'notes'] },
	{ label: '関連リンク', fields: ['links'], showWhenEmpty: true },
];

// ID・カテゴリ・別名・メニューを組むときの初期値（builderDefault）は、データとしては持つが、ページには出さない。
// 作り手（開発者）だけが意識する情報のため
