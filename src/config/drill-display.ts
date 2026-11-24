/**
 * ドリルの各項目を「最初から見せる」か「詳細トグルに隠す」かの定義。
 * ドリルページとメニュー表示の両方がこのファイルを参照する。
 * 項目を移したいときは、配列の間で項目名を移動するだけでよい（配列内の順番が表示順）。
 */
export const fieldLabels = {
	setup: '人数・配置',
	feed: '球出し',
	steps: 'やり方',
	points: 'ポイント',
	diagram: '図',
	purpose: '目的',
	variants: '派生形',
	time: '標準時間',
	related: '関連ドリル',
	notes: '補足',
} as const;

export type DrillField = keyof typeof fieldLabels;

/** 最初から見せる項目（練習中に必ず見てほしいもの） */
export const visibleFields: DrillField[] = ['setup', 'feed', 'steps', 'points', 'diagram'];

/** 「詳細」トグルの中に隠す項目 */
export const detailFields: DrillField[] = ['purpose', 'variants', 'time', 'related', 'notes'];
