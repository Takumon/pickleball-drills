/**
 * 腕の形: 関節から関節まで、太さが変わる台形（元の太さ w1 → 先の太さ w2）の path。
 * 上腕は肩 約9.5cm → ひじ 約7.5cm、前腕はひじ 約8cm → 手首 約5.5cm（日本人成人男性の平均的な周りの長さから。
 * 線の丸い端は使わず、ひじは丸（.side-elbow）でつなぐ）
 */
export function taper(x1: number, y1: number, x2: number, y2: number, w1: number, w2: number): string {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const l = Math.hypot(dx, dy) || 1e-6;
	const nx = -dy / l;
	const ny = dx / l;
	const f = (v: number) => +v.toFixed(3);
	const p = [
		[x1 + (nx * w1) / 2, y1 + (ny * w1) / 2],
		[x2 + (nx * w2) / 2, y2 + (ny * w2) / 2],
		[x2 - (nx * w2) / 2, y2 - (ny * w2) / 2],
		[x1 - (nx * w1) / 2, y1 - (ny * w1) / 2],
	];
	return `M${p.map((q) => q.map(f).join(' ')).join(' L')} Z`;
}

/** 横から見た人の腕の形を、データを持つ線（.side-upperarm・.side-arm）の今の位置に合わせる。打つ動きで線を動かしたあとに呼ぶ */
export function syncArm(side: Element | null | undefined) {
	if (!side) return;
	const pairs: [string, string][] = [
		['.side-upperarm', '.side-upperarm-shape'],
		['.side-arm', '.side-forearm-shape'],
	];
	for (const [lineSel, shapeSel] of pairs) {
		const line = side.querySelector<SVGLineElement>(lineSel);
		const shape = side.querySelector<SVGPathElement>(shapeSel);
		if (!line || !shape) continue;
		const n = (a: string) => Number(line.getAttribute(a));
		shape.setAttribute('d', taper(n('x1'), n('y1'), n('x2'), n('y2'), Number(shape.dataset.w1), Number(shape.dataset.w2)));
	}
	const up = side.querySelector<SVGLineElement>('.side-upperarm');
	const elbow = side.querySelector<SVGCircleElement>('.side-elbow');
	if (up && elbow) {
		elbow.setAttribute('cx', up.getAttribute('x2') ?? '0');
		elbow.setAttribute('cy', up.getAttribute('y2') ?? '0');
	}
}
