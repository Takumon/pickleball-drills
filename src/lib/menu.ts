/**
 * 練習メニューの URL 形式（メニュー表示とビルダーで共通）。
 *
 *   /?v=1&theme=テーマ&total=120&m=h:リセット,rst001:2x5,drp001.fh:2x5,b:5,x60:のこりゲーム
 *
 * - v: 形式の版（今は 1）。theme: テーマ（任意）。total: 練習全体の時間（分、任意）。
 * - m: メニューの中身。カンマ区切りの項目の列。
 *   - `drp001:2x5`   ドリル（2分×5セット）。派生形は `drp001.fh:2x5`
 *   - `h:見出し`      ブロックの見出し
 *   - `b:5`          休憩（分）
 *   - `x60:本文` / `x:本文`  自由記述（分数は任意）
 * クエリの名前は大文字・小文字を区別せずに読む。
 */

export type MenuItem =
	| { kind: 'drill'; id: string; variant?: string; min: number; sets: number }
	| { kind: 'heading'; text: string }
	| { kind: 'break'; min: number }
	| { kind: 'note'; text: string; min?: number };

export interface Menu {
	theme?: string;
	total?: number;
	items: MenuItem[];
}

export const MENU_VERSION = 1;

/** 項目1つを文字列にする（URL のエンコードは呼び出し側の URLSearchParams に任せる） */
function itemToToken(it: MenuItem): string {
	switch (it.kind) {
		case 'drill':
			return `${it.id}${it.variant ? `.${it.variant}` : ''}:${trim(it.min)}x${it.sets}`;
		case 'heading':
			return `h:${clean(it.text)}`;
		case 'break':
			return `b:${trim(it.min)}`;
		case 'note':
			return `x${it.min ? trim(it.min) : ''}:${clean(it.text)}`;
	}
}

/** 区切りのカンマが本文に入ると読めなくなるので、全角の読点に置き換える */
const clean = (s: string) => s.replace(/,/g, '、').trim();
const trim = (n: number) => String(Math.round(n * 10) / 10);

function tokenToItem(token: string): MenuItem | undefined {
	const t = token.trim();
	if (!t) return undefined;
	let m: RegExpMatchArray | null;
	if ((m = t.match(/^h:(.*)$/is))) return { kind: 'heading', text: m[1] };
	if ((m = t.match(/^b:(\d+(?:\.\d+)?)$/i))) return { kind: 'break', min: Number(m[1]) };
	if ((m = t.match(/^x(\d+(?:\.\d+)?)?:(.*)$/is))) return { kind: 'note', text: m[2], min: m[1] ? Number(m[1]) : undefined };
	if ((m = t.match(/^([a-z0-9]{3}\d{3})(?:\.([a-z0-9]+))?:(\d+(?:\.\d+)?)x(\d+)$/i)))
		return { kind: 'drill', id: m[1].toLowerCase(), variant: m[2]?.toLowerCase(), min: Number(m[3]), sets: Number(m[4]) };
	return undefined;
}

/** クエリ文字列（location.search）からメニューを読む。m がなければ undefined */
export function parseMenu(search: string): Menu | undefined {
	const raw = new URLSearchParams(search);
	const q = new Map<string, string>();
	raw.forEach((v, k) => q.set(k.toLowerCase(), v));
	const m = q.get('m');
	if (m === undefined) return undefined;
	const items = m
		.split(',')
		.map(tokenToItem)
		.filter((x): x is MenuItem => !!x);
	const total = Number(q.get('total'));
	return { theme: q.get('theme') || undefined, total: total > 0 ? total : undefined, items };
}

/** メニューをクエリ文字列（先頭の ? なし）にする */
export function menuToQuery(menu: Menu): string {
	const p = new URLSearchParams();
	p.set('v', String(MENU_VERSION));
	if (menu.theme?.trim()) p.set('theme', menu.theme.trim());
	if (menu.total) p.set('total', String(menu.total));
	p.set('m', menu.items.map(itemToToken).join(','));
	// URLSearchParams はカンマとコロンもエンコードするので、読みやすさのために戻す
	return p.toString().replace(/%2C/gi, ',').replace(/%3A/gi, ':');
}

/** 項目の分数（ドリルは 分×セット）。見出しは 0 */
export function itemMinutes(it: MenuItem): number {
	if (it.kind === 'drill') return it.min * it.sets;
	if (it.kind === 'break') return it.min;
	if (it.kind === 'note') return it.min ?? 0;
	return 0;
}

/** 見出しごとのまとまり（最初の見出しより前の項目は、見出しなしのまとまり） */
export function blocks(menu: Menu): { heading?: string; items: MenuItem[]; minutes: number }[] {
	const out: { heading?: string; items: MenuItem[]; minutes: number }[] = [];
	for (const it of menu.items) {
		if (it.kind === 'heading') out.push({ heading: it.text, items: [], minutes: 0 });
		else {
			if (out.length === 0) out.push({ items: [], minutes: 0 });
			const b = out[out.length - 1];
			b.items.push(it);
			b.minutes += itemMinutes(it);
		}
	}
	return out;
}

export const totalMinutes = (menu: Menu) => menu.items.reduce((s, it) => s + itemMinutes(it), 0);

/** ドリルの一覧データ（/drills.json）の1件 */
export interface CatalogDrill {
	id: string;
	title: string;
	category: string;
	categoryLabel: string;
	order: number;
	url: string;
	fragment: string;
	variants: { key: string; name: string }[];
	time?: { min: number; sets: number };
}

/** 分数の表示（例: 2 → "2分"、1.5 → "1.5分"） */
export const fmtMin = (n: number) => `${trim(n)}分`;
