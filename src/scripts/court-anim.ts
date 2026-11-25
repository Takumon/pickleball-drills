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
/** ボールの大きさ（高さ 1ft あたり）。高さそのものは右の帯（横から見た図）で見せる */
const BALL_R_GROUND = 0.6;
const BALL_R_PER_FT = 0.05;
const BALL_R_MAX = 1;
const PAUSE_MS = 700;
const LOOP_PAUSE_MS = 1600;

function setup(root: HTMLElement) {
	const frames = [...root.querySelectorAll<SVGSVGElement>('svg.frame')];
	const dots = [...root.querySelectorAll<HTMLElement>('[data-step-dot]')];
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
		const ball = frame.querySelector<SVGGElement>('.ball')!;
		const balls = [...frame.querySelectorAll<SVGPathElement>('path[data-kind="ball"]')];
		const sideBall = frame.querySelector<SVGCircleElement>('.side-ball');
		const sideTrace = frame.querySelector<SVGPathElement>('.side-trace');
		const sideX0 = Number(frame.dataset.sideX0);
		const sideK = Number(frame.dataset.sideK);
		const sideMax = Number(frame.dataset.sideMax);
		const sideX = (h: number) => sideX0 + Math.min(h, sideMax) * sideK;
		// 横から見た高さの帯に描く、ボールの通り道（打つ手の線を細かく区切った点）
		const tracePts = balls[0] ? Array.from({ length: 41 }, (_, j) => ballAt(balls[0], j / 40)) : [];
		const drawTrace = (ratio: number) => {
			if (!sideTrace) return;
			const n = Math.round(ratio * 40);
			const pts = tracePts.slice(0, n + 1);
			sideTrace.setAttribute('d', pts.length > 1 ? 'M' + pts.map((p) => `${sideX(p.h)} ${p.y}`).join(' L') : '');
		};
		const moves = [...frame.querySelectorAll<SVGPathElement>('path[data-kind="move"]')];
		const movers = moves.map((m) => {
			const g = frame.querySelector<SVGGElement>(`[data-player-id="${m.dataset.player}"]`);
			// 横から見た図の人も、奥行き（縦）だけ一緒に動かす
			const sg = frame.querySelector<SVGGElement>(`[data-side-player="${m.dataset.player}"]`);
			const len = m.getTotalLength();
			const start = m.getPointAtLength(0);
			const end = m.getPointAtLength(len);
			return { g, sg, dx: end.x - start.x, dy: end.y - start.y };
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
		const drawBall = (pos?: BallPos) => {
			if (!pos) {
				ball.setAttribute('transform', 'translate(-10 -10) scale(0.55)');
				sideBall?.setAttribute('cx', '-10');
				return;
			}
			const r = Math.min(BALL_R_MAX, BALL_R_GROUND + pos.h * BALL_R_PER_FT);
			ball.setAttribute('transform', `translate(${pos.x} ${pos.y}) scale(${r})`);
			sideBall?.setAttribute('cx', `${sideX(pos.h)}`);
			sideBall?.setAttribute('cy', `${pos.y}`);
		};
		const reset = () => {
			showMarks(animate ? -1 : 1);
			balls.forEach((_, k) => setReveal(k, animate ? 0 : 1));
			movers.forEach(({ g, sg }) => {
				g?.setAttribute('transform', '');
				sg?.setAttribute('transform', '');
			});
			// 打つ手なら打つ人のパドルから、人が動くだけの手なら前の手の終わりの位置にボールを置く
			const pre = balls[0]?.dataset.pre?.split(',').map(Number);
			setPreRings(!animate && !!pre);
			drawBall(
				balls[0]
					? animate && pre
						? { x: pre[0], y: pre[1], h: HAND_FT }
						: ballAt(balls[0], animate ? 0 : 1)
					: startBall[i],
			);
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
		const durations = [...balls, ...moves].map((p) => Number(p.dataset.ms) || SHOT_MS);
		const duration = durations.length ? Math.max(...durations) : SHOT_MS;
		// 打つ前に一度弾ませる球: 手前で弾んだボールが打点まで上がってから、打球が始まる
		const preAttr = balls[0]?.dataset.pre?.split(',').map(Number);
		const preMs = preAttr ? PRE_MS : 0;
		const t0 = performance.now();
		const tick = (now: number) => {
			const elapsed = now - t0;
			if (preAttr && elapsed < preMs) {
				const start = ballAt(balls[0], 0);
				if (elapsed < PRE_DROP_MS) {
					// 手から落とす: 手の高さから、だんだん速く地面へ
					const u = elapsed / PRE_DROP_MS;
					setPreRings(false);
					drawBall({ x: preAttr[0], y: preAttr[1], h: HAND_FT * (1 - u * u) });
				} else {
					// 弾んで打点まで上がる（上がるにつれてゆるむ）
					const u = (elapsed - PRE_DROP_MS) / (preMs - PRE_DROP_MS);
					setPreRings(true);
					const up = Math.sin((u * Math.PI) / 2);
					drawBall({ x: preAttr[0] + (start.x - preAttr[0]) * u, y: preAttr[1] + (start.y - preAttr[1]) * u, h: start.h * up });
				}
				raf = requestAnimationFrame(tick);
				return;
			}
			setPreRings(!!preAttr);
			const t = Math.min(1, (elapsed - preMs) / duration);
			const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // 人の動き: ease-in-out
			const eb = Math.sin((t * Math.PI) / 2); // ボール: 打った瞬間が速く、少しずつ減速する
			showMarks(eb);
			balls.forEach((b, k) => {
				setReveal(k, eb);
				if (k === 0) {
					drawBall(ballAt(b, eb));
					drawTrace(eb);
				}
			});
			movers.forEach(({ g, sg, dx, dy }) => {
				g?.setAttribute('transform', `translate(${dx * e} ${dy * e})`);
				sg?.setAttribute('transform', `translate(0 ${dy * e})`);
			});
			if (t < 1) raf = requestAnimationFrame(tick);
			else {
				balls.forEach((_, k) => setReveal(k, 1));
				showMarks(1);
				drawTrace(1);
				// ボールは消さずに、届いた位置に残す（次の手はそこから始まる）
				if (balls[0]) {
					drawBall(ballAt(balls[0], 1));
				}
				done?.();
			}
		};
		raf = requestAnimationFrame(tick);
	}

	function playFrom(i: number) {
		show(i, true, () => {
			if (!playing) return;
			const last = i === frames.length - 1;
			timer = window.setTimeout(() => playFrom(last ? 0 : i + 1), last ? LOOP_PAUSE_MS : PAUSE_MS);
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
	}
	show(0, false);
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

