import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { categoryCodes } from './config/categories';
import {
	fenceGeometry,
	heightLevels,
	roleLabels,
	shotLabels,
	spotPoint,
	landInFront,
	zoneRects,
	type HeightLevel,
	type Role,
	type ShotType,
	type ZoneName,
} from './config/court';

const keysOf = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];
const point = z.tuple([z.number(), z.number()]);

/** コート図（座標はフィート。src/config/court.ts 参照） */
const diagram = z.object({
	players: z
		.array(
			z.object({
				id: z.string(),
				/** 立ち位置の名前（例: near-right-baseline。config/court.ts の DEPTHS・LANES）。x・y の代わりに書く */
				at: z.string().optional(),
				x: z.number().optional(),
				y: z.number().optional(),
				role: z.enum(keysOf<Role>(roleLabels)).default('practice'),
				label: z.string().optional(),
				/** パドルの構え: ready=体の前 / fh=フォア側 / bh=バック側 */
				paddle: z.enum(['ready', 'fh', 'bh']).default('ready'),
				/** 向き。省略時はネット側（y<22 なら down、それ以外は up） */
				facing: z.enum(['up', 'down']).optional(),
				/** 左利きで描く（既定は右利き） */
				lefty: z.boolean().default(false),
				/**
				 * 相手の球を受けるときに動く位置（例: near-rightOuter-kitchen）。at が基本の位置になる。
				 * 書いておくと、コードが動きを足す: 相手がこの人へ打った手で、反応して sidestep の位置へ動き（球はそこへ届く）、
				 * 次に自分が打つ手で、打ちながら基本の位置へ戻る。最初の手で自分から打つ人は、受けたあとの sidestep の位置から始める
				 * （繰り返したときに最後の立ち位置と最初の立ち位置がそろい、人が跳ばない）
				 */
				sidestep: z.string().optional(),
			}),
		)
		.default([]),
	shots: z
		.array(
			z.object({
				from: z.union([z.string(), point]),
				to: z.union([z.string(), point]),
				type: z.enum(keysOf<ShotType>(shotLabels)),
				/** 曲げる量（距離に対する割合）。ロブは指定しなければ 0.25 */
				curve: z.number().optional(),
				/** 順番を示す番号。番号ごとに1コマの図にする */
				n: z.number().int().optional(),
				/** 球出しの球なら true。線は球の種類で描き、名前は「球出し（ディンク）」のようにする */
				feed: z.boolean().default(false),
				/** 線の上に書く名前。省略時は打球の種類名（人の動きは「移動」） */
				label: z.string().optional(),
				/**
				 * バウンドする位置。線の上のいちばん近い点に印を付ける。
				 * front なら受ける人の手前（決まった距離）で弾む。
				 * 省略時: コートに落とす球（to が座標）は終点に印を付け、サーブ・リターンは front と同じ。
				 * false なら印を付けない（ノーバウンド）。
				 */
				bounce: z.union([point, z.literal(false), z.literal('front')]).optional(),
				/** 打つ前に、打つ人の手前で一度弾ませてから打つ（ワンバウンドさせてから出す球出しなど） */
				afterBounce: z.boolean().default(false),
				/** 打つ高さ・山の高さ（config/court.ts の heightLevels）。省略時は打球の種類で決まる。例: ロールのスピードアップは hit: underTape */
				hit: z.enum(keysOf<HeightLevel>(heightLevels)).optional(),
				peak: z.enum(keysOf<HeightLevel>(heightLevels)).optional(),
				/** 投げ下ろすような弧: 打った高さから上がらずに、だんだん速く下がっていく（上から投げ下ろす球出しなど）。peak は使わない */
				fall: z.boolean().default(false),
				/** ゲーム形式: この球で決まり、書いた人（ID）が1点取る。図に score があれば点の目盛りが動く。次の球は新しいボールになる */
				point: z.string().optional(),
				/**
				 * 失敗した球（書き手と決めた 2026-11-28）。次の手からは、この球を書かない。名前と「×」は、ほかの線と違う色で出す。
				 * - net: ネットにかかる。受ける人へ向かって飛び、ネットで止まる。名前は「ミス（ネット）」
				 * - out: 受ける人の外へそれて、コートの外に落ちる（取れない）。名前は「ミス（アウト）」
				 * 止まった所・落ちた所に、残りの球の数を出す
				 */
				miss: z.enum(['net', 'out']).optional(),
			}),
		)
		.default([]),
	zones: z.array(z.enum(keysOf<ZoneName>(zoneRects))).default([]),
	/** ドロップの的の柵（例: far-left）。config/court.ts の FENCE の決まりで位置を計算する。打球の to に fence.corner / fence.inside と書ける */
	fence: z.string().optional(),
	/** 決まりに当てはまらない柵を、[[x1, y1], [x2, y2]] の線分で直接書くとき */
	fences: z.array(z.tuple([point, point])).default([]),
	/** auto=使っている範囲だけ縦に切り出す / full=コート全体 */
	crop: z.enum(['auto', 'full']).default('auto'),
	caption: z.string().optional(),
	/**
	 * ゲーム形式の点の目盛り（綱引きのように、2人で1つの点を動かすゲーム）。to: 勝ちの点、plus: 点が増える人、minus: 点が減る人。
	 * 打球の point で点が動き、図の下の目盛りの印が左右に動く
	 */
	score: z.object({ to: z.number().int().min(1), plus: z.string(), minus: z.string() }).optional(),
	/**
	 * 失敗の決まり（球を何個も使うドリル）: 使っている球がこの数以下に減ったら失敗。最初の手の球の数から、ミス（miss）のたびに1つ減らす。
	 * 減ってこの数になった手では、コートの真ん中に「失敗 → 出し直し」と出す（書き手と決めた 2026-11-28）
	 */
	failAt: z.number().int().min(0).optional(),
	/**
	 * ラリー形式か（全部のドリルに必ず書く。書き手と決めた規則: ラリーかどうかで、アニメーションの繰り返し方が決まるため）。
	 * - 数（例: 2）: ラリー。書いた打球（1往復ぶん。例: A→B と B→A）を、球出しから始めてこの回数だけ往復させる。
	 *   最初の手は球出し（手元で一度弾ませて出す）になり、繰り返すときは新しい球の球出しから始め直す
	 * - true: ラリー。打球は書いたとおりに描き、最後の手から最初の手へ続けて繰り返す（球が4つ、点数を数える、途中でディンクをはさむなど）
	 * - false: ラリーではない（1本ずつ球出しして返す、決まった順に打つ）
	 */
	rally: z.union([z.number().int().min(1), z.boolean()], {
		error: 'コート図: rally（ラリー形式か）を必ず書く。2 などの数（コードが往復を作る）、true（書いた手のままのラリー）、false（ラリーではない）',
	}),
	/** 共有のプレビュー画像に描く手（番号 n）。書かなければ決まりで選ぶ（src/lib/og.ts） */
	ogSteps: z.array(z.number().int()).optional(),
}).refine(
	// 番号（n）のある打球とない打球が混ざると、番号のない打球はどのコマにも入らず描かれない
	(d) => d.shots.every((s) => s.n !== undefined) || d.shots.every((s) => s.n === undefined),
	{ message: 'コート図: 打球の番号 n は、全部の打球に付けるか、全部付けないかのどちらかにする', path: ['shots'] },
).transform((d, ctx) => {
	// 名前で書いた位置（立ち位置・柵・着地点）を、config/court.ts の決まりで座標にする
	const fence = d.fence ? fenceGeometry(d.fence) : undefined;
	const ids = new Set(d.players.map((p) => p.id));
	const players = d.players.map((p) => {
		const spot = p.at ? spotPoint(p.at) : undefined;
		if (p.at && !spot) ctx.addIssue({ code: 'custom', message: `コート図: at "${p.at}" は位置の名前ではない（例: near-right-baseline）` });
		if (!spot && (p.x === undefined || p.y === undefined)) ctx.addIssue({ code: 'custom', message: `コート図: 人 ${p.id} に at か x・y を書く` });
		return { ...p, x: spot ? spot[0] : (p.x ?? 0), y: spot ? spot[1] : (p.y ?? 0) };
	});
	const resolve = (ref: string | [number, number]): string | [number, number] => {
		if (typeof ref !== 'string' || ids.has(ref)) return ref;
		if (ref === 'fence.corner' || ref === 'fence.inside') {
			if (!fence) ctx.addIssue({ code: 'custom', message: `コート図: ${ref} を使うには fence を書く` });
			return fence ? fence.targets[ref === 'fence.corner' ? 'corner' : 'inside'] : [0, 0];
		}
		// 受ける人の手前に落とす（例: A.front）
		const front = ref.match(/^(\w+)\.front$/);
		if (front && ids.has(front[1])) {
			const p = players.find((q) => q.id === front[1])!;
			return landInFront(p.x, p.y);
		}
		const spot = spotPoint(ref);
		if (!spot) ctx.addIssue({ code: 'custom', message: `コート図: "${ref}" は人の ID でも位置の名前でもない` });
		return spot ?? [0, 0];
	};
	// ラリー: 1往復ぶんの手を、球出しから始めて rally 回往復させる（球出し → 返球 → … の 2×rally+1 手）
	let base = d.shots;
	if (typeof d.rally === 'number') {
		const steps = [...new Set(d.shots.map((s) => s.n ?? 0))].sort((a, b) => a - b);
		const cycle = steps.map((n) => d.shots.filter((s) => (s.n ?? 0) === n));
		base = Array.from({ length: 2 * d.rally + 1 }, (_, k) =>
			cycle[k % cycle.length].map((s) =>
				k === 0 && s.type !== 'move' ? { ...s, n: 1, feed: true, afterBounce: true, label: undefined } : { ...s, n: k + 1 },
			),
		).flat();
	}
	// 基本の位置と受けるときの位置（sidestep）の行き来を、打つ順から動き（move）として足す
	const shots = [...base];
	const hits = base.filter((s) => s.type !== 'move').sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
	for (const p of d.players) {
		if (!p.sidestep) continue;
		const side = spotPoint(p.sidestep);
		if (!side) {
			ctx.addIssue({ code: 'custom', message: `コート図: sidestep "${p.sidestep}" は位置の名前ではない` });
			continue;
		}
		const first = hits.find((s) => s.to === p.id || s.from === p.id);
		let atSide = !!first && first.from === p.id && first.to !== p.id;
		if (atSide) {
			const q = players.find((q) => q.id === p.id)!;
			[q.x, q.y] = side;
		}
		const base = p.at ?? ([p.x ?? 0, p.y ?? 0] as [number, number]);
		for (const s of hits) {
			if (s.to === p.id && !atSide) {
				shots.push({ from: p.id, to: p.sidestep, type: 'move', n: s.n, feed: false, afterBounce: false, fall: false });
				atSide = true;
			} else if (s.from === p.id && atSide) {
				shots.push({ from: p.id, to: base, type: 'move', n: s.n, feed: false, afterBounce: false, fall: false });
				atSide = false;
			}
		}
	}
	// スピードアップやカウンター（パンチボレー）を受けて打つリセットは、腰より上の球を取る（書き手と決めた規則）。hit を書いたときはそのまま
	const ordered = [...shots].filter((s) => s.type !== 'move').sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
	for (const s of ordered) {
		if ((s.type !== 'reset' && s.type !== 'resetTrap') || s.hit) continue;
		const before = ordered.filter((t) => (t.n ?? 0) < (s.n ?? 0) && t.to === s.from).pop();
		if (before && (before.type === 'speedup' || before.type === 'punch')) s.hit = 'waist';
	}
	return {
		...d,
		players,
		shots: shots.map((s) => ({ ...s, from: resolve(s.from), to: resolve(s.to) })),
		fences: [...(fence?.segments ?? []), ...d.fences],
	};
});
export type Diagram = z.infer<typeof diagram>;

const variant = z.object({
	/** URLで使う派生形キー（例: rst003.ankle の ankle） */
	key: z.string().regex(/^[a-z0-9]+$/),
	name: z.string(),
	/** 図（アニメーション）はこの派生形で描いている。派生形があるドリルでは、ちょうど1つに付ける */
	default: z.boolean().default(false),
	/** 指定した項目だけ本体の内容を上書きする */
	setup: z.string().optional(),
	feed: z.string().optional(),
	steps: z.array(z.string()).optional(),
	points: z.array(z.string()).max(5).optional(),
	diagram: diagram.optional(),
	note: z.string().optional(),
});

const drill = z.object({
	/** ドリルID: カテゴリ3文字 + 3桁（例: dnk001） */
	id: z.string().regex(/^[a-z0-9]{3}\d{3}$/),
	category: z.enum(categoryCodes),
	/**
	 * サブカテゴリ: メインのカテゴリ（ID の頭・フォルダ・サイドバーの場所）のほかに、このドリルで練習するカテゴリ（いくつでも）。
	 * ドリルのページの印、ビルダーのカテゴリの絞り込み、ドリル一覧の「ほかのカテゴリのドリル」に出す。サイドバーには出さない（書き手と決めた）
	 */
	subCategories: z.array(z.enum(categoryCodes)).default([]),
	/** 別名・旧称（検索用） */
	aliases: z.array(z.string()).default([]),
	/** 場面: このドリルが想定する試合の場面（何が起きていて、何が困るか）。目的の前に出す */
	scene: z.string(),
	purpose: z.string(),
	/** 練習の目的（見出し）: 同じ場面のドリルの中で、この練習で特に取り組むこと（1文）。purpose は「その場面でやりたいこと」 */
	focus: z.string(),
	setup: z.string(),
	feed: z.string(),
	steps: z.array(z.string()).min(1),
	points: z.array(z.string()).max(5).default([]),
	diagram: diagram.optional(),
	variants: z.array(variant).default([]),
	/** ビルダーでこのドリルを足したときの初期値（何分×何セット）。その日の実際の時間はメニューの URL が持つ。ドリルのページには出さない */
	builderDefault: z.object({ min: z.number(), sets: z.number().int() }).optional(),
	notes: z.string().optional(),
	/**
	 * 関連リンク: このドリルの元になった動画や投稿（YouTube・Instagram など）。
	 * 練習する人が、サイトの説明だけでは分かりにくいときに見て理解を深めるためのもの。公開されているものだけを載せる
	 */
	links: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
}).refine((d) => !d.subCategories.includes(d.category) && new Set(d.subCategories).size === d.subCategories.length, {
	message: 'サブカテゴリにはメインのカテゴリと同じものや、同じものを2回書かない',
	path: ['subCategories'],
}).refine((d) => d.variants.length === 0 || d.variants.filter((v) => v.default).length === 1, {
	message: '派生形があるときは、図で描いている派生形（default: true）をちょうど1つ決める',
	path: ['variants'],
});

export type Drill = z.infer<typeof drill>;

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({ extend: z.object({ drill: drill.optional() }) }),
	}),
};
