/**
 * 「今回の派生形」の1行を出す。ドリルの中身（DrillDetail）にある空の .variant-now に、
 * 選んだ派生形の名前と説明を入れて見せる。選んでいない・見つからないときは出さない。
 * - 練習メニューの画面: 行を開いたときに、メニューで選んだ派生形を渡す
 * - ドリルのページ: URL の ?variant=fh を読む（メニューの「ページで見る」から渡す）
 */
export function showVariant(root: ParentNode, key: string | undefined | null) {
	// 派生形の切り替えボタンがあるドリルは、ボタンで選んだ形にする（「今回」の1行は出さない。ボタンで分かるため）
	const sw = root.querySelector<HTMLElement>('[data-variant-switch]');
	if (sw) {
		setupVariantSwitch(sw, root, key);
		return;
	}
	const el = root.querySelector<HTMLElement>('.variant-now');
	if (!el || !key) return;
	const variants: Record<string, { name: string; note?: string; default?: boolean }> = JSON.parse(el.dataset.variants ?? '{}');
	const v = variants[key.toLowerCase()];
	// 図で描いている派生形なら出さない（メニューにも派生形を書かない）
	if (!v || v.default) return;
	el.querySelector('.variant-now-name')!.textContent = `今回：${v.name}`;
	// 図がどの派生形で描いてあるかを添える
	const shown = Object.values(variants).find((x) => x.default);
	const diff = shown ? `（図は${shown.name}で描いています）` : '';
	el.querySelector('.variant-now-note')!.textContent = `${v.note ?? ''}${diff}`;
	el.hidden = false;
}

/**
 * 派生形の切り替え（DrillDetail の .variant-switch）。ボタンを押すと、その派生形の図と球出しの文に切り替える。
 * ドリルのページ（root が document）では、URL の ?variant= も書き換える（そのまま共有すると、相手も同じ派生形で開く）
 */
function setupVariantSwitch(sw: HTMLElement, root: ParentNode, key: string | undefined | null) {
	const tabs = [...sw.querySelectorAll<HTMLButtonElement>('.vs-tabs [data-v]')];
	const panels = [...sw.querySelectorAll<HTMLElement>('.vs-panel')];
	const feedEl = root.querySelector<HTMLElement>('[data-variant-feed]');
	const feeds: Record<string, string> = feedEl ? JSON.parse(feedEl.dataset.variantFeed ?? '{}') : {};
	const choose = (k: string, updateUrl: boolean) => {
		if (!tabs.some((t) => t.dataset.v === k)) return;
		tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.v === k)));
		panels.forEach((p) => p.classList.toggle('off', p.dataset.v !== k));
		if (feedEl && feeds[k]) feedEl.textContent = feeds[k];
		if (updateUrl && root === document) {
			const u = new URL(location.href);
			if (k === sw.dataset.default) u.searchParams.delete('variant');
			else u.searchParams.set('variant', k);
			history.replaceState(null, '', u);
		}
	};
	if (!sw.dataset.ready) {
		sw.dataset.ready = '';
		tabs.forEach((t) => t.addEventListener('click', () => choose(t.dataset.v!, true)));
	}
	if (key) choose(key.toLowerCase(), false);
}
