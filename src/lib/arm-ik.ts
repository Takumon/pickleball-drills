/**
 * 腕の形を、肩と手の位置から求める（上腕と前腕の長さは変えない）。打つ動きで手が動いても、腕が伸び縮みしないように使う。
 * ひじの候補は2つ（肩と手を結ぶ線の両側）。止まった形（lib/side-figure.ts）でひじがあった側（bendSide）を選び続ける。
 * 腕が真上や真下を通っても側が入れ替わらないので、ひじが跳ばない。座標は図の座標のまま
 */
export function solveElbow(sx: number, sy: number, hx: number, hy: number, upper: number, lower: number, side: number): [number, number] {
	const dx = hx - sx;
	const dy = hy - sy;
	const dist = Math.min(Math.hypot(dx, dy), (upper + lower) * 0.999) || 1e-6;
	const cosA = (upper * upper + dist * dist - lower * lower) / (2 * upper * dist);
	const g = Math.atan2(dy, dx) + side * Math.acos(Math.max(-1, Math.min(1, cosA)));
	return [sx + upper * Math.cos(g), sy + upper * Math.sin(g)];
}

/** 止まった形の肩・ひじ・手から、ひじが肩と手を結ぶ線のどちら側にあるか（+1 か -1） */
export function bendSide(sx: number, sy: number, ex: number, ey: number, hx: number, hy: number): number {
	return (hx - sx) * (ey - sy) - (hy - sy) * (ex - sx) >= 0 ? 1 : -1;
}

/**
 * 手が届く所まで: 肩から reach（上腕＋前腕）より遠い所へ手を動かそうとしたときは、同じ向きの届く所で止める。
 * 大きく振りかぶる打ち方（ドライブ・サーブ・リターン）で、腕が伸びて見えないように使う。パドルも手と一緒に止める
 */
export function clampReach(sx: number, sy: number, hx: number, hy: number, reach: number): [number, number] {
	const dx = hx - sx;
	const dy = hy - sy;
	const d = Math.hypot(dx, dy);
	const max = reach * 0.995;
	return d <= max ? [hx, hy] : [sx + (dx / d) * max, sy + (dy / d) * max];
}

/**
 * 手の通り道: 2つの位置 p → q のあいだを、肩を中心にした弧で結ぶ（向きと、肩からの距離を、それぞれ少しずつ変える）。
 * まっすぐ結ぶと、後ろの低い所から前の高い所へ振るときに手が肩の近くを通り、ひじが一時的に大きく曲がってしまう。
 * 人の腕は肩を中心に振り子のように回るので、弧で結ぶ。回る向きは短いほう（下を通る振り、頭の上を通る振り）
 */
export function arcLerp(sx: number, sy: number, p: [number, number], q: [number, number], t: number): [number, number] {
	const ap = Math.atan2(p[1] - sy, p[0] - sx);
	const aq = Math.atan2(q[1] - sy, q[0] - sx);
	let da = aq - ap;
	while (da > Math.PI) da -= 2 * Math.PI;
	while (da < -Math.PI) da += 2 * Math.PI;
	const rp = Math.hypot(p[0] - sx, p[1] - sy);
	const rq = Math.hypot(q[0] - sx, q[1] - sy);
	const a = ap + da * t;
	const r = rp + (rq - rp) * t;
	return [sx + r * Math.cos(a), sy + r * Math.sin(a)];
}

/**
 * 肩の動く範囲: 腕を体の後ろへ回せるのは、真下から後ろへ約 45° まで（書き手の指摘: ドライブの引きで肩が外れそうな向きに
 * 曲がっていた。横から見た図では体のひねりを描けないので、手を後ろの高い所へ回すと肩が逆に曲がって見える）。
 * 手がそれより後ろ（上）にあるときは、肩からの距離はそのままで、近いほうの境目（45° か、頭の上の -150°）まで戻す。
 * 座標は図の座標（x が高さ、y が前後）。front は前（ネットの側）が y の + なら 1、- なら -1
 */
export function limitShoulder(sx: number, sy: number, hx: number, hy: number, front: number, maxBackDeg = 45): [number, number] {
	const up = hx - sx;
	const fwd = (hy - sy) * front;
	const r = Math.hypot(up, fwd);
	// 真下からの角度（前が +）
	const a = Math.atan2(fwd, -up);
	// 動かせないのは、真下から後ろへ maxBackDeg〜頭の上の少し後ろ（-150°）までの間。頭の上へ前から回す腕（スマッシュの
	// 振りかぶりなど、-150° より後ろ = 頭の真上近く）はそのまま
	const min = (-maxBackDeg * Math.PI) / 180;
	const over = (-150 * Math.PI) / 180;
	if (a >= min || a <= over) return [hx, hy];
	const to = a - over < min - a ? over : min;
	return [sx - r * Math.cos(to), sy + front * r * Math.sin(to)];
}
