/**
 * 練習メニューのビルダー（PC向け）。左でドリルを探して足し、右でメニューを組む。
 * 保存の機能は持たず、URL（メニュー表示のページ）が保存の代わり。作業中の内容だけはブラウザに残す。
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
	drillName,
	fmtMin,
	itemMinutes,
	menuToQuery,
	menuToText,
	parseMenu,
	totalMinutes,
	type CatalogDrill,
	type Menu,
	type MenuItem,
} from '../../lib/menu';

type Row = MenuItem & { uid: number };
interface State {
	theme: string;
	total?: number;
	rows: Row[];
}

const STORAGE_KEY = 'pickleball-drills:builder';
let nextUid = 1;
const withUid = (it: MenuItem): Row => ({ ...it, uid: nextUid++ });
const toMenu = (s: State): Menu => ({
	theme: s.theme,
	total: s.total,
	items: s.rows.map(({ uid: _uid, ...it }) => it as MenuItem),
});
const fromMenu = (m: Menu): State => ({ theme: m.theme ?? '', total: m.total, rows: m.items.map(withUid) });

function loadInitial(): State {
	// URL にメニューがあれば、それを読み込む（メニュー表示の「このメニューを編集」から来たとき）
	const fromUrl = parseMenu(location.search);
	if (fromUrl) {
		// 読み込んだら URL からメニューを外す（そのまま再読み込みすると、編集した内容が URL の内容に戻ってしまうため）
		history.replaceState(null, '', location.pathname);
		return fromMenu(fromUrl);
	}
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const m = parseMenu(saved);
			if (m) return fromMenu(m);
		}
	} catch {
		/* ブラウザに保存できない環境では、空から始める */
	}
	return { theme: '', rows: [] };
}

export default function Builder({ base }: { base: string }) {
	const [catalog, setCatalog] = useState<CatalogDrill[]>([]);
	const [state, setState] = useState<State>(loadInitial);
	const [category, setCategory] = useState('');
	const [query, setQuery] = useState('');
	const [notice, setNotice] = useState('');
	const [importText, setImportText] = useState('');
	const [confirmClear, setConfirmClear] = useState(false);
	// 並べ替え: 行の「≡」を指やマウスで押さえて上下に動かす（Pointer Events。スマホの指でも動く）
	const listRef = useRef<HTMLOListElement>(null);
	const [drag, setDrag] = useState<{ from: number; dy: number; to: number } | null>(null);
	const dragInfo = useRef<{ from: number; startPageY: number; mids: number[]; clientY: number; raf: number } | null>(null);

	useEffect(() => {
		fetch(`${base}/drills.json`)
			.then((r) => r.json())
			.then(setCatalog);
	}, []);

	const byId = useMemo(() => new Map(catalog.map((d) => [d.id, d])), [catalog]);
	const menu = toMenu(state);
	const query$ = menuToQuery(menu);
	const viewUrl = `${location.origin}${base}/?${query$}`;
	const sum = totalMinutes(menu);

	// 作業中の内容をブラウザに残す
	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, `?${query$}`);
		} catch {
			/* 保存できなくても続ける */
		}
	}, [query$]);

	const flash = (msg: string) => {
		setNotice(msg);
		window.setTimeout(() => setNotice(''), 2500);
	};
	const update = (fn: (rows: Row[]) => Row[]) => setState((s) => ({ ...s, rows: fn(s.rows) }));
	const add = (it: MenuItem) => update((rows) => [...rows, withUid(it)]);
	const patch = (uid: number, p: Partial<MenuItem>) =>
		update((rows) => rows.map((r) => (r.uid === uid ? ({ ...r, ...p } as Row) : r)));
	const remove = (uid: number) => update((rows) => rows.filter((r) => r.uid !== uid));
	const move = (from: number, to: number) =>
		update((rows) => {
			if (to < 0 || to >= rows.length || from === to) return rows;
			const next = rows.slice();
			const [r] = next.splice(from, 1);
			next.splice(to, 0, r);
			return next;
		});

	/** ドリルを足す。派生形を指定したときは、それを選んだ状態で足す（図の派生形なら指定しないのと同じ） */
	const addDrill = (d: CatalogDrill, variantKey?: string) =>
		add({
			kind: 'drill',
			id: d.id,
			variant: d.variants.find((v) => v.key === variantKey && !v.default)?.key,
			min: d.builderDefault?.min ?? 2,
			sets: d.builderDefault?.sets ?? 5,
		});

	const copy = async (text: string, msg: string) => {
		try {
			await navigator.clipboard.writeText(text);
			flash(msg);
		} catch {
			flash('コピーできませんでした');
		}
	};

	const importMenu = () => {
		const t = importText.trim();
		const q = t.includes('?') ? t.slice(t.indexOf('?')) : t;
		const m = parseMenu(q);
		if (!m) return flash('メニューのURLとして読めませんでした');
		setState(fromMenu(m));
		setImportText('');
		flash('読み込みました');
	};

	const filtered = catalog.filter(
		(d) =>
			(!category || d.category === category) &&
			(!query.trim() || `${d.title} ${d.id}`.toLowerCase().includes(query.trim().toLowerCase())),
	);
	const categoriesInCatalog = [...new Map(catalog.map((d) => [d.category, d.categoryLabel])).entries()];

	// 見出しごとの合計（見出しの行に出す）
	const headingMinutes = new Map<number, number>();
	{
		let current: number | undefined;
		for (const r of state.rows) {
			if (r.kind === 'heading') {
				current = r.uid;
				headingMinutes.set(r.uid, 0);
			} else if (current !== undefined) headingMinutes.set(current, (headingMinutes.get(current) ?? 0) + itemMinutes(r));
		}
	}

	const remain = state.total ? state.total - sum : undefined;

	/** 動かしている行の位置と、離したときに入る位置を計算する */
	const updateDrag = () => {
		const info = dragInfo.current;
		if (!info) return;
		const pageY = info.clientY + window.scrollY;
		// 動かしている行を除いた行のうち、真ん中が指より上にある行の数 = 入る位置
		const to = info.mids.filter((m, k) => k !== info.from && m < pageY).length;
		setDrag({ from: info.from, dy: pageY - info.startPageY, to });
	};
	const startDrag = (i: number, e: PointerEvent) => {
		e.preventDefault();
		// 指がつまみの外に出ても動きを受け取り続ける（取れない環境でも並べ替えは続ける）
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			/* 続ける */
		}
		const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > li.row') ?? [])];
		const mids = rows.map((el) => {
			const r = el.getBoundingClientRect();
			return r.top + window.scrollY + r.height / 2;
		});
		const info = { from: i, startPageY: e.clientY + window.scrollY, mids, clientY: e.clientY, raf: 0 };
		dragInfo.current = info;
		// 画面の上端・下端の近くでは、自動でスクロールする（長いメニューでも遠くまで運べる）
		const EDGE = 70;
		const tick = () => {
			const cur = dragInfo.current;
			if (!cur) return;
			if (cur.clientY < EDGE) window.scrollBy(0, -8);
			else if (cur.clientY > window.innerHeight - EDGE) window.scrollBy(0, 8);
			updateDrag();
			cur.raf = requestAnimationFrame(tick);
		};
		info.raf = requestAnimationFrame(tick);
		updateDrag();
	};
	const moveDrag = (e: PointerEvent) => {
		if (!dragInfo.current) return;
		dragInfo.current.clientY = e.clientY;
	};
	const endDrag = () => {
		const info = dragInfo.current;
		if (!info) return;
		cancelAnimationFrame(info.raf);
		dragInfo.current = null;
		setDrag((d) => {
			if (d && d.to !== d.from) move(d.from, d.to);
			return null;
		});
	};
	/** 離したときに入る位置の目印（その行の上に線を引く。最後なら最後の行の下） */
	const dropMark = (i: number): string => {
		if (!drag || drag.to === drag.from) return '';
		const others = state.rows.map((_, k) => k).filter((k) => k !== drag.from);
		if (drag.to < others.length) return others[drag.to] === i ? ' drop-before' : '';
		return others[others.length - 1] === i ? ' drop-after' : '';
	};

	return (
		<div class="builder">
			<section class="catalog">
				<h2>ドリルを探す</h2>
				<div class="filters">
					<select value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}>
						<option value="">すべてのカテゴリ</option>
						{categoriesInCatalog.map(([code, label]) => (
							<option value={code}>{label}</option>
						))}
					</select>
					<input
						type="search"
						placeholder="名前やIDで探す"
						value={query}
						onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
					/>
				</div>
				<ul class="catalog-list">
					{filtered.map((d) => (
						<li>
							<button type="button" class="add" onClick={() => addDrill(d)} title="メニューに足す">
								＋
							</button>
							<span class="title">
								{d.title}
								{/* 派生形があるドリルは、派生形を選んで足せる */}
								{d.variants.length > 0 && (
									<span class="variant-adds">
										{d.variants.map((v) => (
											<button type="button" class="variant-add" onClick={() => addDrill(d, v.key)} title={`${v.name}で足す`}>
												＋{v.name}
											</button>
										))}
									</span>
								)}
							</span>
							<span class="meta">
								{d.builderDefault ? `${fmtMin(d.builderDefault.min)}×${d.builderDefault.sets}` : ''}
								<a href={d.url} target="_blank" rel="noopener" title="ドリルのページを開く">
									↗
								</a>
							</span>
						</li>
					))}
					{catalog.length > 0 && filtered.length === 0 && <li class="empty">見つかりません</li>}
				</ul>
			</section>

			<section class="menu">
				<div class="menu-head">
					<label>
						テーマ
						<input
							type="text"
							value={state.theme}
							placeholder="（任意）"
							onInput={(e) => setState((s) => ({ ...s, theme: (e.target as HTMLInputElement).value }))}
						/>
					</label>
					<label class="total">
						練習全体
						<input
							type="number"
							min="0"
							value={state.total ?? ''}
							onInput={(e) => {
								const v = Number((e.target as HTMLInputElement).value);
								setState((s) => ({ ...s, total: v > 0 ? v : undefined }));
							}}
						/>
						分
					</label>
					<p class="sum">
						合計 <strong>{fmtMin(sum)}</strong>
						{remain !== undefined && (
							<span class={remain < 0 ? 'over' : 'remain'}>
								{remain < 0 ? `（${fmtMin(-remain)} 超過）` : `（残り ${fmtMin(remain)}）`}
							</span>
						)}
					</p>
				</div>

				<ol class="rows" ref={listRef}>
					{state.rows.length === 0 && <li class="empty">左のドリルの「＋」で、メニューに足します。</li>}
					{state.rows.map((r, i) => (
						<li
							key={r.uid}
							class={`row kind-${r.kind}${drag?.from === i ? ' dragging' : ''}${dropMark(i)}`}
							style={drag?.from === i ? { transform: `translateY(${drag.dy}px)` } : undefined}
						>
							<span
								class="handle"
								title="押さえたまま上下に動かして並べ替え"
								onPointerDown={(e) => startDrag(i, e as unknown as PointerEvent)}
								onPointerMove={(e) => moveDrag(e as unknown as PointerEvent)}
								onPointerUp={endDrag}
								onPointerCancel={endDrag}
							>
								≡
							</span>
							<RowBody row={r} byId={byId} patch={patch} headingMin={headingMinutes.get(r.uid)} />
							<span class="row-actions">
								<button type="button" onClick={() => remove(r.uid)} title="消す">
									×
								</button>
							</span>
						</li>
					))}
				</ol>

				<div class="add-buttons">
					<button type="button" onClick={() => add({ kind: 'heading', text: '' })}>
						＋見出し
					</button>
					<button type="button" onClick={() => add({ kind: 'break', min: 5 })}>
						＋休憩
					</button>
					<button type="button" onClick={() => add({ kind: 'note', text: '' })}>
						＋自由記述
					</button>
				</div>

				<div class="actions">
					<button type="button" class="primary" onClick={() => copy(viewUrl, 'URLをコピーしました')}>
						URLをコピー
					</button>
					<button type="button" onClick={() => copy(menuToText(menu, byId, viewUrl), 'チャット用の文章をコピーしました')}>
						チャット用の文章をコピー
					</button>
					<a class="button" href={viewUrl} target="_blank" rel="noopener">
						プレビュー ↗
					</a>
					<button
						type="button"
						class={confirmClear ? 'danger' : ''}
						onClick={() => {
							if (!confirmClear) {
								setConfirmClear(true);
								window.setTimeout(() => setConfirmClear(false), 3000);
								return;
							}
							setState({ theme: '', rows: [] });
							setConfirmClear(false);
							flash('消しました');
						}}
					>
						{confirmClear ? 'もう一度押すと全部消す' : '全部消す'}
					</button>
					{notice && <span class="notice">{notice}</span>}
				</div>

				<details class="import">
					<summary>メニューのURLを読み込む</summary>
					<p>前に作ったメニューのURLを貼ると、その内容を読み込んで直せます（今の内容は置き換わります）。</p>
					<div class="import-row">
						<input
							type="text"
							value={importText}
							placeholder="https://…/pickleball-drills/?v=1&m=…"
							onInput={(e) => setImportText((e.target as HTMLInputElement).value)}
						/>
						<button type="button" onClick={importMenu}>
							読み込む
						</button>
					</div>
				</details>
			</section>
		</div>
	);
}

function RowBody({
	row,
	byId,
	patch,
	headingMin,
}: {
	row: Row;
	byId: Map<string, CatalogDrill>;
	patch: (uid: number, p: Partial<MenuItem>) => void;
	headingMin?: number;
}) {
	const num = (v: string) => Math.max(0, Number(v) || 0);
	if (row.kind === 'heading')
		return (
			<span class="body">
				<span class="tag">見出し</span>
				<input
					type="text"
					class="grow"
					value={row.text}
					placeholder="例：リセット"
					onInput={(e) => patch(row.uid, { text: (e.target as HTMLInputElement).value })}
				/>
				<span class="min">{headingMin ? fmtMin(headingMin) : ''}</span>
			</span>
		);
	if (row.kind === 'break')
		return (
			<span class="body">
				<span class="tag">休憩</span>
				<input
					type="number"
					min="0"
					value={row.min}
					onInput={(e) => patch(row.uid, { min: num((e.target as HTMLInputElement).value) })}
				/>
				分
			</span>
		);
	if (row.kind === 'note')
		return (
			<span class="body">
				<span class="tag">自由記述</span>
				<input
					type="text"
					class="grow"
					value={row.text}
					placeholder="例：のこりゲーム"
					onInput={(e) => patch(row.uid, { text: (e.target as HTMLInputElement).value })}
				/>
				<input
					type="number"
					min="0"
					value={row.min ?? ''}
					placeholder="任意"
					onInput={(e) => {
						const v = num((e.target as HTMLInputElement).value);
						patch(row.uid, { min: v > 0 ? v : undefined });
					}}
				/>
				分
			</span>
		);
	if (row.kind !== 'drill') return null;
	const d = byId.get(row.id);
	return (
		<span class="body">
			<span class="grow drill-name">{drillName(row, byId)}</span>
			{d && d.variants.length > 0 && (
				<select
					// 指定がないときは、図で描いている派生形（default）を選んでいる扱いにする。default を選んだら URL には書かない
					value={row.variant ?? d.variants.find((v) => v.default)?.key ?? ''}
					onChange={(e) => {
						const key = (e.target as HTMLSelectElement).value;
						patch(row.uid, { variant: d.variants.find((v) => v.key === key)?.default ? undefined : key });
					}}
				>
					{d.variants.map((v) => (
						<option value={v.key}>{v.name}</option>
					))}
				</select>
			)}
			<input
				type="number"
				min="0"
				step="0.5"
				value={row.min}
				onInput={(e) => patch(row.uid, { min: num((e.target as HTMLInputElement).value) })}
			/>
			分 ×
			<input
				type="number"
				min="1"
				value={row.sets}
				onInput={(e) => patch(row.uid, { sets: Math.max(1, Math.round(num((e.target as HTMLInputElement).value))) })}
			/>
			<span class="min">{fmtMin(row.min * row.sets)}</span>
		</span>
	);
}
