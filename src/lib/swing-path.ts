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
