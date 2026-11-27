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
 * 打つ動き: 打った瞬間に、打つ人のパドルがピュッと出て、SWING_MS で戻る。向きと量は打球の種類ごとに config/court.ts の
 * shotSwing で決める（data-swing）。SWING_SCALE を 0 にすると打つ動きはなくなる
 */
const SWING_SCALE = 1;
const SWING_MS = 260;
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
			frame.querySelectorAll<SVGLineElement>('.arm, .side-arm').forEach((a) => {
				if (a.dataset.x2) a.setAttribute('x2', a.dataset.x2);
				if (a.dataset.y2) a.setAttribute('y2', a.dataset.y2);
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
		// 打つ動き: 打つ人ごとに、パドルと腕の元の位置と、打球の進む向きを覚えておく
		const swings = balls.flatMap((b) => {
			const g = frame.querySelector<SVGGElement>(`[data-player-id="${b.dataset.hitter}"]`);
			const paddle = g?.querySelector<SVGLineElement>('.paddle');
			// 横から見た図のパドル（奥行きの向きだけ、打球の進む側へ出す）
			// 横から見た図では、パドル（面とグリップ）と手を一緒に動かす
			const sidePaddle = [...frame.querySelectorAll<SVGElement>(`[data-side-player="${b.dataset.hitter}"] :is(.side-paddle, .side-grip, .side-hand)`)];
			const sideArm = frame.querySelector<SVGLineElement>(`[data-side-player="${b.dataset.hitter}"] .side-arm`);
			if (sideArm) {
				sideArm.dataset.x2 ??= sideArm.getAttribute('x2') ?? '0';
				sideArm.dataset.y2 ??= sideArm.getAttribute('y2') ?? '0';
			}
			const arm = g?.querySelector<SVGLineElement>('.arm');
			if (!b.dataset.hitter || !paddle || !arm) return [];
			const len = b.getTotalLength();
			const a = b.getPointAtLength(0);
			const z = b.getPointAtLength(Math.min(len, 3));
			const n = Math.hypot(z.x - a.x, z.y - a.y) || 1;
			// 腕の手の位置は、最初に読んだ値を覚えておく（途中で止めても元に戻せるように）
			arm.dataset.x2 ??= arm.getAttribute('x2') ?? '0';
			arm.dataset.y2 ??= arm.getAttribute('y2') ?? '0';
			const [up, fwd, ft] = (b.dataset.swing ?? '0,1,0.8').split(',').map(Number);
			const n2 = Math.hypot(up, fwd) || 1;
			return [{ paddle, arm, sidePaddle, sideArm, up: up / n2, fwd: fwd / n2, ft: ft * SWING_SCALE, ux: (z.x - a.x) / n, uy: (z.y - a.y) / n, x2: Number(arm.dataset.x2), y2: Number(arm.dataset.y2) }];
		});
		const swing = (elapsedHit: number) => {
			const u = elapsedHit / SWING_MS;
			const e = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
			for (const sw of swings) {
				// 上から見た図: 打球の進む向きへ、前への量だけ出す
				const a = sw.ft * sw.fwd * e;
				sw.paddle.setAttribute('transform', a ? `translate(${sw.ux * a} ${sw.uy * a})` : '');
				sw.arm.setAttribute('x2', String(sw.x2 + sw.ux * a));
				sw.arm.setAttribute('y2', String(sw.y2 + sw.uy * a));
				// 横から見た図: 上下（図の横、高さ 1ft あたり sideK）と前（奥行き）へ出し、腕の手の位置も一緒に動かす
				const sx = sw.ft * sw.up * e * sideK;
				const sy = Math.sign(sw.uy) * sw.ft * sw.fwd * e;
				sw.sidePaddle.forEach((el) => el.setAttribute('transform', e ? `translate(${sx} ${sy})` : ''));
				if (sw.sideArm) {
					sw.sideArm.setAttribute('x2', String(Number(sw.sideArm.dataset.x2) + sx));
					sw.sideArm.setAttribute('y2', String(Number(sw.sideArm.dataset.y2) + sy));
				}
			}
		};
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
			swing(elapsed - preMs);
			const t = Math.min(1, (elapsed - preMs) / duration);
			const eb = Math.sin((t * Math.PI) / 2); // ボール: 打った瞬間が速く、少しずつ減速する
			showMarks(eb);
			drawTrace(eb);
			balls.forEach((b, k) => {
				setReveal(k, eb);
				drawBall(ballAt(b, eb), k);

			});
			movers.forEach(({ g, sg, dx, dy, delay }) => {
				// 動き出しが遅れる人は、遅れたぶん短い時間で同じ終わりの時刻に着く
				const tm = Math.min(1, Math.max(0, (elapsed - preMs - delay) / (duration - delay)));
				const em = tm < 0.5 ? 2 * tm * tm : 1 - (-2 * tm + 2) ** 2 / 2;
				g?.setAttribute('transform', `translate(${dx * em} ${dy * em})`);
				sg?.setAttribute('transform', `translate(0 ${dy * em})`);
			});
			if (t < 1) raf = requestAnimationFrame(tick);
			else {
				balls.forEach((_, k) => setReveal(k, 1));
				showMarks(1);
				drawTrace(1);
				// ボールは消さずに、届いた位置に残す（次の手はそこから始まる）
				balls.forEach((b, k) => drawBall(ballAt(b, 1), k));
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
		// 点の目盛りは、繰り返しの最初で動かさずに一度に戻す（+2 から 0 へ流れて戻ると、点が動いたように見えるため）
		setScore(scoreOf(first, 'scoreBefore'), true);
		const t0 = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / REWIND_MS);
			const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			for (const m of moves) m.g.setAttribute('transform', `translate(${m.from[0] + (m.to[0] - m.from[0]) * e} ${m.from[1] + (m.to[1] - m.from[1]) * e})`);
			if (fade) balls.forEach((b) => (b.style.opacity = String(Math.max(0, 1 - (now - t0) / BALL_FADE_MS))));
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

