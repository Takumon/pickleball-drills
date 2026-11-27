/** ドリルのカテゴリ定義。コードはドリルID（例: dnk001）の先頭3文字。並び順はサイドバーの順。 */
export const categories = [
	{ code: 'dnk', label: 'ディンク', en: 'Dink' },
	{ code: 'drp', label: 'ドロップ', en: 'Drop' },
	{ code: 'rst', label: 'リセット', en: 'Reset' },
	{ code: 'spd', label: 'スピードアップ・ファイヤーファイト', en: 'Speed-up / Firefight' },
	{ code: 'vly', label: 'ボレー', en: 'Volley' },
	{ code: 'vdk', label: 'ボレーディンク', en: 'Volley dink' },
	{ code: '4th', label: '4thショット', en: '4th shot' },
	{ code: 'trn', label: 'トランジション', en: 'Transition' },
	{ code: 'lob', label: 'ロブ・スマッシュ', en: 'Lob / Overhead' },
	{ code: 'drv', label: 'ストローク', en: 'Drive' },
	{ code: 'rtn', label: 'リターン', en: 'Return' },
	{ code: 'ftw', label: 'フットワーク', en: 'Footwork' },
	{ code: 'gam', label: 'ゲーム形式', en: 'Game-based' },
] as const;

export type CategoryCode = (typeof categories)[number]['code'];
export const categoryCodes = categories.map((c) => c.code) as [CategoryCode, ...CategoryCode[]];
