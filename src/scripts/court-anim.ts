import { bendSide, clampReach, solveElbow } from '../lib/arm-ik';
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
 * RETURN_MS で元の構えへ戻る。ボールは、パドルが打つ所を通る瞬間に飛び出す。SWING_SCALE を 0 にすると打つ動きはなくなる
 */
const SWING_SCALE = 1;
const SWING_MS = 300;
/** 振り抜いた形で少し止める時間（振り抜き＝フォロースルーが見えるように） */
const HOLD_MS = 220;
const RETURN_MS = 450;
const PREP_FROM = 0.55;
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
type Vec = [number, number];
type Vec3 = [number, number, number];
/**
 * 打つ人のパドルと腕を、打つ所からのずれ [上へ, 前へ]（ft）だけ動かす道具。上から見た図は前へのずれだけを、打球の向きに動かす。
 * 横から見た図は、パドルと手を動かし、前腕の手の側と、ひじ（上腕の先・前腕の元）をその半分だけ動かす
 */
function hitterRig(frame: SVGSVGElement, ball: SVGPathElement) {
	const id = ball.dataset.hitter;
	if (!id) return undefined;
	const g = frame.querySelector<SVGGElement>(`[data-player-id="${id}"]`);
	const paddle = g?.querySelector<SVGLineElement>('.paddle');
	const arm = g?.querySelector<SVGLineElement>('.arm');
	if (!paddle || !arm) return undefined;
	const side = frame.querySelector<SVGGElement>(`[data-side-player="${id}"]`);
	// 横から見た図: パドル（グリップと面）は手のまわりに回し、手は動かすだけ
	const sidePaddle = side ? [...side.querySelectorAll<SVGElement>('.side-paddle, .side-grip')] : [];
	const sideHand = side?.querySelector<SVGCircleElement>('.side-hand');
	const hx = Number(sideHand?.getAttribute('cx') ?? 0);
	const hy = Number(sideHand?.getAttribute('cy') ?? 0);
	const forearm = side?.querySelector<SVGLineElement>('.side-arm');
	const upperArm = side?.querySelector<SVGLineElement>('.side-upperarm');
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
	const back: Vec3 = [v[0], v[1], v[4] ?? 0];
	const follow: Vec3 = [v[2], v[3], v[5] ?? 0];
	// 回る向き: 前から上へ（+）は、図ではネットの向きによって時計回りか反時計回りになる
	const turnSign = -Math.sign(uy || 1);
	const set = (el: SVGLineElement, k: 'x1' | 'y1' | 'x2' | 'y2', d: number) => el.setAttribute(k, String(Number(el.dataset[k]) + d));
	const apply = ([up, fwd, turn = 0]: Vec3 | Vec) => {
		const dx = ux * fwd;
		const dy = uy * fwd;
		paddle.setAttribute('transform', fwd ? `translate(${dx} ${dy})` : '');
		set(arm, 'x2', dx);
		set(arm, 'y2', dy);
		// 横から見た図: 手を動かす先（届かない所なら、届く所で止める）
		let sx = up * sideK;
		let sy = Math.sign(uy) * fwd;
		if (forearm && upperArm) {
			const rx = n0(forearm, 'x2');
			const ry = n0(forearm, 'y2');
			const [cx, cy] = clampReach(n0(upperArm, 'x1'), n0(upperArm, 'y1'), rx + sx, ry + sy, armLen.upper + armLen.lower);
			sx = cx - rx;
			sy = cy - ry;
		}
		const rot = turnSign * turn;
		sidePaddle.forEach((el) => el.setAttribute('transform', sx || sy || rot ? `translate(${sx} ${sy}) rotate(${rot} ${hx} ${hy})` : ''));
		sideHand?.setAttribute('transform', sx || sy ? `translate(${sx} ${sy})` : '');
		// 腕は、肩から動いた手まで、上腕と前腕の長さを変えずに曲げ直す
		if (forearm && upperArm) {
			const n = (el: SVGLineElement, k: string) => Number(el.dataset[k]);
			const hxx = n(forearm, 'x2') + sx;
			const hyy = n(forearm, 'y2') + sy;
			const [ex, ey] = solveElbow(n(upperArm, 'x1'), n(upperArm, 'y1'), hxx, hyy, armLen.upper, armLen.lower, armSide);
			forearm.setAttribute('x2', String(hxx));
			forearm.setAttribute('y2', String(hyy));
			forearm.setAttribute('x1', String(ex));
			forearm.setAttribute('y1', String(ey));
			upperArm.setAttribute('x2', String(ex));
			upperArm.setAttribute('y2', String(ey));
		}
	};
	// パドルが打つ所を通る時刻（振りの中の割合）: 振りかぶりと振り抜きの長さの比
	const lb = Math.hypot(back[0], back[1]);
	const lf = Math.hypot(follow[0], follow[1]);
	const contact = lb + lf > 0 ? lb / (lb + lf) : 0;
	return { apply, back, follow, contact };
}
type Rig = NonNullable<ReturnType<typeof hitterRig>>;
const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const REST: Vec3 = [0, 0, 0];
/** 打つ手の中の時刻 s（ミリ秒）での、パドルのずれと回り: 振る → 振り抜いた形で止める → 構えへ戻る */
const swingAt = (r: Rig, s: number): Vec3 => {
	if (s < 0) return r.back;
	if (s < SWING_MS) return lerp(r.back, r.follow, easeInOut(s / SWING_MS));
	if (s < SWING_MS + HOLD_MS) return r.follow;
	if (s < SWING_MS + HOLD_MS + RETURN_MS) return lerp(r.follow, REST, easeInOut((s - SWING_MS - HOLD_MS) / RETURN_MS));
	return REST;
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
	let timer = 0;

	const stop = () => {
		cancelAnimationFrame(raf);
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
			return { g, sg, dx, dy, delay: Number(m.dataset.delay) || 0 };
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
			return {
				x: p[0],
				y: p[1],
				h0: th ?? HAND_FT,
				dropMs: th !== undefined ? TRAP_DROP_MS : PRE_DROP_MS,
				fall: th !== undefined ? popArc(th, TRAP_POP_FT) : (u: number) => HAND_FT * (1 - u * u),
			};
		};
		const reset = () => {
			showMarks(animate ? -1 : 1);
			balls.forEach((_, k) => setReveal(k, animate ? 0 : 1));
			// 動く人だけでなく、ループで最初の立ち位置へ戻した人（rewind）の移動も消す
			frame.querySelectorAll('[data-player-id], [data-side-player]').forEach((g) => g.setAttribute('transform', ''));
			// 打つ動きの途中で止めたパドルと腕も元に戻す
			frame.querySelectorAll<SVGElement>('.paddle, .side-paddle, .side-grip, .side-hand').forEach((p) => p.removeAttribute('transform'));
			frame.querySelectorAll<SVGLineElement>('.arm, .side-arm, .side-upperarm').forEach((a) => {
				for (const k of ['x1', 'y1', 'x2', 'y2']) if (a.dataset[k]) a.setAttribute(k, a.dataset[k]!);
			});
			// 打つ手なら打つ人のパドルから、人が動くだけの手なら前の手の終わりの位置にボールを置く
			setPreRings(!animate && !!preOf(0));
			if (!balls.length) drawBall(startBall[i]);
			balls.forEach((b, k) => {
				const pr = preOf(k);
				drawBall(animate && pr ? { x: pr.x, y: pr.y, h: pr.h0 } : ballAt(b, animate ? 0 : 1), k);
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
		const rigs = balls.flatMap((b) => hitterRig(frame, b) ?? []);
		const next = frames[i + 1];
		const preps = next
			? [...next.querySelectorAll<SVGPathElement>('path[data-kind="ball"]')].flatMap((nb) => {
					const r = hitterRig(frame, nb);
					return r ? [r] : [];
				})
			: [];
		// 動かす手は、振りかぶった形から始める（前の手の後半で振りかぶってある）
		if (animate) rigs.forEach((r) => r.apply(r.back));
		const hitDelay = rigs.length ? rigs[0].contact * SWING_MS : 0;
		const drops = pres.flatMap((pr) => (pr ? [pr.dropMs] : []));
		const dropMs = drops.length ? Math.min(...drops) : 0;
		const preMs = drops.length ? Math.max(...drops) + PRE_RISE_MS : 0;
		const t0 = performance.now();
		const tick = (now: number) => {
			const elapsed = now - t0;
			if (preMs > 0 && elapsed < preMs) {
				setPreRings(elapsed >= dropMs);
				// 打つ前に弾ませる球（手から落とす・トラップ）は、球ごとに地面まで落ちて弾み、打点まで上がる
				pres.forEach((pr, k) => {
					const start = ballAt(balls[k], 0);
					if (!pr) return drawBall(start, k);
					const rise = preMs - pr.dropMs;
					if (elapsed < pr.dropMs) {
						// 地面まで: 手から落とす球はだんだん速く、トラップした球はポンと少し上がってから落ちる
						drawBall({ x: pr.x, y: pr.y, h: pr.fall(elapsed / pr.dropMs) }, k);
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
			setPreRings(preMs > 0);
			// 振り: 打つ手の始まり（preMs）から振り、パドルが打つ所を通る瞬間（hitDelay）にボールが飛び出す
			const s = elapsed - preMs;
			rigs.forEach((r) => r.apply(swingAt(r, s)));
			const flight = Math.max(0, s - hitDelay);
			const t = Math.min(1, flight / duration);
			// 次の手で打つ人は、この手の後半で振りかぶる
			if (t > PREP_FROM) preps.forEach((r) => r.apply(lerp(REST, r.back, easeInOut((t - PREP_FROM) / (1 - PREP_FROM)))));
			const eb = Math.sin((t * Math.PI) / 2); // ボール: 打った瞬間が速く、少しずつ減速する
			showMarks(eb);
			drawTrace(eb);
			balls.forEach((b, k) => {
				setReveal(k, eb);
				drawBall(ballAt(b, eb), k);

			});
			movers.forEach(({ g, sg, dx, dy, delay }) => {
				// 動き出しが遅れる人は、遅れたぶん短い時間で同じ終わりの時刻に着く
				const tm = Math.min(1, Math.max(0, (flight - delay) / (duration - delay)));
				const em = tm < 0.5 ? 2 * tm * tm : 1 - (-2 * tm + 2) ** 2 / 2;
				g?.setAttribute('transform', `translate(${dx * em} ${dy * em})`);
				sg?.setAttribute('transform', `translate(0 ${dy * em})`);
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
			const sg0 = first.querySelector(`[data-side-player="${id}"] .side-head`);
			const head = sg?.querySelector('.side-head');
			if (sg && sg0 && head) moves.push({ g: sg, from: translateOf(sg), to: [0, Number(sg0.getAttribute('cy')) - Number(head.getAttribute('cy'))] });
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
		// 点の目盛りは、繰り返しの最初で動かさずに一度に戻す（+2 から 0 へ流れて戻ると、点が動いたように見えるため）
		setScore(scoreOf(first, 'scoreBefore'), true);
		const t0 = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / REWIND_MS);
			const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			for (const m of moves) m.g.setAttribute('transform', `translate(${m.from[0] + (m.to[0] - m.from[0]) * e} ${m.from[1] + (m.to[1] - m.from[1]) * e})`);
			if (fade) balls.forEach((b) => (b.style.opacity = String(Math.max(0, 1 - (now - t0) / BALL_FADE_MS))));
			preps0.forEach((r) => r.apply(lerp(REST, r.back, e)));
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

