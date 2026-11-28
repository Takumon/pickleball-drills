import { swingPath, flickLines } from '../lib/swing-path';
import { syncArm } from '../lib/arm-shape';
import { blendGroup, sideBlender, snapshotGroup, snapshotSide } from '../lib/side-blend';
import { sideFigure, type PoseAngles, type SideFigureInput } from '../lib/side-figure';
import { fitPoses, mixPose, renderSide } from '../lib/side-render';
import { arcLerp, bendSide, clampReach, limitShoulder, solveElbow } from '../lib/arm-ik';
/**
 * コート図のアニメーション。場面（.frame）を1つずつ表示し、
 * 打球はボールを線に沿って動かし（線も伸ばして描く）、人の動きは人を移動先まで動かす。
 */
const SHOT_MS = 900;
/** 打つ前に一度弾ませる球（data-pre）で、弾んでから打点まで上がる時間（ミリ秒） */
const PRE_MS = 800;
/** そのうち、手から落としたボールが地面に着くまでの時間と、落とす手の高さ（ft） */
const PRE_DROP_MS = 420;
const HAND_FT = 3;
/**
 * トラップ（相手から来た球を面で受けて、ほんの少し上げる）: 受けた高さから POP_FT だけ上がってから落ちる。
 * 前の手の終わり（球が届いたパドルの位置と高さ）から途切れずにつながるようにする
 */
const TRAP_POP_FT = 0.8;
const TRAP_DROP_MS = 620;
/** 弾んでから打点まで上がる時間 */
const PRE_RISE_MS = PRE_MS - PRE_DROP_MS;
/** 受けた高さ h0 から pop だけ上がって地面（0）に落ちる放物線（u: 0〜1） */
/** ボレーのトラップ: 受けた高さ h0 から pop だけ上がって、打つ高さ h1 まで落ちる放物線（弾ませない） */
const popTo = (h0: number, pop: number, h1: number) => {
	const a = 2 * pop + Math.sqrt(Math.max(0, 4 * pop * pop + 4 * pop * (h0 - h1)));
	const b = h0 + a - h1;
	return (u: number) => h0 + a * u - b * u * u;
};
const popArc = (h0: number, pop: number) => {
	const a = 2 * pop + Math.sqrt(4 * pop * pop + 4 * pop * h0);
	const b = h0 + a;
	return (u: number) => Math.max(0, h0 + a * u - b * u * u);
};
/** ボールの大きさ（高さ 1ft あたり）。高さそのものは右の帯（横から見た図）で見せる */
const BALL_R_GROUND = 0.6;
const BALL_R_PER_FT = 0.05;
const BALL_R_MAX = 1;
const PAUSE_MS = 700;
const LOOP_PAUSE_MS = 1600;
/**
 * 打つ動き（config/court.ts の shotSwing。data-swing = 振りかぶり[上,前],振り抜き[上,前]）:
 * 相手の球が飛んでくる手の後半（PREP_FROM から）に振りかぶり、打つ手で振りかぶり → 打つ所 → 振り抜きと SWING_MS で振り、
 * RETURN_MS で元の構えへ戻る。ボールは、パドルが打つ所を通る瞬間に飛び出す。SWING_SCALE を 0 にすると打つ動きはなくなる（振りの大きさ・腕を回す角度・決めのポーズのどれも）
 */
const SWING_SCALE: number = 1;
const SWING_MS = 300;
/** 振り抜いた形で少し止める時間（振り抜き＝フォロースルーが見えるように） */
const HOLD_MS = 220;
const RETURN_MS = 450;
const PREP_FROM = 0.55;
/** 振りの間に手を伸ばせる量（腕の長さとの比）。0.93 でひじは約 135° */
const REACH_RATIO = 0.93;
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const easeInv = (c: number) => (c < 0.5 ? Math.sqrt(c / 2) : 1 - Math.sqrt((1 - c) / 2));
type Vec = [number, number];
type Vec3 = [number, number, number];
const REST: Vec3 = [0, 0, 0];
/** 線を引き直す（元の端を data-o* に覚えておき、restoreLine で戻す）。3次元で動かすフリックで使う */
function setLine(el: SVGLineElement, [x1, y1, x2, y2]: number[]) {
	if (el.dataset.ox1 === undefined) for (const k of ['x1', 'y1', 'x2', 'y2']) el.dataset[`o${k}`] = el.getAttribute(k) ?? '0';
	el.removeAttribute('transform');
	el.setAttribute('x1', String(x1));
	el.setAttribute('y1', String(y1));
	el.setAttribute('x2', String(x2));
	el.setAttribute('y2', String(y2));
}
function restoreLine(el: Element) {
	const d = (el as SVGElement).dataset;
	if (d.ox1 === undefined) return;
	for (const k of ['x1', 'y1', 'x2', 'y2']) el.setAttribute(k, d[`o${k}`]!);
	for (const k of ['ox1', 'oy1', 'ox2', 'oy2']) delete d[k];
}
/**
 * 打つ人のパドルと腕を、打つ所からのずれ [上へ, 前へ]（ft）だけ動かす道具。上から見た図は前へのずれだけを、打球の向きに動かす。
 * 横から見た図は、手を肩を中心にした弧で動かし、パドルを手のまわりに回し、腕は長さを変えずに曲げ直す
 */
function hitterRig(frame: SVGSVGElement, ball: SVGPathElement) {
	const id = ball.dataset.hitter;
	if (!id) return undefined;
	const g = frame.querySelector<SVGGElement>(`[data-player-id="${id}"]`);
	const paddle = g?.querySelector<SVGLineElement>('.paddle');
	const arm = g?.querySelector<SVGLineElement>('.arm');
	if (!paddle || !arm) return undefined;
	const side = frame.querySelector<SVGGElement>(`[data-side-player="${id}"]`);
	// 決めのポーズ（data-keyposes）がある打ち方は、関節の角度のあいだを動かす（案A）
	if (ball.dataset.keyposes && side?.dataset.poseInput) return poseRig(ball, paddle, arm, side);
	// 横から見た図: パドル（グリップと面）は手のまわりに回し、手は動かすだけ
	const sidePaddle = side ? [...side.querySelectorAll<SVGElement>('.side-paddle, .side-grip')] : [];
	const sideHand = side?.querySelector<SVGCircleElement>('.side-hand');
	const hx = Number(sideHand?.getAttribute('cx') ?? 0);
	const hy = Number(sideHand?.getAttribute('cy') ?? 0);
	const forearm = side?.querySelector<SVGLineElement>('.side-arm');
	const upperArm = side?.querySelector<SVGLineElement>('.side-upperarm');
	// 3次元で動かす振り（フォアのフリック）: 横から見たグリップと面の線を、毎こま引き直す
	const lateral = ball.dataset.lateral !== undefined;
	const [latStart, latEnd, latBulge] = (ball.dataset.lateral ?? '-105,60').split(',').map(Number);
	// 振りの中でひじの曲げ方を変える（data-elbow-bend）・グリップが見える間（data-grip-front）。図の見方のカードと同じ
	const elbowBend = ball.dataset.elbowBend?.split(',').map(Number);
	const gripFront = ball.dataset.gripFront?.split(',').map(Number);
	const sideGrip = side?.querySelector<SVGLineElement>('.side-grip');
	const sideFace = side?.querySelector<SVGLineElement>('.side-paddle');
	const ftK = Number(sideFace?.getAttribute('stroke-width')) / 0.078 || 1;
	// 線の元の端を覚えておく（途中で止めても戻せるように）
	const keep = (el?: SVGLineElement | null) => {
		if (!el) return;
		for (const a of ['x1', 'y1', 'x2', 'y2']) el.dataset[a] ??= el.getAttribute(a) ?? '0';
	};
	[arm, forearm, upperArm].forEach(keep);
	const d = (el: SVGLineElement | null | undefined) => (el ? Math.hypot(Number(el.dataset.x2) - Number(el.dataset.x1), Number(el.dataset.y2) - Number(el.dataset.y1)) : 0);
	const armLen = { upper: d(upperArm), lower: d(forearm) };
	const n0 = (el: SVGLineElement | null | undefined, k: string) => Number(el?.dataset[k]);
	const armSide = bendSide(n0(upperArm, 'x1'), n0(upperArm, 'y1'), n0(upperArm, 'x2'), n0(upperArm, 'y2'), n0(forearm, 'x2'), n0(forearm, 'y2'));
	const len = ball.getTotalLength();
	const a = ball.getPointAtLength(0);
	const z = ball.getPointAtLength(Math.min(len, 3));
	const n = Math.hypot(z.x - a.x, z.y - a.y) || 1;
	const ux = (z.x - a.x) / n;
	const uy = (z.y - a.y) / n;
	const sideK = Number(frame.dataset.sideK) || 0.8;
	const v = (ball.dataset.swing ?? '0,-0.5,0.3,0.6,0,0').split(',').map((x) => Number(x) * SWING_SCALE);
	// [上へ, 前へ, パドルの回り（度）]
	let back: Vec3 = [v[0], v[1], v[4] ?? 0];
	let follow: Vec3 = [v[2], v[3], v[5] ?? 0];
	// 回る向き: 前から上へ（+）は、図ではネットの向きによって時計回りか反時計回りになる
	const turnSign = -Math.sign(uy || 1);
	const set = (el: SVGLineElement, k: 'x1' | 'y1' | 'x2' | 'y2', d: number) => el.setAttribute(k, String(Number(el.dataset[k]) + d));
	// 横から見た図の手の位置: 構えの手からのずれ（届かない所なら、届く所で止める）
	const sx0 = n0(upperArm, 'x1');
	const sy0 = n0(upperArm, 'y1');
	const rx = n0(forearm, 'x2');
	const ry = n0(forearm, 'y2');
	// 手を伸ばせる所: 腕をいっぱいに伸ばさず、ひじが少し曲がった所まで（REACH_RATIO。テニスのフォアハンドの研究では、
	// 振りかぶりでひじ 120°、打つ所で 130〜140°）。構えのほうが遠ければ構えの所まで
	const reach = Math.max((armLen.upper + armLen.lower) * REACH_RATIO, Math.hypot(rx - sx0, ry - sy0) + 1e-6);
	const handAt = ([up, fwd]: Vec3): [number, number] => clampReach(sx0, sy0, rx + up * sideK, ry + Math.sign(uy) * fwd, reach);
	/**
	 * 関節を軸に回す振り（data-pivot）: 腕とパドルを1つのかたまりとして、肩（ロールボレー）かひじ（フリック）のまわりに回す。
	 * 手首の角度は変えない（パドルの回りは、腕の回りと同じ）。振りかぶりと振り抜きは、回す角度（turn）だけで決まる
	 */
	const pivot = ball.dataset.pivot;
	// まっすぐ押し出す振り（data-straight）
	const straight = ball.dataset.straight !== undefined;
	const pcx = pivot === 'elbow' ? n0(upperArm, 'x2') : sx0;
	const pcy = pivot === 'elbow' ? n0(upperArm, 'y2') : sy0;
	if (pivot && forearm && upperArm) {
		// 腕を回す角度（data-pivot-turn。なければパドルと同じ）
		const arm = (ball.dataset.pivotTurn ?? '').split(',').map((x) => Number(x) * SWING_SCALE);
		const turned = (deg: number, armDeg: number): Vec3 => {
			const a = (turnSign * armDeg * Math.PI) / 180;
			const x = pcx + (rx - pcx) * Math.cos(a) - (ry - pcy) * Math.sin(a);
			const y = pcy + (rx - pcx) * Math.sin(a) + (ry - pcy) * Math.cos(a);
			return [(x - rx) / sideK, (y - ry) * Math.sign(uy || 1), deg];
		};
		back = turned(back[2], arm.length === 2 ? arm[0] : back[2]);
		follow = turned(follow[2], arm.length === 2 ? arm[1] : follow[2]);
	}
	/**
	 * 打つ所からのずれ p → q の途中（t）の形にする。上から見た図は前へのずれをまっすぐ、
	 * 横から見た図は手を肩を中心にした弧で動かす（lib/arm-ik.ts の arcLerp。ひじが急に曲がらないように）
	 */
	const apply = (p: Vec3, q: Vec3 = p, t = 0) => {
		const fwd = p[1] + (q[1] - p[1]) * t;
		const turn = p[2] + (q[2] - p[2]) * t;
		const dx = ux * fwd;
		const dy = uy * fwd;
		paddle.setAttribute('transform', fwd ? `translate(${dx} ${dy})` : '');
		set(arm, 'x2', dx);
		set(arm, 'y2', dy);
		let sx = 0;
		let sy = 0;
		if (forearm && upperArm) {
			// 手は軸（関節を軸に回す振りはその関節、ほかは肩）を中心にした弧で動かす
			const a = handAt(p);
			const b = handAt(q);
			const path: [number, number] = straight ? [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] : arcLerp(pcx, pcy, a, b, t);
			const [cx, cy] = limitShoulder(sx0, sy0, ...clampReach(sx0, sy0, ...path, reach), Math.sign(uy || 1));
			sx = cx - rx;
			sy = cy - ry;
		}
		const rot = turnSign * turn;
		if (lateral && sideGrip && sideFace) {
			const ln = flickLines(turn, hx + sx, hy + sy, ftK, Math.sign(uy || 1), latStart, latEnd, Number.isFinite(latBulge) ? latBulge : undefined);
			// 図の見方のカードと同じ描き方: 面の幅は描かず、パドルの軸の線（グリップとつながる。35% より短くしない）
			setLine(sideGrip, ln.gripAxis);
			setLine(sideFace, ln.axis);
			// パドルが手より手前の間（data-grip-front）は、手の上にパドルを描いてグリップを見せる
			const s01 = 0.5 + turn / 200;
			const front = !!gripFront && s01 >= gripFront[0] && s01 < gripFront[1];
			if (sideHand) {
				if (front && sideHand.compareDocumentPosition(sideGrip) & Node.DOCUMENT_POSITION_PRECEDING) sideGrip.before(sideHand);
				if (!front && sideHand.compareDocumentPosition(sideFace) & Node.DOCUMENT_POSITION_FOLLOWING) sideFace.after(sideHand);
			}
		} else {
			[sideGrip, sideFace].forEach((el) => el && restoreLine(el));
			if (sideHand && sideFace && sideHand.compareDocumentPosition(sideFace) & Node.DOCUMENT_POSITION_FOLLOWING) sideFace.after(sideHand);
			sidePaddle.forEach((el) => el.setAttribute('transform', sx || sy || rot ? `translate(${sx} ${sy}) rotate(${rot} ${hx} ${hy})` : ''));
		}
		sideHand?.setAttribute('transform', sx || sy ? `translate(${sx} ${sy})` : '');
		// 腕は、肩から動いた手まで、上腕と前腕の長さを変えずに曲げ直す
		if (forearm && upperArm) {
			const n = (el: SVGLineElement, k: string) => Number(el.dataset[k]);
			const hxx = n(forearm, 'x2') + sx;
			const hyy = n(forearm, 'y2') + sy;
			const bendS = Math.max(0, Math.min(1, 0.5 + turn / 200));
			const bend = lateral && elbowBend ? elbowBend[0] + (elbowBend[1] - elbowBend[0]) * bendS : 1;
			const [ex, ey] = solveElbow(n(upperArm, 'x1'), n(upperArm, 'y1'), hxx, hyy, armLen.upper, armLen.lower, armSide * bend);
			forearm.setAttribute('x2', String(hxx));
			forearm.setAttribute('y2', String(hyy));
			forearm.setAttribute('x1', String(ex));
			forearm.setAttribute('y1', String(ey));
			upperArm.setAttribute('x2', String(ex));
			upperArm.setAttribute('y2', String(ey));
			syncArm(side);
		}
	};
	// パドルが打つ所を通る時刻（振りの中の割合）: 振りかぶりと振り抜きの長さの比
	// 途中の点（data-swing の7つ目から、3つずつ）
	const via: Vec3[] = [];
	for (let i = 6; i + 2 < v.length; i += 3) via.push([v[i], v[i + 1], v[i + 2]]);
	const path = swingPath(back, follow, via);
	// ほかの球と同じ構えから打つ打ち方（data-setup）は、振りかぶった形が構え
	const setup = ball.dataset.setup !== undefined;
	// 構えから打つ打ち方（setup）は、球を待つ手の初めのうちに構え（back）へ移る。打ったあとは止まった形（REST）へ戻り、次の手の止まった形とつながる
	// 打ったあとは、どの打ち方も止まった形（REST）へ戻る。前は setup の打ち方は構え（back）へ戻していたが、フリックの振り抜き
	// （パドルの先が上）から、ヘッドを下げた構えへ戻ると、打ったあとにパドルが垂れ下がって見えた（書き手の指摘 2026-11-28）
	// 振り終わりで止める打ち方（data-hold。フリック）は、打ったあとも振り終わりの形のまま（手を戻さない）
	const hold = ball.dataset.hold !== undefined;
	return { apply, back, follow, contact: path.contact, at: path.at, home: hold ? follow : REST, prepFrom: REST, setup };
}
/**
 * 決めのポーズで動かす道具: 構え（ready）→ 引き切り（back）→ 打つ瞬間（contact）→ 振り抜き（finish）→ 構え の角度のあいだを混ぜ、
 * 毎コマ横から見た人を組み立て直す（lib/side-figure.ts の angles）。体の前後の位置は打つ瞬間のまま動かさない。
 * ほかの打ち方の道具と同じ形で使えるように、ポーズを点 [番号, 0, 0] で表す（0 = 打つ瞬間、1 = 引き切り、2 = 振り抜き、3 = 構え）
 */
function poseRig(ball: SVGPathElement, paddle: SVGLineElement, arm: SVGLineElement, side: SVGGElement) {
	const input = JSON.parse(side.dataset.poseInput!) as SideFigureInput;
	// ポーズは打つ高さに合わせる（fitPoses）
	const fit = fitPoses(input, JSON.parse(ball.dataset.keyposes!) as Record<'ready' | 'back' | 'contact' | 'finish', PoseAngles>);
	const poses = fit.poses;
	const contactFig = sideFigure({ ...input, angles: poses.contact, bodyBack: fit.bodyBack });
	const order = [poses.contact, poses.back, poses.finish, poses.ready];
	for (const a of ['x1', 'y1', 'x2', 'y2']) arm.dataset[a] ??= arm.getAttribute(a) ?? '0';
	const len = ball.getTotalLength();
	const a0 = ball.getPointAtLength(0);
	const z = ball.getPointAtLength(Math.min(len, 3));
	const n = Math.hypot(z.x - a0.x, z.y - a0.y) || 1;
	const ux = (z.x - a0.x) / n;
	const uy = (z.y - a0.y) / n;
	const at = (v: Vec3) => order[Math.round(v[0])] ?? poses.contact;
	// 構え（3）から引き始めるときは、そのとき描いてある形（止まった形や、別の打ち方の構え）からなめらかにつなぐ。
	// 形は引き始めの最初の呼び出しで覚える（道具を作った後に、ほかの道具が形を変えることがあるため）
	let restShape: Map<string, string> | undefined;
	const apply = (p: Vec3, q: Vec3 = p, t = 0) => {
		// 構えから動く途中だけ混ぜる（構えに止まっているとき・戻り終えたときは、構えそのものを描く）
		const leaving = Math.round(p[0]) === 3 && Math.round(q[0]) !== 3;
		if (leaving && !restShape) restShape = snapshotGroup(side);
		const fig = sideFigure({ ...input, angles: mixPose(at(p), at(q), t), bodyBack: fit.bodyBack });
		side.dataset.posed = '1';
		renderSide(side, fig);
		if (leaving && restShape) blendGroup(side, restShape, t);
		// 上から見た図: 手が打つ瞬間より前に出たぶんだけ、パドルを打球の向きへ動かす
		const fwd = (fig.hand.cy - contactFig.hand.cy) * Math.sign(uy || 1);
		paddle.setAttribute('transform', fwd ? `translate(${ux * fwd} ${uy * fwd})` : '');
		arm.setAttribute('x2', String(Number(arm.dataset.x2) + ux * fwd));
		arm.setAttribute('y2', String(Number(arm.dataset.y2) + uy * fwd));
	};
	// 振りを止める設定（SWING_SCALE = 0）では、打つ瞬間のポーズのまま動かさない
	if (SWING_SCALE === 0) order.splice(0, 4, poses.contact, poses.contact, poses.contact, poses.contact);
	const back: Vec3 = [1, 0, 0];
	// 振り抜きの点は 1.5（四捨五入で 2 = 振り抜き）。道のりの比で、打つ瞬間が振りの 40% の所に来る（図の見方のカードと同じ）
	const follow: Vec3 = [1.5, 0, 0];
	const path = swingPath(back, follow);
	return { apply, back, follow, contact: path.contact, at: path.at, home: [3, 0, 0] as Vec3, prepFrom: [3, 0, 0] as Vec3, setup: false };
}
type Rig = NonNullable<ReturnType<typeof hitterRig>>;
/** 走るときの1歩の時間（ミリ秒） */
const RUN_STEP_MS = 260;
/**
 * ロブに下がって、弾んでから打つ人（data-run の動き）の横から見た形（書き手と決めた）:
 * 相手がロブを打ったら後ろ（ベースラインの側）へ向きを変え、まっすぐ走る（足を交互に出し、腕を振る。パドルは持ったまま）。
 * 着く少し前に、前足を一歩踏み込んで止まり、体をネットのほうへ向け直す（両足が前後に開き、前足に体重が乗る。オープンスタンスで前を向く）。
 * tm は動きの進み（0〜1）、ms は動き出してからの時間
 */
function runnerRig(side: SVGGElement) {
	const input = JSON.parse(side.dataset.poseInput!) as SideFigureInput;
	// 後ろを向いた形は、ネットの向きを逆にして描く（立つ位置を軸に左右が入れ替わる）
	const away: SideFigureInput = { ...input, toNet: -input.toNet };
	// 足: [ももの向き, ひざの曲げ]。前へ出す足はひざを伸ばし、後ろへ蹴った足はひざを曲げる
	// （後ろへ蹴った足のすねは、ほぼ水平まで。それより上げると、かかとがお尻に付くような形になる）
	const leg = (u: number): [number, number] => [30 * u, 20 + 30 * (0.5 - 0.5 * u)];
	const runFig = (ms: number) => {
		const sw = Math.sin((ms / RUN_STEP_MS) * Math.PI);
		return sideFigure({ ...away, bodyBack: 0, angles: { knee: 25, lean: 18, shoulder: 25 - 40 * sw, elbow: 85, paddle: 20 }, legs: { near: leg(sw), far: leg(-sw) } });
	};
	// 踏み込んだ形の腕は、次に打つ球（ドロップ）の引いた形に近づける（腕を下ろしてパドルを体の横で低く引く）。
	// 構えの形（パドルを前に立てる）で止めると、次の手で振りかぶるときにパドルが一気に動いて跳ぶ
	const stepFig = sideFigure({ ...input, bodyBack: 0, angles: { knee: 35, lean: 20, shoulder: -5, elbow: 20, paddle: -25 }, legs: { near: [28, 25], far: [-18, 12] } });
	// 向きを変える割合（はじめ）と、踏み込んで前を向き直り始める割合（おわり）
	const TURN = 0.15;
	const STEP = 0.8;
	let fromShape: Map<string, string> | undefined;
	let runShape: Map<string, string> | undefined;
	return (tm: number, ms: number) => {
		if (tm <= 0) return;
		side.dataset.posed = '1';
		if (tm < TURN) {
			fromShape ??= snapshotGroup(side);
			renderSide(side, runFig(ms));
			blendGroup(side, fromShape, easeInOut(tm / TURN));
		} else if (tm < STEP) renderSide(side, runFig(ms));
		else if (tm < 1) {
			if (!runShape) {
				renderSide(side, runFig(ms));
				runShape = snapshotGroup(side);
			}
			renderSide(side, stepFig);
			blendGroup(side, runShape, easeInOut((tm - STEP) / (1 - STEP)));
		} else renderSide(side, stepFig);
	};
}
/**
 * 打つ手の中の時刻 s（ミリ秒）での形を、r.apply で作る: 振りかぶり → 打つ所 → 振り抜き → 止める → 構えへ戻る。
 * 振りは打つ所で2つに分け、どちらも弧で動かす（打つ瞬間にパドルが必ず打つ所を通る）
 */
const swingAt = (r: Rig, s: number) => {
	if (s < 0) return r.apply(r.back);
	if (s < SWING_MS) {
		return r.apply(...r.at(easeInOut(s / SWING_MS)));
	}
	if (s < SWING_MS + HOLD_MS) return r.apply(r.follow);
	if (s < SWING_MS + HOLD_MS + RETURN_MS) return r.apply(r.follow, r.home, easeInOut((s - SWING_MS - HOLD_MS) / RETURN_MS));
	return r.apply(r.home);
};
/**
 * 最後の手から最初の手へ戻るとき（ループ）: 人は最初の手の立ち位置まで歩いて戻り、ボールは新しい球になるなら消してから出し直す。
 * 図が途切れたり、人やボールが跳んだりして見えないようにするため（docs/diagrams.md「アニメーション」の連続性）
 */
const REWIND_MS = 700;
const BALL_FADE_MS = 300;

function setup(root: HTMLElement) {
	const frames = [...root.querySelectorAll<SVGSVGElement>('svg.frame')];
	const dots = [...root.querySelectorAll<HTMLElement>('[data-step-dot]')];
	// ゲーム形式の点の目盛り: 手の始まりは「前の点」、手が終わったら「後の点」へ印を動かす
	const track = root.querySelector<HTMLElement>('[data-score-track]');
	const marker = track?.querySelector<HTMLElement>('.score-marker');
	const scoreTo = Number(track?.dataset.scoreTo) || 1;
	const setScore = (v: number | undefined, instant: boolean) => {
		if (!marker || v === undefined || Number.isNaN(v)) return;
		marker.classList.toggle('instant', instant);
		marker.style.setProperty('--pos', String((v + scoreTo) / (scoreTo * 2)));
	};
	const scoreOf = (f: SVGSVGElement, k: 'scoreBefore' | 'scoreAfter') => (f.dataset[k] !== undefined ? Number(f.dataset[k]) : undefined);
	const toggleBtn = root.querySelector<HTMLButtonElement>('[data-act="toggle"]')!;
	let current = 0;
	// 「視差効果を減らす」設定のときは自動再生せず、ボタンで1手ずつ切り替えて静止した図を見せる
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	let playing = !reduce;
	let raf = 0;
	let blendRaf = 0;
	let timer = 0;

	const stop = () => {
		cancelAnimationFrame(raf);
		cancelAnimationFrame(blendRaf);
		clearTimeout(timer);
	};

	/** 場面 i を表示し、その手を動かす。終わったら done を呼ぶ */
	/** 線 path の長さの割合 ratio の位置にあるボール（地面の位置と高さ ft） */
	type BallPos = { x: number; y: number; h: number };
	const ballAt = (path: SVGPathElement, ratio: number): BallPos => {
		const p = path.getPointAtLength(path.getTotalLength() * ratio);
		// 高さ（data-h: 線に沿った高さ ft の列）を補間する
		const hs = path.dataset.h?.split(',').map(Number);
		let h = 0;
		if (hs) {
			const x = ratio * (hs.length - 1);
			const i = Math.min(Math.floor(x), hs.length - 2);
			h = hs[i] + (hs[i + 1] - hs[i]) * (x - i);
		}
		return { x: p.x, y: p.y, h };
	};
	/**
	 * 手 i を始めるときにボールがある位置（= それより前で最後に打った手の終わり）。
	 * 人が動くだけの手では、この位置にボールを置いておく。どの手から見ても同じになるよう、前もって決めておく
	 */
	const startBall: (BallPos | undefined)[] = [];
	{
		let last: BallPos | undefined;
		frames.forEach((f, k) => {
			startBall[k] = last;
			const p = f.querySelector<SVGPathElement>('path[data-kind="ball"]');
			if (p) {
				// 隠れている図では長さを測れないので、一時的に見せて測る
				const prev = f.style.display;
				f.style.display = '';
				last = ballAt(p, 1);
				f.style.display = prev;
			}
		});
	}

	function show(i: number, animate: boolean, done?: () => void) {
		stop();
		// 手が切り替わる前の、横から見た人の形（次の手の始まりへなめらかにつなぐため）
		const prevSnap = animate && current !== i && frames[current]?.style.display !== 'none' ? snapshotSide(frames[current]) : undefined;
		// 前の手の終わりのボールの位置（トラップは、球が届いた所から始める。線の先はパドルの少し手前で終わるため）
		const prevBall = (() => {
			if (!animate || current === i) return undefined;
			const m = frames[current]?.querySelector('.ball')?.getAttribute('transform')?.match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/);
			return m ? { x: Number(m[1]), y: Number(m[2]) } : undefined;
		})();
		// 前の混ぜ途中で止めた残り（data-blend-ty）を消す
		root.querySelectorAll<HTMLElement>('[data-blend-ty], [data-move-ty]').forEach((g) => {
			delete g.dataset.blendTy;
			delete g.dataset.moveTy;
		});
		current = i;
		frames.forEach((f, k) => (f.style.display = k === i ? '' : 'none'));
		dots.forEach((d, k) => d.classList.toggle('active', k === i));
		const frame = frames[i];
		// 点の目盛り: 動かす手は前の点から、止まった図は後の点を見せる
		setScore(scoreOf(frames[i], animate ? 'scoreBefore' : 'scoreAfter'), true);
		// 「失点」は、動かす手では手が終わってから出す
		frames[i].querySelectorAll('[data-lost], [data-win]').forEach((t) => t.classList.toggle('on', !animate));
		frames[i].classList.toggle('won', !animate && !!frames[i].querySelector('[data-win]'));
		// ループで消したボールを、次に見せるときは元に戻す
		frame.querySelectorAll<SVGElement>('.ball, .side-ball').forEach((b) => (b.style.opacity = ''));
		const ball = frame.querySelector<SVGGElement>('.ball')!;
		const balls = [...frame.querySelectorAll<SVGPathElement>('path[data-kind="ball"]')];
		const sideBall = frame.querySelector<SVGCircleElement>('.side-ball');
		// 球を2つ以上同時に使う手: 2つ目からのボールは、1つ目のボールの絵を写して足す（どの球も同時に飛ぶ）
		const ballEls = balls.map((_, k) => {
			if (k === 0) return { b: ball, s: sideBall };
			let b = frame.querySelector<SVGGElement>(`.ball[data-k="${k}"]`);
			let sb = frame.querySelector<SVGCircleElement>(`.side-ball[data-k="${k}"]`);
			if (!b) {
				b = ball.cloneNode(true) as SVGGElement;
				b.dataset.k = String(k);
				ball.after(b);
			}
			if (!sb && sideBall) {
				sb = sideBall.cloneNode(true) as SVGCircleElement;
				sb.dataset.k = String(k);
				sideBall.after(sb);
			}
			return { b, s: sb };
		});
		const sideTrace = frame.querySelector<SVGPathElement>('.side-trace');
		const sideX0 = Number(frame.dataset.sideX0);
		const sideK = Number(frame.dataset.sideK);
		const sideMax = Number(frame.dataset.sideMax);
		const sideX = (h: number) => sideX0 + Math.min(h, sideMax) * sideK;
		// 横から見た高さの帯に描く、ボールの通り道（打つ手の線を細かく区切った点）
		// 球ごとに通り道を描く（球を2つ以上同時に使う手では、2つ目からの通り道の線を写して足す）
		const traces = balls.map((b, k) => {
			let el = sideTrace;
			if (k > 0 && sideTrace) {
				el = frame.querySelector<SVGPathElement>(`.side-trace[data-k="${k}"]`);
				if (!el) {
					el = sideTrace.cloneNode(true) as SVGPathElement;
					el.dataset.k = String(k);
					sideTrace.after(el);
				}
			}
			return { el, pts: Array.from({ length: 41 }, (_, j) => ballAt(b, j / 40)) };
		});
		const drawTrace = (ratio: number) => {
			const n = Math.round(ratio * 40);
			for (const t of traces) {
				const pts = t.pts.slice(0, n + 1);
				t.el?.setAttribute('d', pts.length > 1 ? 'M' + pts.map((p) => `${sideX(p.h)} ${p.y}`).join(' L') : '');
			}
		};
		const moves = [...frame.querySelectorAll<SVGPathElement>('path[data-kind="move"]')];
		const movers = moves.map((m) => {
			const g = frame.querySelector<SVGGElement>(`[data-player-id="${m.dataset.player}"]`);
			// 横から見た図の人も、奥行き（縦）だけ一緒に動かす
			const sg = frame.querySelector<SVGGElement>(`[data-side-player="${m.dataset.player}"]`);
			// 動く量は、線の長さではなく体の中心の差（data-shift）。線は丸と重ならないよう両端を縮めてあり、
			// 線の端まで動かすと、次の手で動いた先に描かれた人と位置がずれて、一瞬跳んで見えるため
			const shift = m.dataset.shift?.split(',').map(Number);
			const len = m.getTotalLength();
			const start = m.getPointAtLength(0);
			const end = m.getPointAtLength(len);
			const [dx, dy] = shift ?? [end.x - start.x, end.y - start.y];
			return { g, sg, dx, dy, delay: Number(m.dataset.delay) || 0, run: m.dataset.run !== undefined && sg ? runnerRig(sg) : undefined };
		});
		const lens = balls.map((b) => b.getTotalLength());
		// 線はマスク側の線（.reveal）を伸ばして見せる。本体の線は点線・破線のまま描ける
		const reveals = balls.map((b) => frame.querySelector<SVGPathElement>(`path.reveal[data-i="${b.dataset.i}"]`));
		// 伸びている途中は、線の先端をボールの位置にぴったり合わせる（端は丸めない）。
		// 伸び切ったら全体を見せ、矢印の先も表示する（端を丸めて矢印の先まで覆う）
		const setReveal = (k: number, ratio: number) => {
			const r = reveals[k];
			if (!r) return;
			if (ratio >= 1) {
				r.style.strokeDasharray = 'none';
				r.style.strokeLinecap = 'round';
			} else {
				r.style.strokeDasharray = `${lens[k] * ratio} ${lens[k] + 10}`;
				r.style.strokeLinecap = 'butt';
			}
			r.style.strokeDashoffset = '0';
		};
		// バウンドの印: ボールがその位置を通ったときに出す（data-at = 線の長さに対する割合）
		const marks = [...frame.querySelectorAll<SVGGElement>('.bounce:not([data-pre-ring])')];
		// 手から弾ませる球の輪（弾んだ瞬間に出す）
		const preRings = [...frame.querySelectorAll<SVGGElement>('[data-pre-ring]')];
		// トラップの間だけ出す「トラップ」の文字
		const trapLabels = [...frame.querySelectorAll<SVGTextElement>('[data-trap-label]')];
		const setTrapLabels = (on: boolean) => trapLabels.forEach((t) => t.classList.toggle('on', on));
		const setPreRings = (on: boolean) =>
			preRings.forEach((m) => {
				if (on && !m.classList.contains('on')) m.classList.add('on', ...(animate ? ['pop'] : []));
				if (!on) m.classList.remove('on', 'pop');
			});
		const showMarks = (ratio: number) =>
			marks.forEach((m) => {
				const on = ratio >= Number(m.dataset.at) - 0.001;
				if (on && !m.classList.contains('on')) m.classList.add('on', ...(animate ? ['pop'] : []));
				if (!on) m.classList.remove('on', 'pop');
			});
		// ボールを描く: コートの図ではボールを線の上（打つ人・受ける人のパドルの位置）に置き、高いほど少し大きく描く。
		// 高さは右の帯（横から見た図）で見せる。pos がなければ隠す
		const drawBall = (pos?: BallPos, k = 0) => {
			const el = ballEls[k] ?? { b: ball, s: sideBall };
			if (!pos) {
				el.b.setAttribute('transform', 'translate(-10 -10) scale(0.55)');
				el.s?.setAttribute('cx', '-10');
				return;
			}
			const r = Math.min(BALL_R_MAX, BALL_R_GROUND + pos.h * BALL_R_PER_FT);
			el.b.setAttribute('transform', `translate(${pos.x} ${pos.y}) scale(${r})`);
			el.s?.setAttribute('cx', `${sideX(pos.h)}`);
			el.s?.setAttribute('cy', `${pos.y}`);
		};
		/** 球 k の打つ前（手から落とす・トラップ）の位置と、地面までの落ち方 */
		const preOf = (k: number) => {
			const p = balls[k]?.dataset.pre?.split(',').map(Number);
			if (!p) return undefined;
			const th = balls[k].dataset.preFromH !== undefined ? Number(balls[k].dataset.preFromH) : undefined;
			// ボレーのトラップ（data-pre-pop）: 弾ませずに、打つ高さまで落ちてきたところで打つ（弾んで上がる時間はない）
			const pop = balls[k].dataset.prePop !== undefined && th !== undefined;
			// 受けた球の位置（前の手の終わり）。パドルの近く（2ft 以内）のときだけ使い、トラップの間にパドルの位置へ寄せる
			const near = th !== undefined && prevBall && Math.hypot(prevBall.x - p[0], prevBall.y - p[1]) < 2 ? prevBall : undefined;
			return {
				fx: near?.x ?? p[0],
				fy: near?.y ?? p[1],
				x: p[0],
				y: p[1],
				h0: th ?? HAND_FT,
				dropMs: th !== undefined ? TRAP_DROP_MS : PRE_DROP_MS,
				pop,
				fall: pop ? popTo(th, TRAP_POP_FT, ballAt(balls[k], 0).h) : th !== undefined ? popArc(th, TRAP_POP_FT) : (u: number) => HAND_FT * (1 - u * u),
			};
		};
		const reset = () => {
			setTrapLabels(false);
			showMarks(animate ? -1 : 1);
			balls.forEach((_, k) => setReveal(k, animate ? 0 : 1));
			// 動く人だけでなく、ループで最初の立ち位置へ戻した人（rewind）の移動も消す
			frame.querySelectorAll('[data-player-id], [data-side-player]').forEach((g) => g.setAttribute('transform', ''));
			// 打つ動きの途中で止めたパドルと腕も元に戻す
			frame.querySelectorAll<SVGElement>('.paddle, .side-paddle, .side-grip, .side-hand').forEach((p) => p.removeAttribute('transform'));
			frame.querySelectorAll<SVGElement>('.side-paddle, .side-grip').forEach(restoreLine);
			// グリップを見せるために手より前に動かしたパドル（data-grip-front）を、元の順（手が上）に戻す（コードレビューの指摘）
			frame.querySelectorAll('[data-side-player]').forEach((g) => {
				const hand = g.querySelector('.side-hand');
				const face = g.querySelector('.side-paddle');
				if (hand && face && hand.compareDocumentPosition(face) & Node.DOCUMENT_POSITION_FOLLOWING) face.after(hand);
			});
			frame.querySelectorAll<SVGLineElement>('.arm, .side-arm, .side-upperarm').forEach((a) => {
				for (const k of ['x1', 'y1', 'x2', 'y2']) if (a.dataset[k]) a.setAttribute(k, a.dataset[k]!);
			});
			frame.querySelectorAll('[data-side-player]').forEach((g) => syncArm(g));
			// 決めのポーズで動かしたが、止まった形が決めのポーズでない人は、もとの止まった形に描き直す
			frame.querySelectorAll<SVGGElement>('[data-posed]:not([data-pose-static])').forEach((g) => {
				renderSide(g, sideFigure(JSON.parse(g.dataset.poseInput!) as SideFigureInput));
				delete g.dataset.posed;
			});
			// 決めのポーズで描いた人は、止まった形（構え）に描き直す
			frame.querySelectorAll<SVGGElement>('[data-pose-static]').forEach((g) =>
				renderSide(
					g,
					sideFigure({ ...(JSON.parse(g.dataset.poseInput!) as SideFigureInput), angles: JSON.parse(g.dataset.poseStatic!) as PoseAngles, bodyBack: Number(g.dataset.poseBodyBack) }),
				),
			);
			// 打つ手なら打つ人のパドルから、人が動くだけの手なら前の手の終わりの位置にボールを置く
			setPreRings(!animate && !!preOf(0));
			if (!balls.length) drawBall(startBall[i]);
			balls.forEach((b, k) => {
				const pr = preOf(k);
				drawBall(animate && pr ? { x: pr.fx, y: pr.fy, h: pr.h0 } : ballAt(b, animate ? 0 : 1), k);
			});
			drawTrace(animate ? 0 : 1);
		};
		reset();
		if (!animate) {
			movers.forEach(({ g, sg, dx, dy }) => {
				g?.setAttribute('transform', `translate(${dx} ${dy})`);
				sg?.setAttribute('transform', `translate(0 ${dy})`);
			});
			return;
		}
		// 打球の種類ごとの時間（data-ms）。1つの場面に複数あるときは一番長いものに合わせる
		// 動き出しが遅れる人（data-delay）は、その分も含める
		const durations = [...balls, ...moves].map((p) => (Number(p.dataset.ms) || SHOT_MS) + (Number(p.dataset.delay) || 0));
		const duration = durations.length ? Math.max(...durations) : SHOT_MS;
		// 打つ前に一度弾ませる球: 手前で弾んだボールが打点まで上がってから、打球が始まる
		// トラップなら、受けた高さから少し上がって落ちる。手から落とす球出しなら、手の高さから落ちる
		// 打つ前に弾ませる球が1つでもあれば、その球が地面まで落ちて打点まで上がる時間だけ、打球を待つ
		const pres = balls.map((_, k) => preOf(k));
		// 打つ動き: この手で打つ人の道具（rigs）と、次の手で打つ人の道具（preps。この手の後半で振りかぶる）
		// トラップしてから打つ球（data-pre-from-h）: 打つ人は、球が来た所でパドルを球に当てて受け（打つ所の形）、
		// 球がポンと上がって落ちる間に振りかぶってから打つ（前は振りかぶった形のまま受けていて、パドルが球に触れずに球だけが跳ねていた）
		const trapped = (b: SVGPathElement) => b.dataset.preFromH !== undefined;
		const rigs = balls.flatMap((b) => {
			const r = hitterRig(frame, b);
			return r ? [Object.assign(r, { trap: trapped(b) })] : [];
		});
		const next = frames[i + 1];
		// 走って下がる人（data-run）は、走る形のまま次の手へつなぐので、この手の後半で振りかぶらない
		const runners = new Set(moves.filter((m) => m.dataset.run !== undefined).map((m) => m.dataset.player));
		const preps = next
			? [...next.querySelectorAll<SVGPathElement>('path[data-kind="ball"]')].flatMap((nb) => {
					if (runners.has(nb.dataset.hitter)) return [];
					// 次の手でトラップする人は、振りかぶらずに、打つ所の形で球を待つ
					if (trapped(nb)) return [];
					const r = hitterRig(frame, nb);
					return r ? [r] : [];
				})
			: [];
		// 動かす手は、振りかぶった形から始める（前の手の後半で振りかぶってある）
		const AT_BALL: Vec3 = [0, 0, 0];
		if (animate) rigs.forEach((r) => r.apply(r.trap ? AT_BALL : r.back));
		// パドルが打つ所を通る時刻（easeInOut で振るので、ease の逆で求める）
		const hitDelay = rigs.length ? SWING_MS * easeInv(rigs[0].contact) : 0;
		const drops = pres.flatMap((pr) => (pr ? [pr.dropMs] : []));
		const dropMs = drops.length ? Math.min(...drops) : 0;
		// 弾ませる球は、弾んで打点まで上がる時間（PRE_RISE_MS）も待つ。ボレーのトラップは落ちてきたところで打つので、上がる時間はない
		const preMs = drops.length ? Math.max(...pres.flatMap((pr) => (pr ? [pr.dropMs + (pr.pop ? 0 : PRE_RISE_MS)] : []))) : 0;
		// 打つ前に弾ませる球・トラップした球は、ボールが打点に来た瞬間に打つ（書き手の指摘: 打点に来てから打つまで間が空いていた）。
		// そのため振りは、打点に来る hitDelay 前から始める（弾んでいる間・落ちてくる間に振る）
		const swingStart = Math.max(0, preMs - hitDelay);
		const hitAt = swingStart + hitDelay;
		const t0 = performance.now();
		const tick = (now: number) => {
			const elapsed = now - t0;
			if (preMs > 0 && elapsed < preMs) {
				rigs.forEach((r) => {
					// トラップする人: 球を受けた形から、振り始めまでに振りかぶる
					if (r.trap && elapsed < swingStart) r.apply(AT_BALL, r.back, easeInOut(Math.min(1, elapsed / Math.max(1, swingStart))));
					else swingAt(r, elapsed - swingStart);
				});
				setTrapLabels(true);
				setPreRings(elapsed >= dropMs && pres.some((pr) => pr && !pr.pop));
				// 打つ前に弾ませる球（手から落とす・トラップ）は、球ごとに地面まで落ちて弾み、打点まで上がる
				pres.forEach((pr, k) => {
					const start = ballAt(balls[k], 0);
					if (!pr) return drawBall(start, k);
					const rise = preMs - pr.dropMs;
					if (pr.pop) {
						// ボレーのトラップ: ポンと上げて、打つ高さまで落ちる（弾ませない）
						const u = Math.min(1, elapsed / pr.dropMs);
						return drawBall({ x: pr.fx + (start.x - pr.fx) * u, y: pr.fy + (start.y - pr.fy) * u, h: pr.fall(u) }, k);
					}
					if (elapsed < pr.dropMs) {
						// 地面まで: 手から落とす球はだんだん速く、トラップした球はポンと少し上がってから落ちる
						const v = elapsed / pr.dropMs;
						drawBall({ x: pr.fx + (pr.x - pr.fx) * v, y: pr.fy + (pr.y - pr.fy) * v, h: pr.fall(v) }, k);
					} else {
						// 弾んで打点まで上がる（上がるにつれてゆるむ）
						const u = Math.min(1, (elapsed - pr.dropMs) / rise);
						const up = Math.sin((u * Math.PI) / 2);
						drawBall({ x: pr.x + (start.x - pr.x) * u, y: pr.y + (start.y - pr.y) * u, h: start.h * up }, k);
					}
				});
				raf = requestAnimationFrame(tick);
				return;
			}
			setPreRings(preMs > 0 && pres.some((pr) => pr && !pr.pop));
			// 「トラップ」の文字は、打つまで残す
			setTrapLabels(elapsed < hitAt + 150);
			// 振り: swingStart から振り、パドルが打つ所を通る瞬間（hitAt）にボールが飛び出す
			const s = elapsed - swingStart;
			rigs.forEach((r) => swingAt(r, s));
			const flight = Math.max(0, elapsed - hitAt);
			const t = Math.min(1, flight / duration);
			// 次の手で打つ人は、この手の後半で振りかぶる
			// ほかの球と同じ構えから打つ打ち方（setup）は、手の初めのうちに構えへ移る
			preps.forEach((r) => {
				const from = r.setup ? 0 : PREP_FROM;
				const to = r.setup ? 0.35 : 1;
				if (t > from) r.apply(r.prepFrom, r.back, easeInOut(Math.min(1, (t - from) / (to - from))));
			});
			const eb = Math.sin((t * Math.PI) / 2); // ボール: 打った瞬間が速く、少しずつ減速する
			showMarks(eb);
			drawTrace(eb);
			balls.forEach((b, k) => {
				// 失敗した球（data-span）: ほかの球と同じ速さで進むので、線が短いぶん早く端に着き、そこで止まる
				const span = Number(b.dataset.span) || 1;
				const e = Math.min(1, eb / span);
				setReveal(k, e);
				drawBall(ballAt(b, e), k);

			});
			movers.forEach(({ g, sg, dx, dy, delay, run }) => {
				// 動き出しが遅れる人は、遅れたぶん短い時間で同じ終わりの時刻に着く
				const tm = Math.min(1, Math.max(0, (flight - delay) / (duration - delay)));
				const em = tm < 0.5 ? 2 * tm * tm : 1 - (-2 * tm + 2) ** 2 / 2;
				g?.setAttribute('transform', `translate(${dx * em} ${dy * em})`);
				// 手の切り替わりで形を混ぜている間は、前の手で動いた分の残り（data-blend-ty。lib/side-blend.ts）も足す。
				// 混ぜる側も同じ式で書けるように、動いた量を data-move-ty に残す
				if (sg) {
					sg.dataset.moveTy = String(dy * em);
					sg.setAttribute('transform', `translate(0 ${dy * em + Number(sg.dataset.blendTy ?? 0)})`);
				}
				run?.(tm, flight - delay);
			});
			// 振り抜いて元の構えに戻るまでは、手を終えない（途中で次の手に切り替わると、パドルが跳ぶため）
			if (t < 1 || (rigs.length > 0 && s < SWING_MS + HOLD_MS + RETURN_MS)) raf = requestAnimationFrame(tick);
			else {
				balls.forEach((_, k) => setReveal(k, 1));
				showMarks(1);
				drawTrace(1);
				// ボールは消さずに、届いた位置に残す（次の手はそこから始まる）
				balls.forEach((b, k) => drawBall(ballAt(b, 1), k));
				preps.forEach((r) => r.apply(r.back));
				setScore(scoreOf(frame, 'scoreAfter'), false);
				frame.querySelectorAll('[data-lost], [data-win]').forEach((t) => t.classList.add('on'));
				// 「〇 の勝ち」を出すときは、線の名前を薄くして重ならないようにする
				frame.classList.toggle('won', !!frame.querySelector('[data-win]'));
				done?.();
			}
		};
		raf = requestAnimationFrame(tick);
		// 横から見た人: 前の手の終わりの形から、この手の形へ BLEND_MS でつなぐ（打つ動きのあとに混ぜるので、tick より後に呼ぶ）
		if (prevSnap) {
			// この手で打つ人は、打つ瞬間（hitAt）の 8 割までに混ぜ終える
			const quick = new Map(balls.flatMap((b) => (b.dataset.hitter ? [[b.dataset.hitter, hitAt * 0.8] as [string, number]] : [])));
			const step = sideBlender(frame, prevSnap, new Set(moves.map((m) => m.dataset.player ?? '')), quick);
			// 切り替えた瞬間から前の形で見せる（次の描画を待つと、一瞬だけ次の手の形が見えるため）
			step(0);
			const b0 = performance.now();
			const blend = (now: number) => {
				if (!step(now - b0)) blendRaf = requestAnimationFrame(blend);
			};
			blendRaf = requestAnimationFrame(blend);
		}
	}

	/** 要素の translate(x y) を読む */
	const translateOf = (el: Element | null): [number, number] => {
		const m = el?.getAttribute('transform')?.match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/);
		return m ? [Number(m[1]), Number(m[2])] : [0, 0];
	};
	/** 最初の手で、最初のボールが出る位置（手から弾ませる球なら弾む位置）。ループのつながりを見るのに使う */
	const firstBallStart = (): BallPos | undefined => {
		const p = frames[0].querySelector<SVGPathElement>('path[data-kind="ball"]');
		if (!p) return undefined;
		const pre = p.dataset.pre?.split(',').map(Number);
		if (pre) return { x: pre[0], y: pre[1], h: p.dataset.preFromH !== undefined ? Number(p.dataset.preFromH) : HAND_FT };
		const prev = frames[0].style.display;
		frames[0].style.display = '';
		const b = ballAt(p, 0);
		frames[0].style.display = prev;
		return b;
	};
	/**
	 * 最後の手 i から最初の手へ戻る: 人を最初の立ち位置まで動かし、ボールが最初の手の始まりとつながらなければ消す
	 */
	function rewind(i: number, done: () => void) {
		const frame = frames[i];
		const first = frames[0];
		const moves: { g: Element; from: [number, number]; to: [number, number] }[] = [];
		frame.querySelectorAll('[data-player-id]').forEach((g) => {
			const id = (g as HTMLElement).dataset.playerId;
			const body = g.querySelector('circle.body');
			const body0 = first.querySelector(`[data-player-id="${id}"] circle.body`);
			if (!body || !body0) return;
			const to: [number, number] = [
				Number(body0.getAttribute('cx')) - Number(body.getAttribute('cx')),
				Number(body0.getAttribute('cy')) - Number(body.getAttribute('cy')),
			];
			moves.push({ g, from: translateOf(g), to });
			const sg = frame.querySelector(`[data-side-player="${id}"]`);
			// 横から見た人の前後の位置は、data-pose-input の y（立つ奥行き）で比べる（頭は形の path なので座標を持たない）
			const sg0 = first.querySelector<HTMLElement>(`[data-side-player="${id}"]`);
			const yOf = (el: Element | null | undefined) => Number(JSON.parse((el as HTMLElement | null)?.dataset.poseInput ?? '{}').y);
			if (sg && sg0 && Number.isFinite(yOf(sg)) && Number.isFinite(yOf(sg0))) moves.push({ g: sg, from: translateOf(sg), to: [0, yOf(sg0) - yOf(sg)] });
		});
		// ボール: 最初の手の始まりが、最後の手の終わりと同じ所でなければ（新しい球を出す、別の人から始まる）、消してから出し直す
		const lastP = [...frame.querySelectorAll<SVGPathElement>('path[data-kind="ball"]')][0];
		const end = lastP ? ballAt(lastP, 1) : startBall[i];
		const start = firstBallStart();
		const fresh = !!first.querySelector('path[data-kind="ball"][data-fresh]');
		// 位置が同じでも、高さが違えば（例: 肩の高さで受けた球を、膝の高さのディンクで打ち始める）つながらないので出し直す
		const fade = !!start && (fresh || !end || Math.hypot(start.x - end.x, start.y - end.y) > 0.5 || Math.abs(start.h - end.h) > 0.5);
		const balls = [...frame.querySelectorAll<SVGElement>('.ball, .side-ball')];
		// 最初の手で打つ人は、戻る間に振りかぶる（最初の手は振りかぶった形から始まる）
		const preps0 = [...first.querySelectorAll<SVGPathElement>('path[data-kind="ball"]')].flatMap((nb) => hitterRig(frame, nb) ?? []);
		// 振り終わりで止めた人（data-hold。フリック）は、戻る間に振り終わりの形から止まった形へ戻す（一瞬で切り替わって見えないように。
		// コードレビューの指摘 2026-11-28）。最初の手で打つ人は、そのあとで振りかぶりへ動かす（preps0 が上書きする）
		const holds0 = [...frame.querySelectorAll<SVGPathElement>('path[data-kind="ball"][data-hold]')].flatMap((nb) => hitterRig(frame, nb) ?? []);
		// 点の目盛りは、繰り返しの最初で動かさずに一度に戻す（+2 から 0 へ流れて戻ると、点が動いたように見えるため）
		setScore(scoreOf(first, 'scoreBefore'), true);
		const t0 = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / REWIND_MS);
			const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			for (const m of moves) m.g.setAttribute('transform', `translate(${m.from[0] + (m.to[0] - m.from[0]) * e} ${m.from[1] + (m.to[1] - m.from[1]) * e})`);
			if (fade) balls.forEach((b) => (b.style.opacity = String(Math.max(0, 1 - (now - t0) / BALL_FADE_MS))));
			holds0.forEach((r) => r.apply(r.follow, REST, e));
			preps0.forEach((r) => r.apply(r.prepFrom, r.back, e));
			if (t < 1) raf = requestAnimationFrame(tick);
			else done();
		};
		raf = requestAnimationFrame(tick);
	}

	/**
	 * 手 i の前の間。ふつうは PAUSE_MS（1手ずつ区切ると、誰が何を打ったかを読み取りやすい）。
	 * 手 i がトラップ（受けた球を面でポンと上げてから打つ）で始まるときは、受けた球の続きの動きなので、間を入れずに続ける
	 */
	const pauseBefore = (i: number) =>
		frames[i]?.querySelector<SVGPathElement>('path[data-kind="ball"]')?.dataset.preFromH !== undefined ? 0 : PAUSE_MS;

	function playFrom(i: number) {
		show(i, true, () => {
			if (!playing) return;
			const last = i === frames.length - 1;
			if (!last) {
				timer = window.setTimeout(() => playFrom(i + 1), pauseBefore(i + 1));
				return;
			}
			// 最後の手: 少し止めて見せてから、最初の立ち位置へ戻し、最初の手へ
			timer = window.setTimeout(() => {
				if (!playing) return;
				rewind(i, () => {
					if (playing) timer = window.setTimeout(() => playFrom(0), PAUSE_MS);
				});
			}, LOOP_PAUSE_MS - REWIND_MS);
		});
	}

	function setPlaying(p: boolean) {
		playing = p;
		toggleBtn.textContent = p ? '❚❚' : '▶︎';
		toggleBtn.setAttribute('aria-label', p ? '一時停止' : '再生');
		toggleBtn.classList.toggle('paused', !p);
	}

	root.querySelector('[data-act="prev"]')!.addEventListener('click', () => {
		setPlaying(false);
		show((current - 1 + frames.length) % frames.length, !reduce);
	});
	root.querySelector('[data-act="next"]')!.addEventListener('click', () => {
		setPlaying(false);
		show((current + 1) % frames.length, !reduce);
	});
	toggleBtn.addEventListener('click', () => {
		if (playing) {
			setPlaying(false);
			stop();
		} else {
			setPlaying(true);
			playFrom(current);
		}
	});
	dots.forEach((d, k) =>
		d.addEventListener('click', () => {
			setPlaying(false);
			show(k, !reduce);
		}),
	);

	// 画面に見えている間だけ動かす
	const io = new IntersectionObserver((entries) => {
		for (const e of entries) {
			if (e.isIntersecting && playing) playFrom(current);
			else if (!e.isIntersecting) stop();
		}
	});
	io.observe(root);
	if (reduce) {
		toggleBtn.hidden = true;
		setPlaying(false);
		show(0, false);
	} else {
		// 動かす前は、最初の手の始まりの形で見せる（終わりの形から始めると、再生が始まる瞬間に人やボールが跳ぶため）
		show(0, true);
		stop();
	}
}

/**
 * まだ動かしていないコート図のアニメーションを動かす。
 * ページを開いたときのほか、メニュー表示のように、あとからドリルの中身を差し込んだときにも呼ぶ。
 */
export function setupCourtAnimations(root: ParentNode = document) {
	root.querySelectorAll<HTMLElement>('[data-court-anim]:not([data-court-ready])').forEach((el) => {
		el.dataset.courtReady = '';
		setup(el);
	});
}

