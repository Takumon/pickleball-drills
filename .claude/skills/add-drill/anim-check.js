// 全部のドリルのアニメーションを、決まりどおりか自動で確かめる（Claude in Chrome の javascript_tool に、このファイルの中身をそのまま貼って実行する）。
// 開発サーバーのどのページから実行してもよい。ドリルの一覧（/drills/ のページのリンク）を集め、
// 各ドリルを画面の上に並べた小さな枠（iframe）で開き、アニメーションを1周（最後の手のあと最初の手に戻るまで）見ながら測る。
// 調べたいドリルだけにするときは、最後の行の引数に ID を並べる（例: ['spd002', 'drp006']）。
//
// 測ること（docs/diagrams.md「アニメーション」「横から見た図」の決まり）:
// 1. つながり: 1こま（約16ms）の動きが、ボール・人・パドルの先で 1.5ft、横から見た図の手・ひじで 1.2ft を超えない（スマッシュのパドルの先は1こまで約1.3ft 動く）。
//    こまが飛んだとき（40ms 以上）、新しい球を出す手に切り替わる瞬間、ループで消したボールを出し直すときは数えない。
// 2. 打つ瞬間（横から見た図のボールが動き出したこま）: 打つ人のパドルの面の真ん中が、ボールから 0.7ft 以内にある。
// 3. 打つ瞬間の面の向き: 面に垂直な向きと、ボールが飛び出す向きの差が 25° 以内。
// 結果は、外れたドリルと場所の一覧。全部合っていれば「全部 OK」。
(async (only = []) => {
	const base = location.pathname.split('/drills/')[0].replace(/\/$/, '').replace(/\/(legend|builder|menu).*$/, '');
	const root = base.includes('/pickleball-drills') ? '/pickleball-drills' : base;
	// ドリルの一覧: ドリル一覧のページ（/drills/）のリンクから集める
	const ids = new Set();
	const res = await fetch(`${root}/drills/`).catch(() => undefined);
	const html = res?.ok ? await res.text() : '';
	for (const m of html.matchAll(/\/drills\/([a-z0-9]{3})\/([a-z0-9]{3}\d{3})\//g)) ids.add(`${m[1]}/${m[2]}`);
	const list = [...ids].filter((p) => only.length === 0 || only.includes(p.split('/')[1])).sort();
	if (list.length === 0) return 'ドリルが見つからない';

	// 1つのドリルを測る（iframe の中で）
	const measure = (win) =>
		new Promise((resolve) => {
			const doc = win.document;
			const anim = doc.querySelector('[data-court-anim]');
			if (!anim) return resolve(['アニメーションの図がない']);
			anim.scrollIntoView({ block: 'start' });
			const frames = [...anim.querySelectorAll('svg.frame')];
			const issues = [];
			const worst = {};
			const last = {};
			const ballPrev = {};
			let prevFaces = {};
			let prevFrameForBalls = -1;
			let prevFrame = -1;
			let prevT = win.performance.now();
			const t0 = prevT;
			let seenLast = false;
			let doneAt = Infinity;
			// 図の座標（その手の svg の座標）での点。transform（人ごと・手・パドル）をすべて含める
			const pt = (svg, el, x, y) => {
				const m = svg.getScreenCTM()?.inverse().multiply(el.getScreenCTM());
				if (!m) return undefined;
				return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
			};
			const num = (el, a) => Number(el.getAttribute(a));
			const note = (key, d, limit, where) => {
				if (d > limit && d > (worst[key] ?? 0)) worst[key] = d, (worst[`${key}@`] = where);
			};
			const tick = (now) => {
				const dt = now - prevT;
				prevT = now;
				const fi = frames.findIndex((f) => f.style.display !== 'none');
				const svg = frames[fi];
				if (!svg) return resolve(['表示中の手がない']);
				const fresh = fi !== prevFrame && !!svg.querySelector('path[data-kind="ball"][data-fresh]');
				const where = `${fi + 1}手目`;
				if (fi === frames.length - 1) seenLast = true;
				if (seenLast && fi === 0 && doneAt === Infinity) doneAt = now + 1500;
				prevFrame = fi;
				// 手が切り替わったこまでは、球が2つ以上あると球の番号が入れ替わる（受けた人が打つ球を、その手の最初に並べるため）。
				// 見た目のつながりは「どれかの球の前の位置」から測る
				const switched = fi !== prevFrameForBalls;
				const lastBalls = (side) => Object.entries(last).filter(([k]) => (side ? k.startsWith('横のボール') : k.startsWith('ボール'))).map(([, v]) => v);
				const put = (k, p, limit, skip) => {
					if (!p) return;
					if (last[k] && !skip && dt < 40) {
						let d = Math.hypot(p[0] - last[k][0], p[1] - last[k][1]);
						if (switched && /ボール/.test(k)) d = Math.min(d, ...lastBalls(k.startsWith('横')).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])));
						// 1こま（16.7ms）あたりに直す（いくつも同時に測ると、こまの間がのびることがあるため）
						note(k, (d * 16.7) / Math.max(16.7, dt), limit, where);
					}
					next[k] = p;
				};
				const next = {};
				// ボール（上から見た図）と人
				for (const ball of svg.querySelectorAll('.ball')) {
					const k = ball.dataset.k ?? '0';
					const hidden = ball.style.opacity === '0' || /translate\(-10 -10\)/.test(ball.getAttribute('transform') ?? '');
					if (hidden) delete last[`ボール${k}`];
					else put(`ボール${k}`, pt(svg, ball, 0, 0), 1.5, fresh);
				}
				for (const g of svg.querySelectorAll('[data-player-id]')) {
					const c = g.querySelector('circle.body');
					put(`人 ${g.dataset.playerId}`, pt(svg, c, num(c, 'cx'), num(c, 'cy')), 1.5, false);
				}
				// 横から見た図の人: 手・ひじ・パドルの先
				for (const g of svg.querySelectorAll('[data-side-player]')) {
					const id = g.dataset.sidePlayer;
					const hand = g.querySelector('.side-hand');
					const elbow = g.querySelector('.side-elbow');
					const pad = g.querySelector('.side-paddle');
					if (hand) put(`横の${id}の手`, pt(svg, hand, num(hand, 'cx'), num(hand, 'cy')), 1.2, false);
					if (elbow) put(`横の${id}のひじ`, pt(svg, elbow, num(elbow, 'cx'), num(elbow, 'cy')), 1.2, false);
					if (pad) put(`横の${id}のパドルの先`, pt(svg, pad, num(pad, 'x2'), num(pad, 'y2')), 1.5, false);
				}
				// 横から見た図のボール: 止まっていたボールが、打つ高さ（data-h の最初）から動き出したこまを、打つ瞬間とみなす
				// （ループで戻る・新しい球を出し直すときの動き出しは、打つ高さからではないので数えない）。
				// 面は、動き出す前のこまと動き出したこまの、球に近いほうで測る（1こまのあいだにもパドルは進むため）
				const paths = [...svg.querySelectorAll('path[data-kind="ball"]')];
				const faces = {};
				for (const g of svg.querySelectorAll('[data-side-player]')) {
					const pad = g.querySelector('.side-paddle');
					if (pad) faces[g.dataset.sidePlayer] = [pt(svg, pad, num(pad, 'x1'), num(pad, 'y1')), pt(svg, pad, num(pad, 'x2'), num(pad, 'y2'))];
				}
				for (const sb of svg.querySelectorAll('.side-ball')) {
					const k = sb.dataset.k ?? '0';
					const key = `${fi}:${k}`;
					// 上から見た図の同じボールが隠れている間（ループで消して出し直すとき）は測らない
					const top = [...svg.querySelectorAll('.ball')].find((b) => (b.dataset.k ?? '0') === k);
					const topHidden = !top || top.style.opacity === '0' || /translate\(-10 -10\)/.test(top.getAttribute('transform') ?? '');
					const p = num(sb, 'cx') < -5 || sb.style.opacity === '0' || topHidden ? undefined : pt(svg, sb, num(sb, 'cx'), num(sb, 'cy'));
					if (!p) {
						delete ballPrev[key];
						delete last[`横のボール${k}`];
						continue;
					}
					put(`横のボール${k}`, p, 1.5, fresh);
					const prev = ballPrev[key];
					const moving = prev && Math.hypot(p[0] - prev.p[0], p[1] - prev.p[1]) > 0.01;
					if (prev && moving && prev.still >= 2 && !prev.checked) {
						prev.checked = true;
						const path = paths[Number(k)];
						const hitter = path?.dataset.hitter;
						const g = hitter ? svg.querySelector(`[data-side-player="${hitter}"]`) : undefined;
						const input = g ? JSON.parse(g.dataset.poseInput ?? '{}') : {};
						const h0 = Number(path?.dataset.h?.split(',')[0]);
						const fromHit = g && Number.isFinite(h0) && Math.abs(prev.p[0] - (input.x0 + h0 * input.k)) < 0.3 && Math.abs(prev.p[1] - input.faceY) < 1;
						const cands = [faces[hitter], prevFaces[hitter]].filter(Boolean);
						if (fromHit && cands.length) {
							const midOf = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
							const [a, b] = cands.reduce((x, y) => (Math.hypot(...midOf(x).map((v, i) => v - prev.p[i])) <= Math.hypot(...midOf(y).map((v, i) => v - prev.p[i])) ? x : y));
							const mid = midOf([a, b]);
							const miss = Math.hypot(prev.p[0] - mid[0], prev.p[1] - mid[1]);
							if (miss > 0.7) issues.push(`${where} ${hitter}（${path.dataset.type ?? ''}）: 打つ瞬間の面が球から ${miss.toFixed(1)}ft 離れている`);
							// 面の向き: 面の線に垂直な向きと、ボールの飛び出す向きの差（向きの表裏は問わない）
							const dir = Math.atan2(p[1] - prev.p[1], p[0] - prev.p[0]);
							// 面の向きは、動き出す前のこまと動き出したこまの面の平均（打つ瞬間はその間にある）
							const vec = ([u, w]) => [w[0] - u[0], w[1] - u[1]].map((v, _, arr) => v / Math.hypot(...arr));
							const vs = cands.map(vec);
							const line = Math.atan2(vs.reduce((t, v) => t + v[1], 0), vs.reduce((t, v) => t + v[0], 0));
							let diff = Math.abs(((dir - line) * 180) / Math.PI) % 180;
							diff = Math.abs(90 - diff);
							// 3次元で動かす打ち方（data-lateral。フリック）は、横から見た線がパドルの軸（面の幅は描かない）なので、面の向きは測らない（2026-11-28）
							if (diff > 25 && path.dataset.lateral === undefined) issues.push(`${where} ${hitter}（${path.dataset.type ?? ''}）: 打つ瞬間の面の向きが、球の飛ぶ向きと ${diff.toFixed(0)}° ずれている`);
						}
					}
					ballPrev[key] = { p, still: moving ? 0 : (prev?.still ?? 0) + 1, checked: moving ? (prev?.checked ?? false) : false };
				}
				prevFaces = faces;
				for (const k of Object.keys(next)) last[k] = next[k];
				prevFrameForBalls = fi;
				if (now < doneAt && now - t0 < 30000) win.requestAnimationFrame(tick);
				else {
					for (const k of Object.keys(worst)) if (!k.endsWith('@')) issues.push(`${worst[`${k}@`]} ${k}: 1こまで ${worst[k].toFixed(2)}ft 跳んだ`);
					resolve([...new Set(issues)]);
				}
			};
			win.requestAnimationFrame(tick);
		});

	// 画面の上に枠を並べて、いくつかずつ同時に測る（画面に見えていないとアニメーションが止まるため、見える所に置く）
	const box = document.createElement('div');
	box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111;display:grid;grid-template-columns:repeat(3,1fr);gap:2px;overflow:hidden';
	document.body.appendChild(box);
	const one = (p) =>
		new Promise((resolve) => {
			const f = document.createElement('iframe');
			f.style.cssText = 'width:400px;height:700px;border:0;transform:scale(0.45);transform-origin:0 0';
			const cell = document.createElement('div');
			cell.style.cssText = 'overflow:hidden;height:320px';
			cell.appendChild(f);
			box.appendChild(cell);
			f.onload = () => setTimeout(() => measure(f.contentWindow).then((r) => (cell.remove(), resolve([p, r]))), 800);
			f.src = `${root}/drills/${p}/`;
		});
	const results = [];
	// 同時に測る数。多いとこまの間がのびて、跳びや向きを正しく測れないことがある
	const PAR = 3;
	for (let i = 0; i < list.length; i += PAR) results.push(...(await Promise.all(list.slice(i, i + PAR).map(one))));
	// 外れたドリルは、1つずつ測り直す（同時に測ると、ブラウザが重いときにこまの間がのびて、外れて見えることがあるため）。
	// 測り直しても外れたものだけを出す
	for (const r of results) if (r[1].length > 0) r[1] = (await one(r[0]))[1];
	box.remove();
	const bad = results.map(([p, r]) => [p.split('/')[1], r]).filter(([, r]) => r.length > 0);
	if (bad.length === 0) return `${results.length} ドリル: 全部 OK`;
	return `${results.length} ドリル中 ${bad.length} で外れ:\n` + bad.map(([id, r]) => `${id}\n  ${r.join('\n  ')}`).join('\n');
})();
