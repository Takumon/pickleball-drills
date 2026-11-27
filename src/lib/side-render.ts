/**
 * 横から見た人を、組み立て直した形（sideFigure の結果）で描き直す。決めのポーズのあいだを動かすときに、毎コマ呼ぶ。
 * 腕の見える形（台形）は、位置のデータを持つ線に合わせて syncArm で描く
 */
import { sideFigure, type PoseAngles, type SideFigure, type SideFigureInput } from './side-figure';
import { syncArm } from './arm-shape';

export function renderSide(g: Element, fig: SideFigure) {
	const set = (sel: string, attrs: Record<string, string | number>) => {
		const el = g.querySelector(sel);
		if (!el) return;
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
		el.removeAttribute('transform');
	};
	const line = ([x1, y1, x2, y2]: number[]) => ({ x1, y1, x2, y2 });
	set('.side-shoe2', { points: fig.shoe2 });
	set('.side-lower2', { d: fig.lowerBody2 });
	set('.side-shoe', { points: fig.shoe });
	set('.side-lower', { d: fig.lowerBody });
	set('.side-torso', { d: fig.torso });
	set('.side-neck-shape', { d: fig.neckShape });
	set('.side-head', { d: fig.headShape });
	set('.side-hair', { d: fig.hair });
	set('.side-upperarm', line(fig.upperArm));
	set('.side-arm', line(fig.forearm));
	set('.side-grip', line(fig.grip));
	set('.side-paddle', line(fig.face));
	set('.side-hand', { cx: fig.hand.cx, cy: fig.hand.cy });
	syncArm(g);
}

/** 決めのポーズの角度を混ぜる（t: 0 → a、1 → b） */
export const mixAngles = <T extends Record<string, number>>(a: T, b: T, t: number): T =>
	Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * t])) as T;

/**
 * 決めのポーズを混ぜる: 上腕・前腕・パドルの「向き」（真下から前へ回る角度）を、近い回り方で混ぜる（t: 0 → a、1 → b）。
 * 関節ごとの角度をそのまま混ぜると、たとえば構え（パドルが上）から引き切り（パドルが後ろ）へ動く途中で、
 * パドルが下を通って前へ倒れる。向きを近い回り方で混ぜると、上 → 後ろへ自然に回る
 */
export function mixPose<T extends { knee: number; lean: number; shoulder: number; elbow: number; paddle: number; across?: number }>(a: T, b: T, t: number): T {
	const turn = (x: number, y: number) => {
		let d = (y - x) % 360;
		if (d > 180) d -= 360;
		if (d < -180) d += 360;
		return x + d * t;
	};
	const fa = a.shoulder + a.elbow;
	const fb = b.shoulder + b.elbow;
	const shoulder = turn(a.shoulder, b.shoulder);
	const fore = turn(fa, fb);
	// 手首（パドルの前腕に対する角度）は ±80° の範囲なので、そのまま混ぜる（向きで混ぜると、途中で範囲を越えて跳ぶ）
	const padRel = a.paddle + (b.paddle - a.paddle) * t;
	// 関節の角度に戻すときは、-180〜180° に直す（向きを回した分が 360° ずれていることがあるため）
	const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
	const across = a.across !== undefined && b.across !== undefined ? turn(a.across, b.across) : undefined;
	return { ...a, knee: a.knee + (b.knee - a.knee) * t, lean: a.lean + (b.lean - a.lean) * t, shoulder, elbow: wrap(fore - shoulder), paddle: padRel, ...(across !== undefined ? { across } : {}) };
}

/**
 * 決めのポーズを、その手の打つ高さに合わせる: 打つ瞬間のポーズで、パドルの面の真ん中が打つ高さ（input.hitH）に来るように、
 * 4つのポーズの上腕の向きを同じだけ回す（±50° まで）。体の前後の位置（bodyBack）も、打つ瞬間の面の真ん中が球の奥行きに来る値にする。
 * パドルの面の真ん中はボールと同じ高さ・奥行きに置く（docs/diagrams.md）ため
 */
export function fitPoses<K extends string>(input: SideFigureInput, poses: Record<K, PoseAngles> & { contact: PoseAngles }) {
	const faceAt = (d: number) => sideFigure({ ...input, angles: { ...poses.contact, shoulder: poses.contact.shoulder + d } }).faceH;
	// 上腕を前へ回すほど面は上がる（構えの範囲では）。二分探索
	let lo = -50;
	let hi = 50;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (faceAt(mid) < input.hitH) lo = mid;
		else hi = mid;
	}
	// 届かないとき（±50° 回しても打つ高さに来ない）は、近いほうの端まで回し、作る人に知らせる（面が球から離れるため）
	const d = lo;
	if (Math.abs(faceAt(d) - input.hitH) >= 0.05)
		console.warn(`決めのポーズ: 上腕を ${d.toFixed(0)}° 回しても、面が打つ高さ ${input.hitH}ft に届かない（${input.shot ?? ''}）。ポーズか hit を見直す`);
	const fitted = Object.fromEntries(Object.entries(poses).map(([k, a]) => [k, { ...(a as PoseAngles), shoulder: (a as PoseAngles).shoulder + d }])) as Record<K, PoseAngles>;
	const bodyBack = sideFigure({ ...input, angles: (fitted as Record<string, PoseAngles>).contact }).bodyBack;
	return { poses: fitted, bodyBack };
}
