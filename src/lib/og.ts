/**
 * 共有のプレビュー画像（OGP）に描く「決めの場面」を、ドリルの図のデータから選ぶ。
 *
 * 決まり:
 * 1. 主役の手: 練習役が打つ球のうち、最後の1球
 * 2. きっかけの手: 主役の手より前で、主役以外の人が打った最後の1球
 * 3. きっかけの手から主役の手の前までの、主役の人の動き（サイドステップ、下がるなど）
 * それより前の手（最初のディンクの往復など）は描かない。
 * 合わないドリルは、図のデータの ogSteps で描く手（番号）を指定する。
 * 選んだ手は 1, 2… と番号を振り直し、人はその最初の手の時点の位置に置く。
 */
import type { Diagram } from '../content.config';

type Shot = Diagram['shots'][number];

export function ogDiagram(d: Diagram): Diagram {
	const steps = (s: Shot) => s.n ?? 0;
	let picked: Shot[];
	if (d.ogSteps?.length) {
		picked = d.shots.filter((s) => d.ogSteps!.includes(steps(s)));
	} else {
		const practice = new Set(d.players.filter((p) => p.role === 'practice').map((p) => p.id));
		const hits = d.shots.filter((s) => s.type !== 'move');
		const main = [...hits].reverse().find((s) => typeof s.from === 'string' && practice.has(s.from));
		if (!main) return d;
		const trigger = [...hits].reverse().find((s) => steps(s) < steps(main) && s.from !== main.from);
		if (!trigger) picked = [main];
		else
			picked = d.shots.filter(
				(s) =>
					s === trigger ||
					s === main ||
					(s.type === 'move' && s.from === main.from && steps(s) >= steps(trigger) && steps(s) < steps(main)),
			);
	}
	if (picked.length === 0) return d;
	// 選んだ手より前の動きを反映して、人の最初の位置を決める
	const first = Math.min(...picked.map(steps));
	const pos = new Map(d.players.map((p) => [p.id, [p.x, p.y] as [number, number]]));
	for (const s of d.shots) {
		if (steps(s) < first && s.type === 'move' && typeof s.from === 'string' && typeof s.to !== 'string') pos.set(s.from, s.to);
	}
	const order = [...new Set(picked.map(steps))].sort((a, b) => a - b);
	return {
		...d,
		players: d.players.map((p) => ({ ...p, x: pos.get(p.id)![0], y: pos.get(p.id)![1] })),
		// 手元のワンバウンドは描かない（プレビューは止まった絵なので）
		shots: picked.map((s) => ({ ...s, n: order.indexOf(steps(s)) + 1, afterBounce: false })),
		ogSteps: undefined,
	};
}
