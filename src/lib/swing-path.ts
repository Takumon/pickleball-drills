/**
 * 振りの道筋: 振りかぶり → （途中の点 via）→ 打つ所 → 振り抜き を、点を順につないだ道として扱う。
 * 点は打つ所からのずれ [上へ ft, 前へ ft, パドルの回り（度）]。サーブの「ナイキのマーク」のように、
 * 振りかぶりからいったん下がってから上がる振りは、途中の点で形を決める（config/court.ts の shotSwing の via）
 */
export type SwingPt = [number, number, number];
const REST: SwingPt = [0, 0, 0];

export function swingPath(back: SwingPt, follow: SwingPt, via: SwingPt[] = []) {
	const pts: SwingPt[] = [back, ...via, REST, follow];
	const lens = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
	const total = lens.reduce((a, b) => a + b, 0);
	const cum = lens.map((_, i) => lens.slice(0, i + 1).reduce((a, b) => a + b, 0));
	// パドルが打つ所を通る、振りの中の割合（道のりの比）
	const restAt = pts.length - 2;
	const contact = total > 0 ? (cum[restAt - 1] ?? 0) / total : 0;
	/** 振りの中の割合 u（0〜1）での区間 [p, q, 区間の中の割合] */
	const at = (u: number): [SwingPt, SwingPt, number] => {
		if (total <= 0) return [REST, REST, 0];
		const d = Math.max(0, Math.min(1, u)) * total;
		let i = cum.findIndex((c) => c >= d);
		if (i < 0) i = lens.length - 1;
		const start = i > 0 ? cum[i - 1] : 0;
		return [pts[i], pts[i + 1], lens[i] > 0 ? (d - start) / lens[i] : 1];
	};
	return { contact, at };
}

/**
 * 体の横へ回す振り（lateral。フォアのフリック）: パドルは体の正面の面の中で、手首を軸に下から横、上へ回る。
 * 横から見た図では、パドルは回らずに、手から上下に伸び縮みして見える（真横を向いた所で一番短い）。
 * turn（度）は打つ瞬間からの回りで、打つ瞬間（turn 0）はパドルの先が真上。長さの割合は cos(turn)（負は下向き）。
 * 返すのは、手（hx, hy）を止めたまま、パドルの向き（ux, uy）にだけ伸び縮みさせる SVG の matrix
 */
export function lateralMatrix(turnDeg: number, ux: number, uy: number, hx: number, hy: number): string {
	const k = Math.cos((turnDeg * Math.PI) / 180);
	const a = 1 + (k - 1) * ux * ux;
	const b = (k - 1) * ux * uy;
	const d = 1 + (k - 1) * uy * uy;
	const e = hx - (a * hx + b * hy);
	const f = hy - (b * hx + d * hy);
	return `matrix(${a} ${b} ${b} ${d} ${e} ${f})`;
}
/** パドルの向き（手から先へ向かう単位ベクトル）。面の線の、手から遠い端へ向かう向き */
export function paddleAxis(face: Element | null | undefined, hx: number, hy: number): [number, number] {
	if (!face) return [0, -1];
	const g = (k: string) => Number(face.getAttribute(k));
	const [x1, y1, x2, y2] = [g('x1'), g('y1'), g('x2'), g('y2')];
	const far = Math.hypot(x2 - hx, y2 - hy) >= Math.hypot(x1 - hx, y1 - hy) ? [x2, y2] : [x1, y1];
	const n = Math.hypot(far[0] - hx, far[1] - hy) || 1;
	return [(far[0] - hx) / n, (far[1] - hy) / n];
}
