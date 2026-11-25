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
				/** 打つ高さ・山の高さ（config/court.ts の heightLevels）。省略時は打球の種類で決まる。例: ロールのスピードアップは hit: underTape */
				hit: z.enum(keysOf<HeightLevel>(heightLevels)).optional(),
				peak: z.enum(keysOf<HeightLevel>(heightLevels)).optional(),
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
}).refine(
	// 番号（n）のある打球とない打球が混ざると、番号のない打球はどのコマにも入らず描かれない
	(d) => d.shots.every((s) => s.n !== undefined) || d.shots.every((s) => s.n === undefined),
	{ message: 'コート図: 打球の番号 n は、全部の打球に付けるか、全部付けないかのどちらかにする', path: ['shots'] },
).transform((d, ctx) => {
	// 名前で書いた位置（立ち位置・柵・着地点）を、config/court.ts の決まりで座標にする
	const fence = d.fence ? fenceGeometry(d.fence) : undefined;
	const ids = new Set(d.players.map((p) => p.id));
	const resolve = (ref: string | [number, number]): string | [number, number] => {
		if (typeof ref !== 'string' || ids.has(ref)) return ref;
		if (ref === 'fence.corner' || ref === 'fence.inside') {
			if (!fence) ctx.addIssue({ code: 'custom', message: `コート図: ${ref} を使うには fence を書く` });
			return fence ? fence.targets[ref === 'fence.corner' ? 'corner' : 'inside'] : [0, 0];
		}
		const spot = spotPoint(ref);
		if (!spot) ctx.addIssue({ code: 'custom', message: `コート図: "${ref}" は人の ID でも位置の名前でもない` });
		return spot ?? [0, 0];
	};
	const players = d.players.map((p) => {
		const spot = p.at ? spotPoint(p.at) : undefined;
		if (p.at && !spot) ctx.addIssue({ code: 'custom', message: `コート図: at "${p.at}" は位置の名前ではない（例: near-right-baseline）` });
		if (!spot && (p.x === undefined || p.y === undefined)) ctx.addIssue({ code: 'custom', message: `コート図: 人 ${p.id} に at か x・y を書く` });
		return { ...p, x: spot ? spot[0] : (p.x ?? 0), y: spot ? spot[1] : (p.y ?? 0) };
	});
	return {
		...d,
		players,
		shots: d.shots.map((s) => ({ ...s, from: resolve(s.from), to: resolve(s.to) })),
		fences: [...(fence?.segments ?? []), ...d.fences],
	};
});
export type Diagram = z.infer<typeof diagram>;

const variant = z.object({
	/** URLで使う派生形キー（例: rst003.ankle の ankle） */
	key: z.string().regex(/^[a-z0-9]+$/),
	name: z.string(),
	/** 指定した項目だけ本体の内容を上書きする */
	setup: z.string().optional(),
	feed: z.string().optional(),
	steps: z.array(z.string()).optional(),
	points: z.array(z.string()).max(3).optional(),
	diagram: diagram.optional(),
	note: z.string().optional(),
});

const drill = z.object({
	/** ドリルID: カテゴリ3文字 + 3桁（例: dnk001） */
	id: z.string().regex(/^[a-z0-9]{3}\d{3}$/),
	category: z.enum(categoryCodes),
	/** 別名・旧称（検索用） */
	aliases: z.array(z.string()).default([]),
	purpose: z.string(),
	setup: z.string(),
	feed: z.string(),
	steps: z.array(z.string()).min(1),
	points: z.array(z.string()).max(3).default([]),
	diagram: diagram.optional(),
	variants: z.array(variant).default([]),
	/** ビルダーでこのドリルを足したときの初期値（何分×何セット）。その日の実際の時間はメニューの URL が持つ。ドリルのページには出さない */
	builderDefault: z.object({ min: z.number(), sets: z.number().int() }).optional(),
	/** 関連ドリルのID */
	related: z.array(z.string()).default([]),
	notes: z.string().optional(),
});

export type Drill = z.infer<typeof drill>;

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({ extend: z.object({ drill: drill.optional() }) }),
	}),
};
