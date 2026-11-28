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
	far: { kitchen: 14, inKitchen: 16.5, netSide: 19, kitchenBack: 12.5, kitchenTran: 11.25, tran: TRAN.top, baseline: -2.5 },
	near: { kitchen: 30, inKitchen: 27.5, netSide: 25, kitchenBack: 31.5, kitchenTran: 32.75, tran: TRAN.bottom, baseline: 46.5 },
} as const;
export type Side = keyof typeof DEPTHS;
export type Lane = keyof typeof LANES;
export type Depth = keyof (typeof DEPTHS)['far'];
const SPOT = /^(near|far)-(leftSide|leftOuter|left|leftInner|leftCenter|rightCenter|rightInner|right|rightOuter|rightSide)-(kitchenBack|kitchenTran|inKitchen|netSide|kitchen|tran|baseline)$/;

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
	flick: 'フリック',
	rollDink: 'ロールディンク',
	sliceDink: 'スライスディンク',
	shortHop: 'ショートホップ',
	dinkTrap: 'ディンク（トラップ）',
	sliceDinkTrap: 'スライスディンク（トラップ）',
	resetTrap: 'リセット（トラップ）',
	volleyTrap: 'ボレー（トラップ）',
	lob: 'ロブ',
	smash: 'スマッシュ',
	serve: 'サーブ',
	return: 'リターン',
	move: '人の動き',
} as const;
export type ShotType = keyof typeof shotLabels;
/**
 * トラップしてから打つ打ち方と、そのあとに打つ元の打ち方（書き手と決めた）。来た球をパドルで受けて勢いを殺し、ポンと少し上げる。
 * ディンクは、足元でワンバウンドさせてから打つ。リセットとボレーは弾ませずに、落ちてきた球を打つ（ボレーはボレーディンクで打つ）。
 * 打つ形・高さ・速さは元の打ち方と同じ
 */
export const TRAP_BASE = { dinkTrap: 'dink', sliceDinkTrap: 'sliceDink', resetTrap: 'reset', volleyTrap: 'volleyDink' } as const;
export type TrapShot = keyof typeof TRAP_BASE;
/** 弾ませずに打つトラップ（ポンと上げて、落ちてきた球を打つ。書き手の指摘: リセットのトラップはワンバウンドしない） */
export const TRAP_NO_BOUNCE = new Set<string>(['resetTrap', 'volleyTrap']);
/** 打つ形を決めるときの打ち方（トラップは元の打ち方） */
export const baseShot = (t: string): string => (TRAP_BASE as Record<string, string>)[t] ?? t;

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
	flick: 0,
	rollDink: 0,
	sliceDink: 0,
	shortHop: 0,
	dinkTrap: 0,
	sliceDinkTrap: 0,
	resetTrap: 0,
	volleyTrap: 0,
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
	flick: 65,
	drive: 65,
	// ディンクの仲間の速さ: ロールがいちばん速く、スライスとショートホップはゆっくり（書き手の指摘 2026-11-28）
	rollDink: 31,
	sliceDink: 20,
	shortHop: 20,
	dinkTrap: 25,
	sliceDinkTrap: 20,
	resetTrap: 30,
	volleyTrap: 25,
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
	// ショートホップの打点: 弾んだ直後、球が上がりきる前の低い所（Richard の動画: 足首〜すねの高さで、体を深く沈めて打つ）
	shin: { label: 'すねの高さ', note: 'ショートホップの打点（弾んだ直後の低い球）', ft: 0.7 },
	knee: { label: '膝の高さ', note: 'ディンク・ドライブの打点（弾んで低くなった球を打つ）', ft: 1.3 },
	belowWaist: { label: '腰の下', note: 'ドロップ・ロブ・ロールボレー・ボレーディンクの打点', ft: 2.0 },
	thigh: { label: '太ももの高さ', note: 'サーブ・リターンの打点（サーブはおへそより下で打つ決まり）', ft: 2.4 },
	underTape: { label: '白帯のちょい下', note: 'ネットより少し低い球（ドリルごとに指定）', ft: 2.5 },
	tape: { label: 'ネットの白帯', note: 'ネットの高さ', ft: 2.9 },
	waist: { label: '腰の高さ', note: '腰より上のリセットの打点', ft: 3.2 },
	overTape: { label: '白帯のちょい上', note: 'フリックの打点', ft: 3.3 },
	// ディンクはネットぎりぎりを通さない（ネットにかけやすい）。ネットの上は余裕を持って通し、相手が打つところで低くなればよい（書き手の指摘、2026-11-28）
	dinkArc: { label: '白帯の約30cm上', note: 'ディンク・ボレーディンク・リセットの頂点（打つ人の側で山になり、ネットを越えたら下がる）', ft: 3.9 },
	waistToShoulder: { label: '腰上〜肩下', note: 'ボレーの打点', ft: 4.0 },
	head: { label: '肩より上・頭付近', note: '強めのボレーの打点', ft: 5.5 },
	aboveTape: { label: '白帯から上', note: 'サーブ・リターン・ドロップの頂点', ft: 6.0 },
	// 腕とパドルをいっぱいに伸ばして届く高さ（図の人で、パドルの面の真ん中が約 6.8ft まで届く。届かない高さにすると、面が球に当たらない）
	overhead: { label: '頭より上', note: 'スマッシュの打点', ft: 6.7 },
	highArc: { label: '頭のかなり上', note: '下がって打つボレーで、キッチンへ落とす球の頂点', ft: 10 },
	sky: { label: 'かなり上', note: 'ロブの頂点', ft: 14 },
} as const;
export type HeightLevel = keyof typeof heightLevels;

/**
 * 長さを、ページに出すときの日本の単位（cm・m）にする。データと計算は ft のまま（コートの寸法がフィートで決まっているため）。
 * 1m 未満は 5cm 単位の「約 NNcm」、1m 以上は 0.1m 単位の「約 N.Nm」（書き手の指示: 日本人が読むので、長さは cm・m で出す）
 */
export const metric = (ft: number): string => {
	// 先に丸めてから単位を決める（97.5cm を「約100cm」にせず「約1.0m」にする）
	const cm = Math.round((ft * 30.48) / 5) * 5;
	if (ft === 0) return '0cm';
	return cm < 100 ? `約${cm}cm` : `約${(ft * 0.3048).toFixed(1)}m`;
};
/**
 * 打球の種類ごとの、打つ高さ（hit）と山の高さ（peak）の既定値。
 * 山が打つ高さ・受ける高さより低いときは、山を作らずにそのままつなぐ。
 * 受ける高さは、受けた人が次に打つ球の打点（次がなければ「腰上〜肩下」）。
 * range: 打つ高さが場面で大きく変わる打ち方の、高さの幅（「図の見方」の一覧に、hit の代わりに出す）。hit はその代表（図の既定値）で、
 * ドリルごとに shots の hit で変えられる
 */
export const shotHeights: Record<Exclude<ShotType, 'move'>, { hit: HeightLevel; peak: HeightLevel; range?: string }> = {
	// 打点は動画（Richard・はるきコーチ）と記事から: サーブとリターンは太もも、ドライブは体の前の腰の高さ（2026-11-28 に確かめた）
	serve: { hit: 'thigh', peak: 'aboveTape' },
	return: { hit: 'thigh', peak: 'aboveTape' },
	drop: { hit: 'belowWaist', peak: 'aboveTape' },
	dink: { hit: 'knee', peak: 'dinkArc' },
	rollDink: { hit: 'knee', peak: 'dinkArc' },
	sliceDink: { hit: 'knee', peak: 'dinkArc' },
	shortHop: { hit: 'shin', peak: 'dinkArc' },
	// リセット: 打つ高さは場面で変わる（腰の高さ〜足首、ワンバウンドさせてから打つこともある。書き手の指摘）。図の既定値は膝の高さ
	reset: { hit: 'knee', peak: 'dinkArc', range: '腰〜足首の高さ。ワンバウンドしてから打つこともある' },
	// ドライブ: Richard の「ドライブをマスター！」（3:38〜）では、低く弾んだ球を膝の高さで打っている
	drive: { hit: 'knee', peak: 'tape' },
	// ボレーディンク: ネットより下で面を作って当て、弧を描いてゆっくり落とす（ディンクやドロップをノーバウンドで受け流す）
	volleyDink: { hit: 'belowWaist', peak: 'dinkArc' },
	// ブロックボレー: 体の前に来た速い球を、振らずに面で止めて返す
	block: { hit: 'waistToShoulder', peak: 'waistToShoulder' },
	// ロールボレー: 下から振り上げて回転をかけ、ネットを越えたあとに沈める（ドライブと同じ沈む軌道）
	// ロールボレーはフリック（白帯のちょい上）より低い球を打つ（書き手の指摘）。腰の下くらい
	roll: { hit: 'belowWaist', peak: 'tape' },
	// パンチボレー: ネットより上の球を、上から足元へ速く打ち込む
	punch: { hit: 'waistToShoulder', peak: 'waistToShoulder' },
	speedup: { hit: 'overTape', peak: 'overTape' },
	// フリック: 白帯より少し高い球を、手首と前腕で下から上へはじき、強い順回転をかけて打ち返す
	flick: { hit: 'overTape', peak: 'overTape' },
	smash: { hit: 'overhead', peak: 'overhead' },
	lob: { hit: 'belowWaist', peak: 'sky' },
};
/**
 * 柔らかく落とす弧（ディンクの仲間とリセット）: 打つ人の側で山になり、ネットの白帯より netClearFt 上を通って、ネットを越えたら下がっていく。
 * ネットの上の高さより、相手が打つところで低いことが大事（書き手の指摘、2026-11-28）。トラップしてから打つ打ち方も元の打ち方に従う
 */
export const SOFT_ARC = { types: ['dink', 'rollDink', 'sliceDink', 'shortHop', 'volleyDink', 'reset'] as ShotType[], netClearFt: 0.65 } as const;
// トラップしてから打つ打ち方は、元の打ち方と同じ高さ
for (const [t, b] of Object.entries(TRAP_BASE) as [TrapShot, Exclude<ShotType, 'move' | TrapShot>][]) (shotHeights as Record<string, unknown>)[t] = { ...shotHeights[b], range: undefined };
/** 次に打つ球がないときの、受ける高さ */
export const defaultReceiveHeight: HeightLevel = 'waistToShoulder';

/**
 * 打球の種類ごとの、打つ動き（パドルの振り）。ピックルボールのコーチの記事・動画の説明から決めた（2026-11-27 に調べた）。
 * back: 振りかぶった所、follow: 振り抜いた所。どちらも、打つ所（パドルの面の真ん中）からのずれ [上へ ft, 前へ ft]（前は打球の進む側）。
 * bh: バックハンドで打つときの形（フォアとバックで形が大きく違う打ち方だけ。人の paddle が bh のときに使う）。
 * setup: 振りかぶった形（back）をそのまま構えにする（ほかの球と同じ構えから打つ打ち方。スピードアップはディンクの構え）。
 *   球を待つ間はずっとその形で、打ったあとも元の構え（back）に戻る。
 * via: 振りかぶりから打つ所までの途中の点 [上へ ft, 前へ ft, パドルの回り 度]（なくてもよい）。いったん下がってから上がる振り（サーブ）などの形を決める。
 * turn: 振りかぶった所と振り抜いた所での、パドルの向きの回り方 [度, 度]（打つときの向きから。+ はヘッドが前から上へ回る向き）。
 * 例: ドライブは振りかぶりでヘッドが後ろへ倒れ（-75°。体の後ろでパドルが後ろを向く）、振り抜きで上へ回る（+70°）。スマッシュは頭の後ろへ倒れ（+110°）、前下へ振り下ろす（-135°）
 * 相手の球が飛んでくる間に back へ振りかぶり、打つ手で back → 打つ所 → follow と振り、元の構えへ戻る。
 * 上から見た図では前へのずれだけ、横から見た図では上下と前の両方で動かす。「図の見方」の一覧にも note を出す
 *
 * 調べたことの要点: 柔らかい球（ディンク・ドロップ・リセット・ブロック）は手首を固めて肩から振り、振り抜きは
 * ブロック・リセット（ほぼなし）＜ディンク（短い）＜ドロップ（肩の高さまで）。ドライブ・サーブ・リターンは下から上へ大きく。
 * パンチボレーとスピードアップは前へまっすぐ短く。ロールボレーとロブは下から上へこすり上げる。上から下へ振るのはスマッシュだけ
 */
/** フォアかバックかで、打つ動きの形を選ぶ */
/** 腰の高さ（ft、約 90cm）。打つ高さがこれより上か下かで形が変わる打ち方がある（shotSwing の high。リセット） */
export const WAIST_FT = 2.95;
/** 打ち方と打つ高さから、決めのポーズを選ぶ（腰より上で「打ち方:high」があればそれ） */
export const keyPoseOf = (t0: string, hitH?: number) => {
	const t = baseShot(t0);
	return (hitH !== undefined && hitH > WAIST_FT ? keyPoses[`${t}:high` as KeyPoseName] : undefined) ?? keyPoses[t as KeyPoseName];
};
export const swingOf = (t: Exclude<ShotType, 'move'>, hand?: string, hitH?: number): SwingForm => {
	const sw = shotSwing[baseShot(t) as Exclude<ShotType, 'move'>] as SwingForm & { bh?: SwingForm; high?: SwingForm };
	const form = hitH !== undefined && hitH > WAIST_FT && sw.high ? sw.high : hand === 'bh' && sw.bh ? sw.bh : sw;
	// トラップしてから打つ打ち方は、振りは元の打ち方のまま、説明だけトラップのもの
	return t in TRAP_BASE ? { ...form, note: shotSwing[t].note } : form;
};
/** 打つ動きの形（shotSwing の1つ分。bh はバックハンドで打つときの形） */
export interface SwingForm {
	back: [number, number];
	follow: [number, number];
	turn: [number, number];
	via?: [number, number, number][];
	setup?: boolean;
	/** 打ったあと、振り終わりの形のまま止めて、手を戻さない（フリック。書き手の指摘 2026-11-28: フリスビーを投げた形から手を戻さない） */
	hold?: boolean;
	/** 3次元で動かす振り（フリック。lib/swing-path.ts の flickLines）: 横から見たパドルの先の、始めと終わりの向き（度。前が 0、上が 90）。turn は半円の中の位置 */
	lateral?: [number, number] | [number, number, number];
	/**
	 * 3次元で動かす振りで、パドルが手より手前（見ている人の側）にあり、グリップが見える間（半円の中の位置 0〜1 の範囲）。
	 * この間は手の上にパドルを描く。ほかの間は手の下（グリップが手に隠れる）。フォアは始めも終わりも見えない、バックは始めだけ見える（書き手の説明 2026-11-28）
	 */
	gripFront?: [number, number];
	/**
	 * 3次元で動かす振りで、ひじの曲げ方を変える: 半円の始め（0）と終わり（1）での、ひじの曲がる向きと量（1 は打つ瞬間の形の向きのまま、
	 * -1 は逆の向きにいっぱい、0 は腕をまっすぐ）。途中はそのあいだ。バックのフリックは、振り始めはひじを落とし、振り終わりは逆の「へ」の字（書き手の指摘 2026-11-28）
	 */
	elbowBend?: [number, number];
	/** 関節を軸に回す振り: 腕とパドルを1つのかたまりとして肩かひじのまわりに turn の角度だけ回す（back と follow は使わない） */
	pivot?: 'shoulder' | 'elbow';
	/** pivot の振りで、腕を回す角度（なければ turn と同じ）。パドルはそのうえで turn まで、振りに合わせて少しずつ回る */
	pivotTurn?: [number, number];
	/** 手をまっすぐ押し出す（肩を中心にした弧で動かさない）。パンチボレー・ブロックボレー */
	straight?: boolean;
	note: string;
}
export const shotSwing: Record<Exclude<ShotType, 'move'>, { back: [number, number]; follow: [number, number]; turn: [number, number]; via?: [number, number, number][]; setup?: boolean; hold?: boolean; lateral?: [number, number] | [number, number, number]; gripFront?: [number, number]; elbowBend?: [number, number]; pivot?: 'shoulder' | 'elbow'; pivotTurn?: [number, number]; straight?: boolean; note: string; bh?: SwingForm; high?: SwingForm }> = {
	dink: { back: [-0.1, -0.6], follow: [0.5, 0.7], turn: [-10, 25], note: '少しだけ後ろに引き、肩から振り子のように前へ。振り抜きは短く、腰の高さで目標を指す' },
	// ロールディンク: ヘッドを下げた所から、球の後ろを下から上へこすり上げて順回転をかける。ディンクより速く、鋭いクロスを狙える
	rollDink: { back: [-0.25, -0.5], follow: [0.6, 0.55], turn: [-15, 30], note: 'ヘッドを下げた所から、球の後ろを下から上へこすり上げて順回転をかける。振り抜きは短く、目標の方向へ' },
	// スライスディンク: 面を少し上へ開いたまま（垂直から約30°）、手首を固めて、体の前で短く前へ運ぶ。回転は面の角度でかかる。
	// 上から下へ切る振りはテニスのスライスで、ピックルボールではしない（書き手の指摘。コーチの記事も「チョップしない、コンパクトに前へ」）
	sliceDink: { back: [0, -0.45], follow: [0.1, 0.6], turn: [0, 0], straight: true, note: '面を少し上へ開いたまま、手首を固めて、体の前で短く前へ運ぶ。回転は面の角度でかかる。上から下へは切らない' },
	// ショートホップ（Richard「Master the Short Hop in Pickleball」8qz235sZn5w の 1:10 バックハンド・6:17 フォアハンドのコマ）:
	// 弾んだ直後の低い球を、足を広げてひざを深く曲げ、上体を前へ倒して取る。手首は打つ前に固め、パドルの先は前下へ向けたまま、
	// 面を狙う方向へ向けて、体の前でほとんど引かずに短く運ぶ。打つ瞬間に面を合わせにいかない（面が立つ・開くと浮く）
	shortHop: { back: [0, -0.3], follow: [0.12, 0.45], turn: [0, 0], straight: true, note: '弾んだ直後の低い球を、ひざを深く曲げて体の前で取る。手首を固め、面を狙う方向へ向けたまま、ほとんど引かずに短く運ぶ' },
	// ドロップ・ロブ: 引いた所はディンクと同じ形（腰を落とし、ヘッドを下げる。書き手の指摘）。ディンクより高い所で打つぶん、
	// 打つ所のパドルはディンクより約 20° 起きているので、引く所ではそのぶん多く回してヘッドを下げる（ディンク -10° → -30°）。
	// ドロップはさらに、引いた所でパドルを地面と垂直（ヘッドが真下）にする（書き手の指摘。打つ所の向き 約 -46° から -45° 回す）
	drop: {
		back: [-0.15, -0.9], follow: [2.6, 1.7], turn: [-45, 70], note: 'ディンクと同じ構え（腰を落とし、ヘッドを下げる）から低く小さく引き、下から上へ運ぶ。打ったあとも止めずに、目標へ向けて肩の高さまで長く振り抜く',
	},
	// リセット: バックハンドで取ることが多い。打つ高さが腰（約90cm）より上か下かで形が変わる（書き手の指示）。
	// 腰より下: ヘッドを手首より下げ、面を少し上へ向けて球の少し下に入れる。腰より上: ブロックボレーのように、パドルを上へ斜めに
	// 持ち（ヘッドが手首より上）、面で当てて勢いを殺す
	reset: {
		back: [0, -0.15],
		follow: [0.1, 0.25],
		turn: [-5, 10],
		note: '腰より下の球。バックハンドで取ることが多い。ほとんど引かず、ヘッドを手首より下げ、面を少し上へ向けて球の少し下に入れて勢いを殺す。振り抜きはほぼなし',
		high: { back: [0, -0.05], follow: [-0.03, 0.25], turn: [0, 0], straight: true, note: '腰の高さくらいの球。バックハンドで低く構え、パドルを体の前でほぼ水平に持ち、面を上へ開く（ヘッドは手首より少し上）。面の向きを変えずに、前へ押し出さず肩から持ち上げるように当て、胸の高さで止める' },
	},
	// ドライブ（はるきコーチの動画「ドライブを打つコツ3つ」: パドルのヘッドを下げて押し出す、後ろから前へ体重移動、早いタイミングで打つ）
	// ドライブの動きは決めのポーズ（keyPoses.drive）で動かす。ここは決めのポーズを使えないとき（バックハンドなど）の手の位置の振りと、
	// 「図の見方」の説明の文。振り抜きは上へ上げず前に残す（書き手のドライブ）
	drive: {
		back: [2.8, -1.2],
		via: [[0.6, -1.2, 60]],
		follow: [2.7, 0.8],
		turn: [150, 140],
		note: 'パドルを腰の後ろへ引き、低い球を体の前でヘッドを下げたまま下から前へ打つ。振り抜きは上へ上げず、腕を目標へ伸ばして前に残す',
	},
	volleyDink: { back: [0, -0.15], follow: [0.15, 0.3], turn: [0, 5], note: 'ふつうのディンクの振り終わりの形（腕を前下へ伸ばし、ヘッドを下げる）で構え、そこからほんの少しだけ前へ動かして当てる' },
	block: { back: [0, 0], follow: [-0.05, 0.25], turn: [0, 0], straight: true, note: '振らずに面で止める（前へ数cm だけ）' },
	// ロールボレーは肩を軸に、フリックはひじを軸に振る（動画「フリックは肘起点、ロールは肩起点」）。はるきコーチのロールボレーの動画:
	// 「前ならえをして手のひらを相手に向ける」「ヘッドを下げてパドルをセットする」「インパクト後にヘッドを上げてフィニッシュ」、
	// よくない例は「パドルを後ろに引いてしまう」「パドルが低いところで終わってしまう」。腕とパドルは1つのかたまりのまま肩で回し、
	// 手首は返さない（書き手の指摘）。ヘッドを下げた形で球を待つ（setup）
	roll: {
		back: [0, 0],
		follow: [0, 0],
		// 腕は肩で 45° 振り上げ（前ならえの腕が前上まで）、パドルは振りに合わせて少しずつ回り、真下から前まで上がる
		// （インパクト後にヘッドを上げてフィニッシュ）。前腕ごとワイパーのように回る分で、手首で急に返すのではない
		// 構えはスピードアップに近く、パドルを低く下げてヘッドを真下へ（書き手の指摘）。腕を肩から下げた所から振り上げる
		// 構えのパドルはちょうど垂直（打つ所の -95° から +5° 戻して -90°。書き手の指摘: 垂直を通り越している）
		turn: [5, 95],
		pivotTurn: [-30, 45],
		pivot: 'shoulder',
		setup: true,
		note: '腰を大きく落とし、前ならえのように腕を前へ伸ばして、手のひら（面）を相手に向ける。ヘッドを真下まで下げてセットし、後ろには引かない。面はネットに向けて少しかぶせ、球の後ろに当てる（面を上へ向けない）。手首は返さず、肩を軸に腕ごと振り上げ、ヘッドを前まで上げて終える',
		bh: {
			back: [0, 0],
			follow: [0, 0],
			turn: [5, 95],
			pivotTurn: [-30, 45],
			pivot: 'shoulder',
			setup: true,
			note: '腰を落とし、腕を体の前へ伸ばして手首を固める。ヘッドを真下まで下げてセットし、面はネットに向けて少しかぶせる（面を上へ向けない）。手首は返さずに、肩を軸に腕ごとひざから肩の高さへ持ち上げる',
		},
	},
	// パンチ・ブロック: こぶしは前へ、少し下へ、まっすぐ押し出す（書き手の指摘: 上へ押し出しているように見える）
	punch: { back: [0, -0.1], follow: [-0.35, 0.9], turn: [0, -5], straight: true, note: '胸の前から、前へ（少し下へ）まっすぐ短く押し出す（30〜45cm）' },
	// turn: 打つ瞬間（先は前下 75°）から回す角度。構えはヘッドを真下近く（-85°）、振り抜きは前上（40°）。前は打つ瞬間を -5° にして [-80, 45] だった
	speedup: { back: [-1.5, -0.3], follow: [0.7, 0.8], turn: [-10, 115], setup: true, note: 'ディンクと同じ構え（パドルを低く、ヘッドを下げる）から、引かずに前少し上へ短く鋭く。振り抜きは胸の高さで目標へ' },
	// フリックはひじから先（前腕と手首）で振る（動画「フリックは肘起点、ロールは肩起点」「フリック向きの高さは胸の下から太もも」）。
	// ヘッドは手首を折って下げて待ち（setup。書き手の指摘）、打つときに前腕を振り出しながら手首を戻す。
	// バックはフリスビーを投げるように前へ振り出し、パドルを上へ立てずに面を目標へ向けて止める（書き手の指摘）
	flick: {
		// フォア（2026-11-28 に作り直した。書き手の説明と Richard の動画 nYQxmcDYgEg の 1:14〜1:16 のコマ）:
		// 実際の動き: ヘッドを下げて待ち、手首を軸に、体の横（見ている向き）の側を通る半円を描くようにパドルを上げる。手は少しだけ前へ押し出す。
		// 横から見た図では（前が3時）、パドルの先がほぼ6時から1時の向きへ動いて見え、打つ瞬間は体の横を向くので面の幅だけが見える。
		// 3次元で動かして横から見た形にする（lateral。lib/swing-path.ts の flickLines）。turn の -100〜100 が半円の始めから終わり
		// 構えは低い所から（書き手の指摘「最初はもうちょい低いとこからスタートする」）。Richard の動画のコマでは、構えの手は
		// 股の高さで、パドルの先はひざの近くまで下がる。振り終わりの手はおへその高さ。手は約 0.6ft 下から上がる
		back: [-0.6, -0.15],
		follow: [0.1, 0.3],
		turn: [-100, 100],
		// 横から見て、始めはほぼ真下（6時の少し後ろ）、振り終わりは1時（書き手の指示）
		lateral: [-105, 60],
		setup: true,
		hold: true,
		// 説明の文は実際の動き（手首を軸に半円）を書く。6時から1時は、横から見た図での見え方（書き手の指摘: 実際の動きと混ぜない）
		note: 'パドルのヘッドを下げて体の前で待つ。手首を軸に、半円を描くようにパドルを上げ、手は少しだけ前へ押し出す。振り終わりの形で止め、手を戻さない（横から見ると、パドルの先がほぼ6時から1時の向きへ動いて見える）',
		// バック: ヘッドは手首で下げる（前腕は動かさず、手首を折ってパドルを下へ向ける。ひじを曲げて下げるのではない。書き手の指摘）。
		// 打つときは、前腕を前へ振り出しながら手首を戻し、面を目標へ向けて止める
		bh: {
			// バックもフォアと同じ要領で3次元で動かす（書き手の指示 2026-11-28）: 構えは体の前（利き手と反対の側）の低い所で、ひじを上げ、
			// パドルの先はほぼ真下。手首を軸に、体の横（利き手と反対の側）を通る半円を描いてパドルを上げ、腕を目標へ伸ばす（フリスビー）。
			// Richard の動画 nYQxmcDYgEg の 7:29 ごろのコマでも、構えの手は腰の前、パドルの先はひざの近くまで下がる。
			// 振り終わりはフリスビーの投げ終わり: 腕を前へ伸ばし切り、パドルは前腕の延長（パドルを上へ立てない。書き手の指摘）。横から見て2時
			// 振り始めの手は低く（書き手の指摘「手首をさらに下に」。前は -0.4）
			back: [-0.7, -0.05],
			// 振り始めはひじが手首より上、振り終わりは手首を返すので、手首がひじより少し上（書き手の指摘と、同じ動画の 7:31 ごろのコマ）。
			// 手を肩より上まで上げ、前へは伸ばしすぎない（伸ばしきると、ひじが手首より上のまま終わる）
			follow: [1.1, 0.5],
			turn: [-100, 100],
			// 横から見て、振り始めは7時と8時のあいだ（-135°）、振り終わりは2時（30°。書き手の指示 2026-11-28）。
			// 3つ目は、見ている向き（y）へのふくらみ。バックは横から見た面（x-z）でほぼ半円を描かないので、大きくする（書き手の指摘。
			// x は人の向く向き、y は見ている向き、z は上。前は「人の目線」を見ている人の向きと取り違え、逆に小さくしていた）
			lateral: [-135, 30, 4],
			// 構えから打つ瞬間までは、パドルが手より手前でグリップが見える。手首を返したあと（振り終わり）は見えない
			gripFront: [0, 0.5],
			// 振り始めはひじを落とし、「へ」の字の曲がりは大きめ（0.8。前は 0.5）、振り終わりは逆の「へ」の字（ひじが下）
			elbowBend: [0.8, -1],
			setup: true,
			hold: true,
			note: 'ひじを手首より高く上げてネットへ向け、手首を折ってヘッドを下げ、体の前の低い所で待つ。フリスビーを投げるように、手首を軸に半円を描いてパドルを上げながら、ひじを伸ばして腕を目標へまっすぐ振り出す。振り終わりはパドルが腕と一直線（横から見ると、パドルの先が7時と8時のあいだから2時の向きへ動いて見える）',
		},
	},
	lob: { back: [-0.2, -0.6], follow: [2.4, 0.8], turn: [-30, 70], note: 'ディンクと同じ構え（腰を落とし、ヘッドを下げる）から、球の下に入れて上へすくい上げる。振り抜きは頭の高さまで' },
	smash: { back: [0.4, -1.9], follow: [-3.6, 1.2], turn: [110, -135], note: '頭の後ろに振りかぶり（トロフィーの形）、前下へ振り下ろす。振り抜きは反対の腰まで' },
	serve: { back: [0.6, -1.8], via: [[-0.4, -0.6, -20]], follow: [2.6, 1.8], turn: [-60, 80], note: '腰の前で構え、パドルを腰の横の後ろ下へ引く。肩から振り子のように振り、体の前の低い所（腰より下）でヘッドを手首より下にして当て、下から前上へ振り抜く' },
	// リターン（はるきコーチの動画「リターンの打ち方 3STEP」: 助走をつけて後ろから前に動きながら打つ、テイクバックは最小限、
	// フォロースルーを前に大きく。よくない例は「テイクバックが大きい」）
	return: { back: [-0.3, -0.8], follow: [1.4, 2.0], turn: [-30, 60], note: 'テイクバックは腰の横まで小さく、後ろから前へ動きながら、体の前の太ももの高さで打つ。フォロースルーは前へ大きく、腕を目標へ伸ばす' },
};
// トラップしてから打つ打ち方は、元の打ち方と同じ振り（説明だけ変える）
for (const [t, b] of Object.entries(TRAP_BASE) as [TrapShot, Exclude<ShotType, 'move' | TrapShot>][]) {
	const note = {
		dinkTrap: '来た球をパドルで受けて勢いを殺し、ポンと少し上げて足元でワンバウンドさせる。弾んだ球をディンクで返す',
		sliceDinkTrap: '来た球をパドルで受けて勢いを殺し、ポンと少し上げて足元でワンバウンドさせる。弾んだ球をスライスディンクで返す',
		resetTrap: '来た球をパドルで受けて勢いを殺し、ポンと少し上げる。弾ませずに、落ちてきた球をリセットで低く返す',
		volleyTrap: '来た球をパドルで受けて勢いを殺し、ポンと少し上げる。弾ませずに、落ちてきた球をボレーディンクで返す',
	}[t];
	(shotSwing as Record<string, unknown>)[t] = { ...shotSwing[b], high: undefined, bh: undefined, note };
}

/**
 * 決めのポーズ（書き手と決めた進め方「案A」）: 打ち方ごとに、お手本の動画のコマ（構え・引き切り・打つ瞬間・振り抜き）を見て、
 * 関節の角度で決める。角度の意味は lib/side-figure.ts の PoseAngles。動画のコマと並べて確かめるページは /dev/pose/（手元だけ）。
 * アニメーションは、4つのポーズのあいだを動かす（court-anim.ts の poseRig、lib/side-render.ts の mixPose・fitPoses）
 */
/** 決めのポーズの名前: 打ち方、または「打ち方:high」（打つ高さが腰より上のときの形） */
export type KeyPoseName = Exclude<ShotType, 'move'> | `${Exclude<ShotType, 'move'>}:high`;
export const keyPoses: Partial<Record<KeyPoseName, { source: string; poses: Record<'ready' | 'back' | 'contact' | 'finish', { knee: number; lean: number; shoulder: number; elbow: number; paddle: number; across?: number }> }>> = {
	// Richard Pickleball「ドライブをマスター！」3:38〜（正面から撮った動画。横から見た角度は読み取り）
	drive: {
		source: 'https://youtu.be/ZhiDMU3nemg?t=218',
		poses: {
			ready: { knee: 25, lean: 10, shoulder: 30, elbow: 90, paddle: 60 },
			back: { knee: 35, lean: 20, shoulder: -40, elbow: 25, paddle: -80 },
			contact: { knee: 55, lean: 30, shoulder: 15, elbow: 15, paddle: 0 },
			// 振り抜きは上へ上げず、前に残す（書き手のドライブ: 腕を目標へ伸ばし、パドルも前へ向けて止める）
			finish: { knee: 30, lean: 15, shoulder: 95, elbow: 15, paddle: 0 },
		},
	},
	// はるきコーチ「NGリターンと改善方法」の「リターンの打ち方3STEP」（11:16〜）: 助走をつけて後ろから前へ動きながら打つ、
	// テイクバックは最小限（腰の横まで）、フォロースルーを前に大きく
	return: {
		source: 'https://youtu.be/WxABIAnrI8M?t=676',
		poses: {
			ready: { knee: 30, lean: 15, shoulder: 30, elbow: 70, paddle: 40 },
			back: { knee: 35, lean: 20, shoulder: -20, elbow: 20, paddle: -50 },
			contact: { knee: 30, lean: 15, shoulder: 45, elbow: 10, paddle: -15 },
			finish: { knee: 25, lean: 15, shoulder: 95, elbow: 10, paddle: 5 },
		},
	},
	// 腰の高さのリセット（Briones Pickleball Academy「なぜリセットが浮いてしまうのか」1:22〜、書き手の指定）: 低く構え、バックハンドで
	// パドルを体の前に横切らせて持つ（手はおなかの前）。面は少しだけ開き（上の端が体の側へ 15°）、ネットの方を向く。
	// 字幕「パドルの面を開いたまま、肩から持ち上げるように打つ。前に押し出すのではなく」: 面の向きを変えずに、肩から胸の高さへ持ち上げる。
	// 横から見ると、パドルはこちらを向くので面の幅だけが短い線に見える（PoseAngles の across）
	'reset:high': {
		source: 'https://youtu.be/efOysBmrWfw?t=82',
		poses: {
			ready: { knee: 60, lean: 28, shoulder: 20, elbow: 75, paddle: 0, across: 195 },
			back: { knee: 60, lean: 28, shoulder: 15, elbow: 80, paddle: 0, across: 195 },
			contact: { knee: 60, lean: 28, shoulder: 25, elbow: 70, paddle: 0, across: 195 },
			finish: { knee: 55, lean: 25, shoulder: 45, elbow: 60, paddle: 0, across: 195 },
		},
	},


	// ボレーディンク（書き手の指示）: ふつうのディンクの振り終わりの形（腕を前へ伸ばし、パドルは前下を向き、面は少し開く）から始めて、
	// ほんの少しだけ前へ動かす。ノーバウンドで受けて、勢いを殺して落とす。上体はディンクより少し前のめり（書き手の指摘）。
	// 腰はディンクと同じだけ落とす（ひざ 60°。書き手の指摘）
	volleyDink: {
		source: '',
		poses: {
			ready: { knee: 60, lean: 25, shoulder: 38, elbow: 12, paddle: -22 },
			back: { knee: 60, lean: 25, shoulder: 35, elbow: 14, paddle: -22 },
			contact: { knee: 60, lean: 25, shoulder: 40, elbow: 10, paddle: -20 },
			finish: { knee: 60, lean: 25, shoulder: 46, elbow: 8, paddle: -18 },
		},
	},
	// Richard Pickleball「These serves are huge!」（後ろから撮った動画。横から見た角度は読み取り）: 腰の前でパドルと球を持って構え、
	// パドルを腰の横の後ろ下へ引き、体の前の低い所（腰より下）でヘッドを手首より下にして当て、下から前上へ振り抜く
	serve: {
		source: 'https://youtube.com/shorts/_n0ogNoihIs',
		poses: {
			ready: { knee: 30, lean: 15, shoulder: 35, elbow: 50, paddle: 20 },
			back: { knee: 35, lean: 20, shoulder: -40, elbow: 15, paddle: -40 },
			contact: { knee: 30, lean: 15, shoulder: 45, elbow: 10, paddle: -15 },
			finish: { knee: 25, lean: 10, shoulder: 100, elbow: 20, paddle: 20 },
		},
	},
};
