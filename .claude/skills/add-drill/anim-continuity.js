// アニメーションの連続性を測る（Claude in Chrome の javascript_tool に、このファイルの中身をそのまま貼って実行する）。
// ドリルのページ（またはメニューで開いた図）を表示した状態で、最初のアニメーションを2周ほど再生しながら、
// ボール（上から見た図の位置）・横から見た図のボール（高さと奥行き）・人の位置を、図の座標（ft）でこまごとに記録し、
// こまの間で一番大きく動いた量を返す。
// 目安: 1こま（約16ms）で 1.5ft を超えて動くことはない（一番速いスマッシュでも約1ft）。超えたら、手の切れ目
// （前の手の終わりと次の手の始まり、最後の手から最初の手へ戻るところ）で位置や高さが跳んでいる。
// こまが飛んだとき（前のこまから 40ms 以上たったとき）は数えない。球出しで新しいボールを出す手（data-fresh）に
// 切り替わる瞬間と、ループで一度消した（透明にした）ボールを出し直すときの跳びも、正しいので数えない。
(async (ms = 20000) => {
	const anim = document.querySelector('[data-court-anim]');
	if (!anim) return 'アニメーションの図がない';
	const frames = [...anim.querySelectorAll('svg.frame')];
	const tr = (el) => {
		const m = el?.getAttribute('transform')?.match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/);
		return m ? [Number(m[1]), Number(m[2])] : [0, 0];
	};
	const tracks = {};
	const last = {};
	let prevFrame = -1;
	let prevT = performance.now();
	const t0 = prevT;
	await new Promise((done) => {
		const tick = (now) => {
			const dt = now - prevT;
			prevT = now;
			const fi = frames.findIndex((f) => f.style.display !== 'none');
			const frame = frames[fi];
			const fresh = fi !== prevFrame && !!frame?.querySelector('path[data-kind="ball"][data-fresh]');
			prevFrame = fi;
			const put = (k, p, skip) => {
				const t = (tracks[k] ??= { max: 0, at: '' });
				if (last[k] && !skip && dt < 40) {
					const d = Math.hypot(...p.map((v, i) => v - last[k][i]));
					if (d > t.max) [t.max, t.at] = [d, `${fi + 1}手目`];
				}
				last[k] = p;
			};
			const ball = frame?.querySelector('.ball');
			const hidden = !ball || ball.style.opacity === '0' || /translate\(-10 -10\)/.test(ball.getAttribute('transform') ?? '');
			if (hidden) delete last['ボール'];
			else put('ボール', tr(ball), fresh);
			const side = frame?.querySelector('.side-ball');
			if (!side || hidden || Number(side.getAttribute('cx')) < -5) delete last['横から見た図のボール'];
			else put('横から見た図のボール', [Number(side.getAttribute('cx')), Number(side.getAttribute('cy'))], fresh);
			for (const g of frame?.querySelectorAll('[data-player-id]') ?? []) {
				const c = g.querySelector('circle.body');
				const [dx, dy] = tr(g);
				put(`人 ${g.dataset.playerId}`, [Number(c.getAttribute('cx')) + dx, Number(c.getAttribute('cy')) + dy], false);
			}
			if (now - t0 < ms) requestAnimationFrame(tick);
			else done();
		};
		requestAnimationFrame(tick);
	});
	const out = Object.entries(tracks).map(([k, t]) => `${k}: ${t.max.toFixed(2)}ft${t.max > 1.5 ? `（跳び。${t.at}）` : ''}`);
	return out.join('\n');
})();
