/**
 * 「今回の派生形」の1行を出す。ドリルの中身（DrillDetail）にある空の .variant-now に、
 * 選んだ派生形の名前と説明を入れて見せる。選んでいない・見つからないときは出さない。
 * - 練習メニューの画面: 行を開いたときに、メニューで選んだ派生形を渡す
 * - ドリルのページ: URL の ?variant=fh を読む（メニューの「ページで見る」から渡す）
 */
export function showVariant(root: ParentNode, key: string | undefined | null) {
	const el = root.querySelector<HTMLElement>('.variant-now');
	if (!el || !key) return;
	const variants: Record<string, { name: string; note?: string }> = JSON.parse(el.dataset.variants ?? '{}');
	const v = variants[key.toLowerCase()];
	if (!v) return;
	el.querySelector('.variant-now-name')!.textContent = `今回：${v.name}`;
	el.querySelector('.variant-now-note')!.textContent = v.note ?? '';
	el.hidden = false;
}
