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
 * 3次元で動かすフォアのフリック（data-lateral）。人の向く向きを x（前）、見ている向き（体の横）を y、上を z とする。
 * パドルの先は、手首を軸に y の側を通る半円を描く: 振りかぶり（s=0）はほぼ真下（少し後ろ）、振り終わり（s=1）は前の少し上で、
 * 途中（s=0.5、打つ瞬間）は体の横（y）を向く。横から見た図（x-z）では、先が7時から2時の向きへ動き、
 * 打つ瞬間は面の幅だけが見える（書き手の説明 2026-11-28: 横から見ると7時から2時。実際は y の側で半円を描く）。
 * turn（度）から s = 0.5 + turn / 200。返すのは、横から見た図のグリップと面の線（図の座標）。
 * k: 1ft の長さ（図の座標）、toNet: 前（ネットの側）が図の +y なら 1、-y なら -1。図の x が上
 */
export function flickLines(turnDeg: number, hx: number, hy: number, k: number, toNet: number) {
	const s = Math.max(0, Math.min(1, 0.5 + turnDeg / 200));
	// [前, 横, 上]
	// 構えの向き: ほぼ真下（少し後ろ）。動画のコマでは、パドルの先はひざの近くまで真下へ下がる
	const S = [Math.cos((-105 * Math.PI) / 180), 0, Math.sin((-105 * Math.PI) / 180)];
	const E = [Math.cos((30 * Math.PI) / 180), 0, Math.sin((30 * Math.PI) / 180)];
	const norm = (v: number[]) => {
		const n = Math.hypot(v[0], v[1], v[2]) || 1;
		return v.map((x) => x / n);
	};
	const T = norm([S[0] + (E[0] - S[0]) * s, Math.sin(Math.PI * s), S[2] + (E[2] - S[2]) * s]);
	// 面の向き: パドルの向きに垂直なうちで、いちばん前（ネットの側）を向く向き
	const N = norm([1 - T[0] * T[0], -T[0] * T[1], -T[0] * T[2]]);
	// 面の幅の向き（パドルの向きと面の向きの両方に垂直）
	const W = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
	// 横から見た図の座標へ（前と上だけを使う）
	const at = (f: number, u: number): [number, number] => [hx + u * k, hy + toNet * f * k];
	const toFace = 9 / 12;
	const toButt = 1.5 / 12;
	const faceLen = 11 / 12;
	const width = 8 / 12;
	// 面は長方形なので、横から見ると、パドルの向きの長さと幅の向きの長さを足した線に見える（打つ瞬間は幅だけ）
	const D = [T[0] * faceLen + W[0] * width, T[2] * faceLen + W[2] * width];
	const C = [T[0] * toFace, T[2] * toFace];
	const fs = [C[0] - D[0] / 2, C[1] - D[1] / 2];
	const ft = [C[0] + D[0] / 2, C[1] + D[1] / 2];
	const butt = at(-T[0] * toButt, -T[2] * toButt);
	const g2 = at(C[0] - (T[0] * faceLen) / 2, C[1] - (T[2] * faceLen) / 2);
	return { grip: [...butt, ...g2], face: [...at(fs[0], fs[1]), ...at(ft[0], ft[1])] };
}
