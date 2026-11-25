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

/**
 * 打球の線の曲げ具合。上から見た図ではボールの通り道はほぼまっすぐなので、すべて 0（まっすぐ）。
 * 高さは横から見た帯で見せる。
 */
export const shotCurve: Record<ShotType, number> = {
	lob: 0,
	drop: 0,
	dink: 0,
	reset: 0,
	serve: 0,
	return: 0,
	speedup: 0,
	smash: 0,
	drive: 0,
	volley: 0,
	move: 0,
};

/** アニメーションで、打球（ボール）が飛ぶ時間・人が動く時間（ミリ秒）。小さいほど速い */
export const shotDurationMs: Record<ShotType, number> = {
	speedup: 450,
	smash: 450,
	volley: 550,
	drive: 650,
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

/**
 * ボールの高さの段階（フィート。値はあとで調整する）。低い順。
 * アニメーションのボールの大きさに使う（真上から見た図なので、高い球ほど大きく描く）。
 */
export const heightLevels = {
	ground: { label: '地面', note: 'バウンドする位置', ft: 0 },
	belowWaist: { label: '腰の下', note: 'サーブ・ストローク（ドライブ）の打点', ft: 2.0 },
	underTape: { label: '白帯のちょい下', note: 'ロールの打点', ft: 2.5 },
	tape: { label: 'ネットの白帯', note: 'ネットの高さ', ft: 2.9 },
	overTape: { label: '白帯のちょい上', note: 'フリックの打点、ディンクの頂点', ft: 3.3 },
	waistToShoulder: { label: '腰上〜肩下', note: 'ボレーの打点', ft: 4.0 },
	head: { label: '肩より上・頭付近', note: '強めのボレーの打点', ft: 5.5 },
	aboveTape: { label: '白帯から上', note: 'サーブ・リターン・ドロップの頂点', ft: 6.0 },
	overhead: { label: '頭より上', note: 'スマッシュの打点', ft: 7.5 },
	sky: { label: 'かなり上', note: 'ロブの頂点', ft: 14 },
} as const;
export type HeightLevel = keyof typeof heightLevels;

/**
 * 打球の種類ごとの、打つ高さ（hit）と山の高さ（peak）の既定値。
 * 山が打つ高さ・受ける高さより低いときは、山を作らずにそのままつなぐ。
 * 受ける高さは、受けた人が次に打つ球の打点（次がなければ「腰上〜肩下」）。
 */
export const shotHeights: Record<Exclude<ShotType, 'move'>, { hit: HeightLevel; peak: HeightLevel }> = {
	serve: { hit: 'belowWaist', peak: 'aboveTape' },
	return: { hit: 'belowWaist', peak: 'aboveTape' },
	drop: { hit: 'belowWaist', peak: 'aboveTape' },
	dink: { hit: 'underTape', peak: 'overTape' },
	reset: { hit: 'underTape', peak: 'overTape' },
	drive: { hit: 'belowWaist', peak: 'tape' },
	volley: { hit: 'waistToShoulder', peak: 'waistToShoulder' },
	speedup: { hit: 'overTape', peak: 'overTape' },
	smash: { hit: 'overhead', peak: 'overhead' },
	lob: { hit: 'belowWaist', peak: 'sky' },
};
/** 次に打つ球がないときの、受ける高さ */
export const defaultReceiveHeight: HeightLevel = 'waistToShoulder';
