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
	const dragFrom = useRef<number | null>(null);
	const [dragOver, setDragOver] = useState<number | null>(null);

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

	const addDrill = (d: CatalogDrill) =>
		add({ kind: 'drill', id: d.id, min: d.builderDefault?.min ?? 2, sets: d.builderDefault?.sets ?? 5 });

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
							<span class="title">{d.title}</span>
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

				<ol class="rows">
					{state.rows.length === 0 && <li class="empty">左のドリルの「＋」で、メニューに足します。</li>}
					{state.rows.map((r, i) => (
						<li
							key={r.uid}
							class={`row kind-${r.kind}${dragOver === i ? ' drag-over' : ''}`}
							draggable
							onDragStart={(e) => {
								dragFrom.current = i;
								e.dataTransfer?.setData('text/plain', String(i));
							}}
							onDragOver={(e) => {
								e.preventDefault();
								setDragOver(i);
							}}
							onDragLeave={() => setDragOver((x) => (x === i ? null : x))}
							onDrop={(e) => {
								e.preventDefault();
								if (dragFrom.current !== null) move(dragFrom.current, i);
								dragFrom.current = null;
								setDragOver(null);
							}}
							onDragEnd={() => setDragOver(null)}
						>
							<span class="handle" title="ドラッグで並べ替え">
								≡
							</span>
							<RowBody row={r} byId={byId} patch={patch} headingMin={headingMinutes.get(r.uid)} />
							<span class="row-actions">
								<button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} title="上へ">
									↑
								</button>
								<button type="button" onClick={() => move(i, i + 1)} disabled={i === state.rows.length - 1} title="下へ">
									↓
								</button>
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
					value={row.variant ?? ''}
					onChange={(e) => patch(row.uid, { variant: (e.target as HTMLSelectElement).value || undefined })}
				>
					<option value="">派生形なし</option>
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
