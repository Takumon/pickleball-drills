/**
 * 横から見た高さの図に描く人（棒人間）を組み立てる。
 *
 * 考え方
 * - 体は「関節の点をつないだ骨組み」に「部分ごとの太さ」を付けて描く（バイオメカニクスの棒人間と同じ考え方）。
 *   骨組み: 足首・ひざ・股関節・肩の関節・ひじ・手首、背骨の上の端（首のつけ根）、頭。
 * - 寸法は身長 H に対する割合で持つ。値は Drillis & Contini（1966）の体の比率（Winter『Biomechanics and Motor Control of
 *   Human Movement』図4.1 で広く使われている値）と、日本人成人男性の平均的な厚み（胸の厚み約21〜23cm、頭の前後約19cm）から決めた。
 *   身長は日本人成人男性の平均に近い 170cm。
 * - 高さの向き（ft）と前後の向き（ft、ネットの側が +）で組み立て、最後に図の座標へ直す。図は高さの向きを k 倍に縮めているので、
 *   形がゆがまないよう、前後の向きも同じ k 倍にする。ただしパドルの面の真ん中は、ボールと同じ本当の位置に置く。
 * - 構えはピックルボールのよい姿勢: 上体はほぼ起こし、ひざを少し曲げ、パドルは体の前。低い球には、ひざをもう少し曲げ、
 *   上体を少しだけ前に倒して届かせ、それでも届かない分は腕を伸ばす（前かがみやしゃがみ込みはしない）。
 */

type P = { h: number; d: number };

const H = 5.58; // 身長（ft）≒ 170cm

/** 高さ（身長に対する割合）。Drillis & Contini */
const LEVEL = {
	ankle: 0.039,
	knee: 0.285,
	hip: 0.53, // 大転子（股関節の高さの目安）
	shoulder: 0.818, // 肩峰（肩のいちばん上）
	chin: 0.87,
};
/** 長さ（身長に対する割合）。Drillis & Contini */
const LEN = {
	thigh: 0.245,
	shank: 0.246,
	upperArm: 0.186,
	forearm: 0.146,
	handToGrip: 0.05, // 手首からパドルを握る所まで（手の長さ 0.108 の約半分）
	head: 0.13, // あご〜頭のてっぺん
	footLength: 0.152,
};
/** 厚み（前後の幅。身長に対する割合）。日本人成人男性の平均的な値から */
const DEPTH = {
	head: 0.112, // 約19cm
	neck: 0.065, // 約11cm
	chest: 0.13, // 約22cm
	waist: 0.115, // 約20cm
	pelvis: 0.125, // 約21cm（おしりを含む）
	thigh: 0.085,
	shank: 0.06,
	upperArm: 0.05,
	forearm: 0.04,
};
/** 肩の関節（腕が回る所）は、肩峰より約4cm 下、胴の上の端の少し前 */
const SHOULDER_JOINT_DROP = 0.024;
/** 首のつけ根（第7頸椎の高さの目安） */
const NECK_BASE = 0.835;

/** パドル（ft）: 長さ約16インチ。握る手から面の真ん中まで約7.5インチ、手から先まで約13インチ、手からグリップの端まで約3インチ */
const PADDLE = { toFace: 7.5 / 12, toTip: 13 / 12, toButt: 3 / 12 };

/** 構え: ひざの曲げ（度）と上体の前傾（度）の、ふつうと最大 */
const STANCE = { kneeReady: 22, kneeMax: 42, leanReady: 6, leanMax: 15 };

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface SideFigureInput {
	/** 図の座標: 地面の線の x と、高さ 1ft あたりの長さ */
	x0: number;
	k: number;
	/** 人の立つ奥行き（図の y）と、ネットの向き（+1 か -1） */
	y: number;
	toNet: number;
	/** 打つ（受ける）高さ（ft）と、パドルの面の真ん中の奥行き（図の y。上から見た図のパドルと同じ） */
	hitH: number;
	faceY: number;
}

export interface SideFigure {
	shoe: string; // polygon の points
	leg: string; // polyline の points（足首・ひざ・股関節）
	torso: string; // path の d（胴の横から見た形）
	neck: [number, number, number, number];
	head: { cx: number; cy: number; rx: number; ry: number; rot: number };
	upperArm: [number, number, number, number];
	forearm: [number, number, number, number]; // ひじ → 手（パドルを握る所）
	paddle: [number, number, number, number];
	widths: { leg: number; neck: number; upperArm: number; forearm: number };
}

export function sideFigure(o: SideFigureInput): SideFigure {
	const { x0, k, y, toNet, hitH, faceY } = o;
	// 図の座標へ: 高さ h（ft）→ x、前後 d（ft、ネットの側が +）→ y。前後も k 倍にして形をゆがめない
	const X = (h: number) => x0 + h * k;
	const Y = (d: number) => y + toNet * d * k;
	const at = (p: P): [number, number] => [X(p.h), Y(p.d)];
	// パドルの面の真ん中: 本当の位置（ボールと同じ）を、図の前後の向きに戻す
	const face: P = { h: hitH, d: (faceY - y) / (toNet * k) };

	const thigh = LEN.thigh * H;
	const shank = LEN.shank * H;
	const ankle: P = { h: LEVEL.ankle * H, d: 0 };
	const trunkLen = (LEVEL.shoulder - LEVEL.hip) * H;
	const upper = LEN.upperArm * H;
	const lower = (LEN.forearm + LEN.handToGrip) * H;

	/** ひざの曲げ kneeDeg と上体の前傾 leanDeg のときの、骨組みの点 */
	const pose = (kneeDeg: number, leanDeg: number) => {
		// すねは前へ、ももは後ろへ、半分ずつ傾ける（腰が足の上に残る）
		const a = rad(kneeDeg / 2);
		const knee: P = { h: ankle.h + shank * Math.cos(a), d: ankle.d + shank * Math.sin(a) };
		const hip: P = { h: knee.h + thigh * Math.cos(a), d: knee.d - thigh * Math.sin(a) };
		const t = rad(leanDeg);
		const up = (len: number, from: P): P => ({ h: from.h + len * Math.cos(t), d: from.d + len * Math.sin(t) });
		const shoulderTop = up(trunkLen, hip);
		const shoulder = up(trunkLen - SHOULDER_JOINT_DROP * H, hip);
		const shoulderJoint: P = { h: shoulder.h, d: shoulder.d + 0.01 * H };
		const neckBase = up((NECK_BASE - LEVEL.hip) * H, hip);
		const chin = up((LEVEL.chin - LEVEL.hip) * H, hip);
		return { knee, hip, shoulderTop, shoulderJoint, neckBase, chin, t };
	};
	/** 肩からパドルを握る手までの距離（届くか） */
	const gripOf = (sj: P) => {
		const vh = face.h - sj.h;
		const vd = face.d - sj.d;
		const l = Math.hypot(vh, vd) || 1;
		const u = { h: vh / l, d: vd / l };
		return { grip: { h: face.h - u.h * PADDLE.toFace, d: face.d - u.d * PADDLE.toFace }, u };
	};
	const reach = upper + lower;
	const fits = (p: ReturnType<typeof pose>) => {
		const { grip } = gripOf(p.shoulderJoint);
		return Math.hypot(grip.h - p.shoulderJoint.h, grip.d - p.shoulderJoint.d) <= reach * 0.97;
	};
	// ふつうの構えから始め、届かなければ、ひざを少しずつ曲げ、上体を少しずつ倒す
	let knee = STANCE.kneeReady;
	let lean = STANCE.leanReady;
	let p = pose(knee, lean);
	while (!fits(p) && (knee < STANCE.kneeMax || lean < STANCE.leanMax)) {
		knee = Math.min(STANCE.kneeMax, knee + 1);
		lean = Math.min(STANCE.leanMax, lean + 0.4);
		p = pose(knee, lean);
	}

	// 腕: 肩の関節から手（パドルを握る所）まで、ひじで曲げる（2つの長さが決まった腕の、ひじの位置を求める）。
	// 届かないときはまっすぐ伸ばす。ひじは下・後ろ側に曲がる
	const { grip, u } = gripOf(p.shoulderJoint);
	const sj = p.shoulderJoint;
	const dx = grip.h - sj.h;
	const dz = grip.d - sj.d;
	const dist = Math.min(Math.hypot(dx, dz), reach * 0.999);
	const cosA = (upper * upper + dist * dist - lower * lower) / (2 * upper * dist);
	const base = Math.atan2(dz, dx);
	const bend = Math.acos(Math.max(-1, Math.min(1, cosA)));
	// ひじの候補は2つ（腕の線の両側）。ひじは下に来るほうを選ぶ（人のひじは手より下・体の側に曲がる）
	const cands = [base + bend, base - bend].map((g): P => ({ h: sj.h + upper * Math.cos(g), d: sj.d + upper * Math.sin(g) }));
	const elbow = cands[0].h <= cands[1].h ? cands[0] : cands[1];
	const toGrip = Math.atan2(grip.d - elbow.d, grip.h - elbow.h);
	const hand: P = { h: elbow.h + lower * Math.cos(toGrip), d: elbow.d + lower * Math.sin(toGrip) };
	const butt: P = { h: hand.h - u.h * PADDLE.toButt, d: hand.d - u.d * PADDLE.toButt };
	const tip: P = { h: hand.h + u.h * PADDLE.toTip, d: hand.d + u.d * PADDLE.toTip };

	// 胴の横から見た形: 背中側と胸側の線を、腰（股関節の少し下）から肩のいちばん上まで。上体の傾きに合わせて回す
	const trunkAt = (frac: number, side: number): P => {
		// frac: 0 = 股関節、1 = 肩のいちばん上。side: 前後のずれ（ft。胸側が +）
		const h = p.hip.h + frac * trunkLen * Math.cos(p.t) - side * Math.sin(p.t);
		const d = p.hip.d + frac * trunkLen * Math.sin(p.t) + side * Math.cos(p.t);
		return { h, d };
	};
	const profile: [number, number, number][] = [
		// [股関節からの割合, 背中側, 胸側]（ft）
		[-0.12, -DEPTH.pelvis * H * 0.62, DEPTH.pelvis * H * 0.38],
		[0.35, -DEPTH.waist * H * 0.45, DEPTH.waist * H * 0.55],
		[0.7, -DEPTH.chest * H * 0.45, DEPTH.chest * H * 0.55],
		[1.0, -DEPTH.chest * H * 0.35, DEPTH.chest * H * 0.3],
	];
	const back = profile.map(([f, b]) => at(trunkAt(f, b)));
	const front = profile.map(([f, , fr]) => at(trunkAt(f, fr))).reverse();
	const torso = `M${back.map((q) => q.join(' ')).join(' L')} L${front.map((q) => q.join(' ')).join(' L')} Z`;

	// 頭: 縦に長い楕円（高さ 0.13H、前後 0.112H）。あごの上、少し前に置き、上体と同じだけ傾ける
	const headC: P = {
		h: p.chin.h + (LEN.head * H) / 2 * Math.cos(p.t),
		d: p.chin.d + (LEN.head * H) / 2 * Math.sin(p.t) + 0.012 * H,
	};
	const [hcx, hcy] = at(headC);

	// スニーカー（足首の真下を 0 とした、前後・高さ ft の点。長さは足の長さ 0.152H）
	const fl = LEN.footLength * H;
	const sneaker: [number, number][] = [
		[-0.22, 0.02], [0.75, 0.02], [0.8, 0.05], [0.81, 0.1], [0.76, 0.14], [0.55, 0.18], [0.28, 0.27], [0.08, 0.33], [-0.12, 0.33], [-0.2, 0.28], [-0.23, 0.13],
	].map(([d, h]) => [d * fl, h * fl]) as [number, number][];

	const line = (a: P, b: P): [number, number, number, number] => [...at(a), ...at(b)];
	return {
		shoe: sneaker.map(([d, h]) => at({ h, d }).join(',')).join(' '),
		leg: [ankle, p.knee, p.hip].map((q) => at(q).join(',')).join(' '),
		torso,
		neck: line(p.neckBase, { h: p.chin.h - 0.01 * H, d: p.chin.d + 0.01 * H }),
		head: { cx: hcx, cy: hcy, rx: (LEN.head * H * k) / 2, ry: (DEPTH.head * H * k) / 2, rot: (toNet * p.t * 180) / Math.PI },
		upperArm: line(sj, elbow),
		forearm: line(elbow, hand),
		paddle: [...at(butt), ...at(tip)],
		widths: {
			leg: ((DEPTH.thigh + DEPTH.shank) / 2) * H * k,
			neck: DEPTH.neck * H * k,
			upperArm: DEPTH.upperArm * H * k,
			forearm: DEPTH.forearm * H * k,
		},
	};
}
