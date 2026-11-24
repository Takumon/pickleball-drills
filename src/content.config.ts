import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { categoryCodes } from './config/categories';
import { roleLabels, shotLabels, zoneRects, type Role, type ShotType, type ZoneName } from './config/court';

const keysOf = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];
const point = z.tuple([z.number(), z.number()]);

/** コート図（座標はフィート。src/config/court.ts 参照） */
const diagram = z.object({
	players: z
		.array(
			z.object({
				id: z.string(),
				x: z.number(),
				y: z.number(),
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
				/** 順番を示す番号 */
				n: z.number().int().optional(),
			}),
		)
		.default([]),
	zones: z.array(z.enum(keysOf<ZoneName>(zoneRects))).default([]),
	/** auto=使っている範囲だけ縦に切り出す / full=コート全体 */
	crop: z.enum(['auto', 'full']).default('auto'),
	caption: z.string().optional(),
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
	/** 標準時間（ビルダーの初期値） */
	time: z.object({ min: z.number(), sets: z.number().int() }).optional(),
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
