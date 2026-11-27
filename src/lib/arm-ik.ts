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
