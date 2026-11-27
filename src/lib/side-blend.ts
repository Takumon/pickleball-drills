/**
 * 手が切り替わるときに、横から見た人の形をなめらかにつなぐ（書き手と決めた: 切り替わりでパドルや腕が跳ばないように）。
 * 前の手の終わりの形（snapshot）から、次の手の形へ、BLEND_MS かけて混ぜる。
 * 次の手の形は毎コマ読み直す（振っている人は打つ動きが毎コマ書き換えるため）。数の並びが同じ属性だけ混ぜ、違えばそのまま
 */
const PARTS: [string, string[]][] = [
	['.side-shoe', ['points']],
	['.side-lower', ['d']],
	['.side-shoe2', ['points']],
	['.side-lower2', ['d']],
	['.side-torso', ['d']],
	['.side-neck-shape', ['d']],
	['.side-head', ['d']],
	['.side-hair', ['d']],
	['.side-upperarm-shape', ['d']],
	['.side-forearm-shape', ['d']],
	['.side-elbow', ['cx', 'cy']],
	['.side-grip', ['x1', 'y1', 'x2', 'y2', 'transform']],
	['.side-paddle', ['x1', 'y1', 'x2', 'y2', 'transform']],
	['.side-hand', ['cx', 'cy', 'transform']],
];
export const BLEND_MS = 260;

type Snap = Map<string, Map<string, string>>;
/** 人ごと動かした量（transform の translate の縦） */
const moved = (g: Element) => {
	const m = g.getAttribute('transform')?.match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/);
	return m ? Number(m[2]) : 0;
};
/** 人の立つ奥行き（data-pose-input の y に、人ごと動かした量を足す） */
const baseY = (g: HTMLElement) => Number(JSON.parse(g.dataset.poseInput ?? '{}').y) + moved(g);

/** 横から見た人の形を、人ごとに覚える */
export function snapshotSide(frame: Element): Snap {
	const snap: Snap = new Map();
	for (const g of frame.querySelectorAll<HTMLElement>('[data-side-player]')) {
		const m = new Map<string, string>();
		m.set('y', String(baseY(g)));
		m.set('ty', String(moved(g)));
		for (const [sel, attrs] of PARTS) {
			const el = g.querySelector(sel);
			if (el) for (const a of attrs) m.set(`${sel}|${a}`, el.getAttribute(a) ?? '');
		}
		snap.set(g.dataset.sidePlayer ?? '', m);
	}
	return snap;
}

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
/** transform を { 名前: 数 } にする（translate(x y) rotate(r cx cy) の形） */
const ops = (v: string) => new Map([...v.matchAll(/(translate|rotate)\(([^)]*)\)/g)].map((m) => [m[1], (m[2].match(NUM) ?? []).map(Number)]));
/**
 * 2つの transform を同じ並びにそろえる。片方にない変換は、何も動かさない値で足す（translate(0 0)、rotate(0 cx cy)。中心はもう片方のもの）。
 * 打つ動きは手やパドルを transform で動かし、止まった形は transform がないので、そのままでは並びが違って混ぜられず、跳んで見えるため
 */
const alignTransforms = (a: string, b: string): [string, string] => {
	const oa = ops(a);
	const ob = ops(b);
	const names = (['translate', 'rotate'] as const).filter((n) => oa.has(n) || ob.has(n));
	const idle = (n: string, other: number[]) => (n === 'translate' ? [0, 0] : [0, other[1] ?? 0, other[2] ?? 0]);
	const fmt = (o: Map<string, number[]>, other: Map<string, number[]>) =>
		names.map((n) => `${n}(${(o.get(n) ?? idle(n, other.get(n)!)).join(' ')})`).join(' ');
	return [fmt(oa, ob), fmt(ob, oa)];
};
/**
 * 切り替わりのずれを、だんだん消す: 今の形 cur に、切り替わった瞬間のずれ（前の形 old − その瞬間の形 first）を (1 − t) だけ足す。
 * 打っている人は形が毎コマ変わるので、前の形へ引き戻さずに、ずれの分だけを消していく（混ぜると打つ瞬間に面が球に届かない）
 */
const offsetMix = (old: string, first: string, cur: string, t: number) => {
	if (t >= 1) return cur;
	const isT = (v: string) => v === '' || /^\s*(translate|rotate)\(/.test(v);
	let [o, f, c] = [old, first, cur];
	if (isT(o) && isT(f) && isT(c)) {
		// 3つの transform の並びをそろえる
		[o, f] = alignTransforms(o, f);
		[o, c] = alignTransforms(o, c);
		[f, c] = alignTransforms(f, c);
		[o, f] = alignTransforms(o, f);
	}
	const no = o.match(NUM);
	const nf = f.match(NUM);
	const nc = c.match(NUM);
	const shape = (v: string) => v.replace(NUM, '#');
	if (!no || !nf || !nc || no.length !== nc.length || nf.length !== nc.length || shape(o) !== shape(c) || shape(f) !== shape(c)) return cur;
	let i = 0;
	return c.replace(NUM, () => {
		const v = Number(nc[i]) + (Number(no[i]) - Number(nf[i])) * (1 - t);
		i++;
		return String(+v.toFixed(4));
	});
};
const mix = (a0: string, b0: string, t: number) => {
	const isT = (v: string) => v === '' || /^\s*(translate|rotate)\(/.test(v);
	const [a, b] = isT(a0) && isT(b0) && a0 !== b0 ? alignTransforms(a0, b0) : [a0, b0];
	const na = a.match(NUM);
	const nb = b.match(NUM);
	if (!na || !nb || na.length !== nb.length || a.replace(NUM, '#') !== b.replace(NUM, '#')) return b0;
	if (t >= 1) return b0;
	let i = 0;
	return b.replace(NUM, () => {
		const v = Number(na[i]) + (Number(nb[i]) - Number(na[i])) * t;
		i++;
		return String(+v.toFixed(4));
	});
};

/**
 * 前の形 from から、frame の今の形へ混ぜる道具。step(t) を毎コマ呼ぶ（t: 0〜1）。skip: この手で動く人（形は混ぜ、人ごとの位置は動きに任せる）
 */
export function sideBlender(frame: Element, from: Snap, skip: Set<string> = new Set(), quick: Map<string, number> = new Map()) {
	// 混ぜ終える時間（ms）。この手で打つ人は、打つ瞬間より前に混ぜ終える（quick。混ぜ残りがあると、打つ瞬間に面が球に届かない）
	const durOf = (id: string) => Math.max(1, Math.min(BLEND_MS, quick.get(id) ?? BLEND_MS));
	const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
	const targets = new Map<Element, Map<string, string>>();
	const written = new Map<Element, Map<string, string>>();
	const items: { el: Element; attr: string; key: string; old: string; first?: string; dur: number }[] = [];
	// 前の手で人ごと動かしてあった量: 形の数は動かす前の位置なので、混ぜる間は人ごとその量だけずらし、だんだん 0 にする。
	// この手で動く人（skip）は、人ごとの位置を動き（court-anim.ts の movers）が毎コマ決めるので、残りの量を data-blend-ty で渡して足してもらう
	const groups: { g: HTMLElement; ty: number; mover: boolean; dur: number }[] = [];
	for (const g of frame.querySelectorAll<HTMLElement>('[data-side-player]')) {
		const old = from.get(g.dataset.sidePlayer ?? '');
		// 立つ位置が変わる人（動く手）は混ぜない。動く手では、人ごと動く（data-shift）ので、形を混ぜると位置が二重にずれる
		if (!old || Math.abs(Number(old.get('y')) - baseY(g)) > 0.01) continue;
		const ty = Number(old.get('ty')) - moved(g);
		const dur = durOf(g.dataset.sidePlayer ?? '');
		if (ty) groups.push({ g, ty, mover: skip.has(g.dataset.sidePlayer ?? ''), dur });
		for (const [sel, attrs] of PARTS) {
			const el = g.querySelector(sel);
			if (!el) continue;
			for (const a of attrs) items.push({ el, attr: a, key: `${sel}|${a}`, old: old.get(`${sel}|${a}`) ?? '', dur });
		}
	}
	/** ms: 切り替えてからの時間。全員が混ぜ終えたら true を返す */
	return (ms: number) => {
		for (const { g, ty, mover, dur } of groups) {
			const t = ease(Math.min(1, ms / dur));
			if (mover) {
				// 動きと同じ式（動いた量 + 残り）で書く。動きがまだ始まっていないコマでも、位置が合うように
				if (t >= 1) delete g.dataset.blendTy;
				else g.dataset.blendTy = String(ty * (1 - t));
				const y = Number(g.dataset.moveTy ?? 0) + Number(g.dataset.blendTy ?? 0);
				if (y) g.setAttribute('transform', `translate(0 ${y})`);
				else g.removeAttribute('transform');
			} else if (t >= 1) g.removeAttribute('transform');
			else g.setAttribute('transform', `translate(0 ${ty * (1 - t)})`);
		}
		for (const it of items) {
			const t = ease(Math.min(1, ms / it.dur));
			const cur = it.el.getAttribute(it.attr) ?? '';
			const w = written.get(it.el)?.get(it.attr);
			// 前のコマで混ぜた値のままなら、覚えている目標を使う。書き換わっていれば（打つ動き）、それが今の目標
			if (w === undefined || cur !== w) (targets.get(it.el) ?? targets.set(it.el, new Map()).get(it.el)!).set(it.attr, cur);
			const target = targets.get(it.el)!.get(it.attr)!;
			it.first ??= target;
			const v = offsetMix(it.old, it.first, target, t);
			if (v === '') it.el.removeAttribute(it.attr);
			else it.el.setAttribute(it.attr, v);
			(written.get(it.el) ?? written.set(it.el, new Map()).get(it.el)!).set(it.attr, v);
		}
		return ms >= BLEND_MS;
	};
}

/** 1人分の形を覚える（snapshotSide の1人分） */
export function snapshotGroup(g: Element): Map<string, string> {
	const m = new Map<string, string>();
	for (const [sel, attrs] of PARTS) {
		const el = g.querySelector(sel);
		if (el) for (const a of attrs) m.set(`${sel}|${a}`, el.getAttribute(a) ?? '');
	}
	return m;
}

/** 1人分: 今描いてある形（目標）を、覚えた形 old から t の所まで戻して描く（t = 1 で今の形のまま） */
export function blendGroup(g: Element, old: Map<string, string>, t: number) {
	if (t >= 1) return;
	for (const [sel, attrs] of PARTS) {
		const el = g.querySelector(sel);
		if (!el) continue;
		for (const a of attrs) {
			const v = mix(old.get(`${sel}|${a}`) ?? '', el.getAttribute(a) ?? '', t);
			if (v === '') el.removeAttribute(a);
			else el.setAttribute(a, v);
		}
	}
}
