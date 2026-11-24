import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { categoryCodes } from './config/categories';

const variant = z.object({
	/** URLで使う派生形キー（例: rst003.ankle の ankle） */
	key: z.string().regex(/^[a-z0-9]+$/),
	name: z.string(),
	/** 指定した項目だけ本体の内容を上書きする */
	setup: z.string().optional(),
	feed: z.string().optional(),
	steps: z.array(z.string()).optional(),
	points: z.array(z.string()).max(3).optional(),
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
	diagram: z.string().optional(),
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
