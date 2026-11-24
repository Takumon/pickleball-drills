/**
 * コート図の定義。座標はフィート。コートは縦向きで、x: 0〜20（左→右）、y: 0〜44（上のベースライン→下のベースライン）。
 * ネットは y=22、キッチンラインは y=15 と y=29。図では下側を「自分たちの側」として描く。
 */
export const COURT = { width: 20, length: 44, net: 22, kitchen: 7 } as const;

/** トランの位置 = キッチンラインとベースラインの中間（上側 y=7.5、下側 y=36.5） */
export const TRAN = { top: 7.5, bottom: 36.5 } as const;

/** 人の役割（色分けと凡例に使う） */
export const roleLabels = {
	feed: '球出し役',
	practice: '練習役',
	partner: '味方',
	opponent: '相手',
} as const;
export type Role = keyof typeof roleLabels;

/** 打球・動きの種類（線の色・形と凡例に使う） */
export const shotLabels = {
	feed: '球出し',
	dink: 'ディンク',
	drop: 'ドロップ',
	reset: 'リセット',
	drive: 'ドライブ・ストローク',
	volley: 'ボレー',
	speedup: 'スピードアップ',
	lob: 'ロブ',
	smash: 'スマッシュ',
	serve: 'サーブ',
	return: 'リターン',
	move: '人の動き',
} as const;
export type ShotType = keyof typeof shotLabels;

/** アニメーションで、打球（ボール）が飛ぶ時間・人が動く時間（ミリ秒）。小さいほど速い */
export const shotDurationMs: Record<ShotType, number> = {
	speedup: 450,
	smash: 450,
	volley: 550,
	drive: 650,
	feed: 1100,
	serve: 1100,
	return: 1100,
	reset: 1200,
	dink: 1300,
	drop: 1400,
	lob: 1600,
	move: 1000,
};

/** 強調できるエリア（名前 → 矩形 [x, y, 幅, 高さ]） */
export const zoneRects = {
	left: [0, 0, 10, 44],
	right: [10, 0, 10, 44],
	'kitchen-top': [0, 15, 20, 7],
	'kitchen-bottom': [0, 22, 20, 7],
	'left-top': [0, 0, 10, 22],
	'right-top': [10, 0, 10, 22],
	'left-bottom': [0, 22, 10, 22],
	'right-bottom': [10, 22, 10, 22],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type ZoneName = keyof typeof zoneRects;
