/**
 * もしもの場面の見せ方（DrillDetail.astro の .situations）。案を見比べ中（書き手の希望 2026-11-28）。
 * data-sit-ui: now 今の形 / a 枠の中で切り替える / b 枠の中に小さく付ける / c 隅の小窓 / d 閉じた欄。
 * 開発サーバーでは、セレクトボックス（.sit-ui-select）で切り替え、URL の ?sit= とこの端末に覚えておく
 */
const KEY = 'sit-ui';
export function setupSituations(root: ParentNode) {
	root.querySelectorAll<HTMLElement>('[data-situations]').forEach((box) => {
		const field = box.parentElement;
		const details = box.querySelector<HTMLDetailsElement>('.sit-details');
		const sel = box.querySelector<HTMLSelectElement>('.sit-ui-select');
		const items = [...box.querySelectorAll<HTMLElement>('.situation')];
		const closeA = () => {
			box.classList.remove('on');
			items.forEach((it) => it.classList.remove('on'));
			field?.classList.remove('sit-main-off');
		};
		const apply = (ui: string) => {
			box.dataset.sitUi = ui;
			closeA();
			box.classList.remove('big');
			if (details) details.open = ui !== 'd';
			// 案C では、切り替えのセレクトボックスを図の上（枠の外）に出す
			if (sel) {
				if (ui === 'c') {
					sel.classList.add('sit-ui-float');
					field?.prepend(sel);
				} else if (sel.parentElement !== box) {
					sel.classList.remove('sit-ui-float');
					box.prepend(sel);
				}
			}
		};
		if (sel) {
			let start = new URLSearchParams(location.search).get('sit');
			try {
				start ??= localStorage.getItem(KEY);
			} catch {}
			if (start && [...sel.options].some((o) => o.value === start)) sel.value = start;
			else sel.value = box.dataset.sitUi ?? 'b';
			apply(sel.value);
			sel.addEventListener('change', () => {
				apply(sel.value);
				try {
					localStorage.setItem(KEY, sel.value);
				} catch {}
				const u = new URL(location.href);
				u.searchParams.set('sit', sel.value);
				history.replaceState(null, '', u);
			});
		}
		// 案A: ボタンで、同じ枠の中の図をもしもの場面に切り替える。「メインに戻る」で戻す
		box.querySelectorAll<HTMLButtonElement>('.sit-open').forEach((b) =>
			b.addEventListener('click', () => {
				box.classList.add('on');
				items.forEach((it) => it.classList.toggle('on', it.dataset.i === b.dataset.i));
				field?.classList.add('sit-main-off');
			}),
		);
		box.querySelectorAll<HTMLButtonElement>('.sit-back').forEach((b) => b.addEventListener('click', closeA));
		// 案C: 小窓を押すと大きくなり、もう一度押すと戻る（図の中の再生ボタンは除く）
		box.addEventListener('click', (e) => {
			if (box.dataset.sitUi !== 'c') return;
			if ((e.target as Element).closest('button, select, [data-step-dot]')) return;
			box.classList.toggle('big');
		});
	});
}
