/**
 * コート図の定義。座標はフィート。コートは縦向きで、x: 0〜20（左→右）、y: 0〜44（上のベースライン→下のベースライン）。
 * ネットは y=22、キッチンラインは y=15 と y=29。図では下側を「自分たちの側」として描く。
 */
export const COURT = { width: 20, length: 44, net: 22, kitchen: 7 } as const;

/** トランの位置 = キッチンラインとベースラインの中間（上側 y=7.5、下側 y=36.5） */
export const TRAN = { top: 7.5, bottom: 36.5 } as const;

/**
 * 名前の付いた立ち位置。ドリルのデータでは `at: near-right-baseline` のように「手前/奥・左/右・深さ」で書く。
 * - 手前（near）= 下側の自分たち、奥（far）= 上側の相手。
 * - 左（left）・右（right）は図で見た左右のレーンの真ん中。leftSide / rightSide はサイドライン寄り（ほぼ端）、leftOuter / rightOuter はレーンの真ん中とサイドラインの間（やや端）、
 *   leftCenter / rightCenter はセンターライン寄り（半面の練習で斜めに打ち合うときなど）。
 * - 深さ: kitchen = キッチンライン付近、tran = トラン（キッチンラインとベースラインの中間）、
 *   baseline = ベースラインの後ろ（サーブ・リターン・3rdショットを打つ位置）。
 *   inKitchen = キッチンの中（キッチンラインから 2.5ft 手前に落ちる。ボレーディンクやディンクの落とし先）、
 *   kitchenTran = キッチンラインとトランの間（スマッシュの落とし先など）、
 *   kitchenBack = キッチンラインから少し下がった位置（サイドステップで後ろに下がって取るときなど）。
 * - leftInner / rightInner は、レーンの真ん中から少しセンターライン寄り（ボレーを待つ基本の位置など）。
 */
export const LANES = { leftSide: 1.5, leftOuter: 3, left: 5, leftInner: 7, leftCenter: 8.5, rightCenter: 11.5, rightInner: 13, right: 15, rightOuter: 17, rightSide: 18.5 } as const;
export const DEPTHS = {
	far: { kitchen: 14, inKitchen: 16.5, kitchenBack: 12.5, kitchenTran: 11.25, tran: TRAN.top, baseline: -2.5 },
	near: { kitchen: 30, inKitchen: 27.5, kitchenBack: 31.5, kitchenTran: 32.75, tran: TRAN.bottom, baseline: 46.5 },
} as const;
export type Side = keyof typeof DEPTHS;
export type Lane = keyof typeof LANES;
export type Depth = keyof (typeof DEPTHS)['far'];
const SPOT = /^(near|far)-(leftSide|leftOuter|left|leftInner|leftCenter|rightCenter|rightInner|right|rightOuter|rightSide)-(kitchenBack|kitchenTran|inKitchen|kitchen|tran|baseline)$/;

/** 名前の付いた立ち位置（例: near-right-baseline）の座標。名前でなければ undefined */
export function spotPoint(name: string): [number, number] | undefined {
	const m = name.match(SPOT);
	if (!m) return undefined;
	return [LANES[m[2] as Lane], DEPTHS[m[1] as Side][m[3] as Depth]];
}

/**
 * ドロップの的にする柵（L字）。相手のキッチンに、サイドラインから 40cm、キッチンラインからパドル1本分の位置に置く。
 * データでは `fence: far-left` のように「奥/手前・左/右」で書く（左右は図で見た左右。柵はそのレーンのサイドライン側に置く）。
 */
export const FENCE = {
	/** サイドラインからの距離（40cm） */
	fromSideline: 0.4 / 0.3048,
	/** キッチンラインからの距離（パドル1本分 ≒ 40cm） */
	fromKitchenLine: 0.4 / 0.3048,
	/** キッチンラインと平行な横木の長さ */
	railAlongKitchen: 6.7,
	/** ネットの手前で止める距離 */
	stopBeforeNet: 0.5,
	/** 着地点: 柵の角をねらう（クロスドロップ）ときは角から、柵の内側をねらうときはさらに内側へ、それぞれ縦横にこの距離 */
	cornerInset: 1,
	insideInset: 2.2,
} as const;
const FENCE_SPEC = /^(near|far)-(left|right)$/;

/** 柵の線分と、着地点（corner = 柵の角のすぐ内側、inside = 柵の内側）の座標 */
export function fenceGeometry(spec: string) {
	const m = spec.match(FENCE_SPEC);
	if (!m) throw new Error(`コート図: fence は near-left のように「手前/奥-左/右」で書く（"${spec}"）`);
	const far = m[1] === 'far';
	const left = m[2] === 'left';
	const kitchenLine = far ? COURT.net - COURT.kitchen : COURT.net + COURT.kitchen;
	const toNet = far ? 1 : -1; // キッチンラインからネットへ向かう向き
	const inward = left ? 1 : -1; // サイドラインからコートの内側へ向かう向き
	const x0 = left ? FENCE.fromSideline : COURT.width - FENCE.fromSideline;
	const y0 = kitchenLine + toNet * FENCE.fromKitchenLine;
	const p = (dx: number, dy: number): [number, number] => [round(x0 + inward * dx), round(y0 + toNet * dy)];
	const corner = p(0, 0);
	const segments: [[number, number], [number, number]][] = [
		[corner, p(FENCE.railAlongKitchen, 0)],
		[corner, [corner[0], round(COURT.net - toNet * FENCE.stopBeforeNet)]],
	];
	return {
		segments,
		targets: { corner: p(FENCE.cornerInset, FENCE.cornerInset), inside: p(FENCE.insideInset, FENCE.insideInset) },
	};
}
const round = (n: number) => Math.round(n * 100) / 100;

/** 「人の手前に落とす」着地点（to: A.front）: 受ける人のネット側、どれだけ手前か（ft） */
export const LAND_IN_FRONT_FT = 2.5;
/** 受ける人の手前の着地点の座標。y はその人の位置、ネットへ向かって LAND_IN_FRONT_FT */
export function landInFront(x: number, y: number): [number, number] {
	return [x, round(y + (y < COURT.net ? 1 : -1) * LAND_IN_FRONT_FT)];
}

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
	volleyDink: 'ボレーディンク',
	block: 'ブロックボレー',
	roll: 'ロールボレー',
	punch: 'パンチボレー',
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
	volleyDink: 0,
	block: 0,
	roll: 0,
	punch: 0,
	move: 0,
};

/**
 * 打球のおおよその速さ（時速 km、実際の球速の目安）。人の動きは歩く・小走りの速さ。
 * アニメーションでは、飛ぶ時間 = 距離 ÷ この速さ にして、同じ種類の球は距離によらず同じ速さに見せる。
 * 実際の速さのままでは目で追えないので、全体を ANIM_SLOWDOWN 倍ゆっくり再生する（種類どうしの速さの比は保つ）。
 */
export const shotSpeedKmh: Record<ShotType, number> = {
	smash: 75,
	speedup: 70,
	drive: 65,
	punch: 60,
	roll: 50,
	block: 40,
	volleyDink: 25,
	serve: 50,
	return: 50,
	drop: 30,
	reset: 30,
	lob: 30,
	dink: 25,
	move: 12,
};
/** アニメーションをどれだけゆっくり再生するか（実際の何倍の時間をかけるか） */
export const ANIM_SLOWDOWN = 1.7;
/**
 * 人が相手の打球を見てから動き出すまでの時間（秒）。相手が打った手と同じ手で動く人（ロブを見て下がる、
 * 打たれた球に合わせてサイドステップするなど）は、この分だけ遅れて動き出す。自分で打ちながら動くときは遅れない
 */
export const REACTION_S = 0.3;
export const reactionMs = Math.round(REACTION_S * 1000 * ANIM_SLOWDOWN);
/** 1手の時間の下限・上限（ミリ秒）。短すぎて見えない・長すぎて待たされることがないようにする */
export const ANIM_MS_MIN = 400;
export const ANIM_MS_MAX = 2000;

/** 距離（ft）と種類から、アニメーションで飛ぶ（動く）時間（ミリ秒）を出す */
export function animMs(type: ShotType, distanceFt: number): number {
	const ftPerSec = (shotSpeedKmh[type] * 1000) / 3600 / 0.3048;
	const ms = (distanceFt / ftPerSec) * 1000 * ANIM_SLOWDOWN;
	return Math.round(Math.min(ANIM_MS_MAX, Math.max(ANIM_MS_MIN, ms)));
}

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
	knee: { label: '膝の高さ', note: 'ディンクの打点（弾んで低くなった球を打つ）', ft: 1.3 },
	belowWaist: { label: '腰の下', note: 'サーブ・ストローク（ドライブ）の打点', ft: 2.0 },
	underTape: { label: '白帯のちょい下', note: 'ロールの打点', ft: 2.5 },
	tape: { label: 'ネットの白帯', note: 'ネットの高さ', ft: 2.9 },
	overTape: { label: '白帯のちょい上', note: 'フリックの打点、ディンクの頂点', ft: 3.3 },
	waistToShoulder: { label: '腰上〜肩下', note: 'ボレーの打点', ft: 4.0 },
	head: { label: '肩より上・頭付近', note: '強めのボレーの打点', ft: 5.5 },
	aboveTape: { label: '白帯から上', note: 'サーブ・リターン・ドロップの頂点', ft: 6.0 },
	overhead: { label: '頭より上', note: 'スマッシュの打点', ft: 7.5 },
	highArc: { label: '頭のかなり上', note: '下がって打つボレーで、キッチンへ落とす球の頂点', ft: 10 },
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
	dink: { hit: 'knee', peak: 'overTape' },
	reset: { hit: 'underTape', peak: 'overTape' },
	drive: { hit: 'belowWaist', peak: 'tape' },
	// ボレーディンク: ネットより下で面を作って当て、弧を描いてゆっくり落とす（ディンクやドロップをノーバウンドで受け流す）
	volleyDink: { hit: 'underTape', peak: 'overTape' },
	// ブロックボレー: 体の前に来た速い球を、振らずに面で止めて返す
	block: { hit: 'waistToShoulder', peak: 'waistToShoulder' },
	// ロールボレー: 下から振り上げて回転をかけ、ネットを越えたあとに沈める（ドライブと同じ沈む軌道）
	roll: { hit: 'underTape', peak: 'tape' },
	// パンチボレー: ネットより上の球を、上から足元へ速く打ち込む
	punch: { hit: 'waistToShoulder', peak: 'waistToShoulder' },
	speedup: { hit: 'overTape', peak: 'overTape' },
	smash: { hit: 'overhead', peak: 'overhead' },
	lob: { hit: 'belowWaist', peak: 'sky' },
};
/** 次に打つ球がないときの、受ける高さ */
export const defaultReceiveHeight: HeightLevel = 'waistToShoulder';

/**
 * 打球の種類ごとの、打つ動き（パドルの振り）。打った瞬間に、パドルがこの向きへ ft だけ出て戻る。
 * up: 上へ（+）・下へ（-）、fwd: 前へ（打球の進む側）。向きは長さ1に直して使う。
 * 上から見た図では前への量だけ、横から見た図では上下と前の両方で動かす。「図の見方」の一覧にも note を出す
 */
export const shotSwing: Record<Exclude<ShotType, 'move'>, { up: number; fwd: number; ft: number; note: string }> = {
	dink: { up: 0.35, fwd: 1, ft: 0.6, note: '下から前へ短く押し出す' },
	drop: { up: 0.5, fwd: 1, ft: 0.8, note: '下から前上へ運ぶように振る' },
	reset: { up: 0.15, fwd: 1, ft: 0.4, note: '面を作って前へ短く押す' },
	drive: { up: 0.45, fwd: 1, ft: 1.2, note: '下から前上へ大きく振り抜く' },
	volleyDink: { up: 0, fwd: 1, ft: 0.3, note: '面を作って当てるだけ（ほとんど振らない）' },
	block: { up: 0, fwd: 1, ft: 0.35, note: '面で止める（ほとんど振らない）' },
	roll: { up: 0.9, fwd: 0.6, ft: 0.6, note: '下から上へこすり上げる' },
	punch: { up: -0.35, fwd: 1, ft: 0.8, note: '上から前下へ短く打ち込む' },
	speedup: { up: 0.25, fwd: 1, ft: 0.9, note: '前へ速く振り抜く' },
	lob: { up: 1, fwd: 0.4, ft: 0.9, note: '下から上へすくい上げる' },
	smash: { up: -0.8, fwd: 0.6, ft: 1.2, note: '頭の上から前下へ振り下ろす' },
	serve: { up: 0.6, fwd: 1, ft: 1, note: '下から前上へ振る（アンダーハンド）' },
	return: { up: 0.45, fwd: 1, ft: 1, note: '下から前上へ振る' },
};
