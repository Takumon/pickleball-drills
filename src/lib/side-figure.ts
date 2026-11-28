import { baseShot, COURT, heightLevels, WAIST_FT } from '../config/court';
/**
 * 横から見た高さの図に描く人（棒人間）を組み立てる。
 *
 * 考え方
 * - 体は「関節の点をつないだ骨組み」に「部分ごとの太さ」を付けて描く（バイオメカニクスの棒人間と同じ考え方）。
 *   骨組み: 足首・ひざ・股関節・肩の関節・ひじ・手首、背骨の上の端（首のつけ根）、頭。
 * - 寸法は身長 H に対する割合で持つ。値は Drillis & Contini（1966）の体の比率（Winter『Biomechanics and Motor Control of
 *   Human Movement』図4.1 で広く使われている値）と、日本人成人男性の平均的な厚み（胸の厚み約21〜23cm、頭の前後約19cm）から決めた。
 *   身長は日本人成人男性の平均に近い 170cm。
 * - 高さの向き（ft）と前後の向き（ft、ネットの側が +）で組み立て、最後に図の座標へ直す。図は高さの向きを k 倍に縮めているので、
 *   形がゆがまないよう、前後の向きも同じ k 倍にする。ただしパドルの面の真ん中は、ボールと同じ本当の位置に置く。
 * - 構えはピックルボールのよい姿勢: 上体はほぼ起こし、ひざを少し曲げ、パドルは体の前。低い球には、ひざをもう少し曲げ、
 *   上体を少しだけ前に倒して届かせ、それでも届かない分は腕を伸ばす（前かがみやしゃがみ込みはしない）。
 */

type P = { h: number; d: number };

const H = 5.58; // 身長（ft）≒ 170cm

/** 高さ（身長に対する割合）。Drillis & Contini */
const LEVEL = {
	ankle: 0.039,
	knee: 0.285,
	hip: 0.53, // 大転子（股関節の高さの目安）
	shoulder: 0.818, // 肩峰（肩のいちばん上）
	chin: 0.87,
};
/** 長さ（身長に対する割合）。Drillis & Contini */
const LEN = {
	thigh: 0.245,
	shank: 0.246,
	upperArm: 0.186,
	forearm: 0.146,
	handToGrip: 0.05, // 手首からパドルを握る所まで（手の長さ 0.108 の約半分）
	head: 0.13, // あご〜頭のてっぺん
	footLength: 0.152,
};
/** 厚み（前後の幅。身長に対する割合）。日本人成人男性の平均的な値から */
const DEPTH = {
	head: 0.112, // 約19cm
	neck: 0.065, // 約11cm
	chest: 0.13, // 約22cm
	waist: 0.115, // 約20cm
	pelvis: 0.125, // 約21cm（おしりを含む）
	thigh: 0.085,
	shank: 0.06,
	upperArm: 0.05,
	forearm: 0.04,
};
/** 腰（ウエスト）の高さ。パドルの向きを決める境目（身長の約 0.6） */
const WAIST = 0.6;
/** 肩の関節（腕が回る所）は、肩峰より約4cm 下、胴の上の端の少し前 */
const SHOULDER_JOINT_DROP = 0.024;
/** 首のつけ根（第7頸椎の高さの目安） */
const NECK_BASE = 0.835;

/**
 * パドル（ft）: 長さ約16インチ（グリップ約5インチ＋面約11インチ）。握る手から面の真ん中まで約9インチ、手から先まで約14.5インチ、
 * 手からグリップの端まで約1.5インチ。横から見ると面は縁から見えるので薄く描く。
 * 面とグリップの太さの比は実物どおり（グリップのほうが約2倍太い）で、見えるように実物の 1.5 倍で描く
 */
// 太さ（ft）: 実物の比（グリップ:面 ≒ 2:1）のまま、実物の 1.5 倍（書き手と決めた: 実物どおりではスマホで細すぎる）。
// 実物はグリップ 約3.4cm（周り約4.25インチ）、面の縁 約1.6cm（縁のガードを含む）。
// グリップと面は色で見分ける（グリップは黒っぽいグリップテープの色）
// 握る所: グリップの端（柄の先）の近く（書き手の指摘: 面の近くではなく下の方を握る）。手の真ん中は端から約1.5インチ。
// 手から端まで 1.5、手から面の始まりまで 3.5、面の真ん中まで 9、先まで 14.5 インチ（全長 16 インチ）
const PADDLE = { toFace: 9 / 12, toTip: 14.5 / 12, toButt: 1.5 / 12, faceLen: 11 / 12, faceThick: 0.078, gripThick: 0.168 };
/** 手（こぶし）の大きさ（前後の幅。身長に対する割合）。約9cm */
/** にぎりこぶしの大きさ（身長の割合。約9cm） */
const FIST = 0.053;
/** 腕の太さ（身長の割合）: 上腕 肩 0.056（約9.5cm）→ ひじ 0.044（約7.5cm）、前腕 ひじ 0.047（約8cm）→ 手首 0.032（約5.5cm） */
const ARM_W = { shoulder: 0.056, elbowUpper: 0.044, elbowFore: 0.047, wrist: 0.032 };

/**
 * 構え: ひざの曲げ（度）と上体の前傾（度）の、ふつうと最大。コーチの記事から（2026-11-27 に調べた）:
 * 「ひざを曲げて腰を落とし、胸はほぼ起こす」「上体の前傾はすねの前傾より大きくしない（大きいと腰から曲げすぎ）」。
 * すねの前傾はひざの曲げの半分なので、上体の前傾はひざの曲げの半分以下にする。
 * ロールボレーだけは、低い球に手を前へ伸ばして待ち構えるので、ひざを深く曲げ、上体も前に倒す（書き手の指示）
 */
const STANCE: { kneeReady: number; kneeMax: number; leanReady: number; leanMax: number; reach: number; paddleTip?: number; setupH?: number; elbowHigh?: boolean; elbowFront?: number; across?: number } = { kneeReady: 36, kneeMax: 60, leanReady: 12, leanMax: 22, reach: 0 };
/** ひじを体より前に置く量（身長の割合。0.06H ≒ 10cm）と、そのために体を後ろに置く最大（ft） */
const ELBOW_FRONT = 0.06;
const BACK_MAX = 1.2;
/** 手が球に届かないときに、体を前に置く最大（ft） */
const FORWARD_MAX = 2;
/** ディンクの腰の落とし方（ひざの高さの球を打つ構え: ひざと上体を STANCE の最大まで曲げる） */
const DINK_CROUCH = { kneeReady: 60, kneeMax: 60, leanReady: 22, leanMax: 22 };
const STANCE_BY_SHOT: Record<string, Partial<typeof STANCE>> = {
	// ドロップ・ロブ: 腰より低い球でも、ディンクと同じだけ腰を落とす（書き手の指摘:「もっと腰を落として。ディンクと一緒」）。
	// ボレーディンクは決めのポーズ（config/court.ts の keyPoses）で、ひざをディンクと同じにしてある
	drop: { ...DINK_CROUCH },
	lob: { ...DINK_CROUCH },
	// reach: 手をネットの側へ伸ばす量（ft）。体をそのぶん後ろに置き、パドルを体の前へ出す。
	// paddleTip: 打つときのパドルの先の向き（度。前の水平が 0、上が +、下が -）。高さによるパドルの向きの規則より優先する。
	// ロールボレー: ひじを前に出して前のめりになり、ネット近くの球にも届くように遠くで待ち構える（書き手の指示）。
	// 下半身はバレーボールのレシーブのように大きく下げる（記事:「低い椅子に座ったまま立ち上がれない感じ」）。
	// 手首を返さずに、肩で腕ごと持ち上げる（書き手の指摘）
	// 打つときのパドル: ヘッドはほぼ真下（地面と垂直）で、面はネットに向けて少しかぶせる（-95°）。面を上へ向けると球が上へ飛ぶ
	// （書き手の指摘。Richard・はるきコーチの動画でも、ヘッドを足の横まで下げ、面をネットへ向けている）
	// 打点はネット寄りのかなり前（書き手の指摘）: 上体をさらにかがめ、手を前へ伸ばす
	roll: { kneeReady: 68, kneeMax: 76, leanReady: 50, leanMax: 55, reach: 3.6, paddleTip: -95 },
	'roll:bh': { kneeReady: 64, kneeMax: 74, leanReady: 48, leanMax: 53, reach: 3.4, paddleTip: -95 },
	// リセット: 面を球の少し下へ入り込ませる（面を少し上へ向ける。向かってくる球に垂直な面より開く。書き手の指示）。
	// パドルの先を前下 40° に向けると、面はネットの側の上 50° を向く。低い球なので、ひざと上体を深く曲げられるようにする
	reset: { paddleTip: -40, kneeMax: 80, leanMax: 34 },
	// 腰より上のリセット: パドルを上へ斜めに（先を前上 50°）、ブロックボレーのように体の前で構える
	'reset:high': { paddleTip: 50 },
	// スピードアップ: 浮き気味のディンク（白帯のちょい上）を、ディンクと同じ構えから打つ。少し前のめりで、ひじは体の前に置いたまま、
	// 手を体の前（前腕1本ぶん）に出す。打つときのパドルはほぼ水平（記事:「ヘッドを下げて構え、打つ所でほぼ水平、振り抜きで少し上」）
	// setupH: 構えを決める高さ（ft）。スピードアップはディンクと同じ構え（ひざの高さの球を打つ構え）から打つので、
	// 体（ひざの曲げと上体の前傾）はディンクの高さで決め、腕だけを打つ高さへ伸ばす（書き手の指摘:「ディンクと同じ構えから出す」）
	// 打つ瞬間のパドルは、ヘッドを下げたまま（先は前下 75°。書き手の指摘「もうちょっとヘッドを下げた方が」）。面はネットへ向いて少し上へ開く。
	// 前へ水平に伸ばした線（-5°）で描くと、面が真上を向き、球の飛ぶ向きと合わなかった（図の確かめで分かった）
	speedup: { paddleTip: -75, setupH: heightLevels.knee.ft },
	// スライスディンク: 面を垂直から約30°上へ開く（パドルの先は前下 60°）。振るあいだ面の角度は変えない（手首を固める）
	sliceDink: { paddleTip: -60 },
	// ショートホップ: すねの高さで取るので、ひざと上体を深く曲げる。パドルの先は前下 55°（面は前上へ少し開く。動画のコマ）
	// （前は前下 65° だったが、真ん中寄りの短いクロスでは球が急に上がるので、面の向きが球の飛ぶ向きと 30° ずれた。前下 55° にした）
	shortHop: { paddleTip: -55, kneeMax: 85, leanMax: 36 },
	// ブロックボレー・パンチボレー: パドルはほぼ立て、面は地面と垂直より少しかぶせるだけ（先を前へ 10°。書き手の指摘:
	// かぶせすぎると球が下へ向かう）
	// ドライブ: ヘッドを下げて押し出す（打つ所でパドルの先は前下 30°）
	// ドライブ: 低く構え（ひざを曲げ、上体を前へ）、膝の高さの球を、ヘッドを下げて（先は前下 60°）体の前で打つ。
	// 打つ瞬間、腕は下へ伸び、ひじは手首の真上近くにある（動画）
	// ひじは人の曲がる向き（下の側）に曲げる。上の側に曲げると、振り抜きでひじがこぶしより上がり、逆に曲がって見える（書き手の指摘）
	drive: { kneeReady: 50, kneeMax: 66, leanReady: 28, leanMax: 36, paddleTip: -60, reach: 0.4, elbowFront: 0.02 },
	// ブロックボレーはパドルを立てて（上にして）取る（書き手の指摘。低い球でも下へ向けない）
	block: { paddleTip: 80 },
	// パンチは胸の前の、ひじを曲げた所から押し出すので、構え（打つ所）は体の近く（reach が負: 体を球の側へ寄せる）
	// elbowFront: ひじを体より前に置く量（身長の割合）。パンチはひじを曲げて体の前に引きつけるので小さく
	punch: { paddleTip: 80, reach: -0.9, elbowFront: 0.015 },
	// フリック: ひじを軸に前腕を回すので、ひじは体の前で直角近くに曲げ、手は伸ばしきらない。少し低く構える。
	// バックはひじを手首より高く上げる（elbowHigh: ひじを、肩と手を結ぶ線より上の側に曲げる）
	// 打点は遠く（書き手の指摘）: 上体を前に倒し、手を前へ伸ばす。顔は前へ向けたまま、あごを引く（頭の傾きの規則）
	// 打つ瞬間のパドルの向きは決めない（paddleTip なし）。高さの規則で決め、面が球の飛ぶ向きと 20° 以内になるように回す。
	// 前は 0°（水平）に決めていて、面が真上を向き、球の飛ぶ向き（前へほぼ水平）と 73° ずれていた
	// （図の確かめで分かった。2026-11-28、dnk001・dnk003 で初めてフリックを描いた）
	// フォアは、打つ瞬間にパドルの先が体の横を向く（手首を軸に、体の横の側を通る半円の途中。書き手の説明 2026-11-28）。
	// 横から見ると面の幅だけが見えるので、体の前を横切るパドル（across）と同じに描く。面は前を向く
	flick: { kneeReady: 45, kneeMax: 62, leanReady: 34, leanMax: 40, reach: 2.2, across: 0 },
	// バックも、打つ瞬間はパドルの先が見ている向き（y）を向くので、横から見ると面の幅だけが見える（across。フォアと同じ）
	'flick:bh': { kneeReady: 45, kneeMax: 62, leanReady: 34, leanMax: 40, reach: 2.4, elbowHigh: true, across: 0 },
};

/** ボレー（弾む前に打つ）打ち方。キッチンの中から打てない */
const VOLLEYS = new Set(['punch', 'block', 'roll', 'volleyDink', 'volleyTrap', 'smash']);

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface SideFigureInput {
	/** 図の座標: 地面の線の x と、高さ 1ft あたりの長さ */
	x0: number;
	k: number;
	/** 人の立つ奥行き（図の y）と、ネットの向き（+1 か -1） */
	y: number;
	toNet: number;
	/** この手で打つ球の飛び出す向き（度。前へ水平が 0、上が +）。分かるときだけ。面の向きをこれに合わせる */
	launch?: number;
	/** 打つ（受ける）高さ（ft）と、パドルの面の真ん中の奥行き（図の y。上から見た図のパドルと同じ） */
	hitH: number;
	faceY: number;
	/** この手で打つ（受けるなら次に打つ）球の種類。構えが変わる打ち方がある（ロールボレーなど） */
	shot?: string;
	/** パドルの構え（fh / bh / ready）。バックハンドで形が変わる打ち方がある */
	hand?: string;
	/** 決めのポーズを関節の角度で与える（与えたときは、手の位置からの計算をしない）。docs: 決めのポーズ */
	angles?: PoseAngles;
	/** 体を後ろに置く量（ft）を決めて渡す（決めのポーズのあいだで動かすとき、体が前後に滑らないように打つ瞬間の値を使う） */
	bodyBack?: number;
	/**
	 * 2本の足を別々に描くとき（走る・踏み込む）: [ももの向き（度。真下から前へ +）, ひざの曲げ（度）]。near は手前の足、far は奥の足。
	 * 書かなければ、2本の足は重なって1本に見える（ふつうの構え）
	 */
	legs?: { near: [number, number]; far: [number, number] };
}

/**
 * 決めのポーズの関節の角度（度）。腕とパドルの向きは「真下から、前（ネットの側）へ回る角度」で、上腕・前腕・パドルの順に足していく。
 * - knee: ひざの曲げ（0 = まっすぐ）、lean: 上体の前傾（0 = まっすぐ）
 * - shoulder: 上腕の向き（0 = 真下、90 = 前へ水平、180 = 真上、-45 = 後ろ下）
 * - elbow: ひじの曲げ（0 = まっすぐ。人のひじは前（+）にしか曲がらない）
 * - paddle: 前腕に対するパドルの向き（0 = 前腕の延長、+ = 前・上へ起こす、- = 手首を後ろへ折る）
 */
export interface PoseAngles {
	knee: number;
	lean: number;
	shoulder: number;
	elbow: number;
	paddle: number;
	/**
	 * パドルが体の前を横切るとき（バックハンドのリセットなど）の、面の向き（度。真下から前へ回る角度。180 = 真上、195 = 上の端が
	 * 体の側へ 15° 倒れて面が少し開く）。横から見ると、パドルはこちらへ向いているので、面の幅（約20cm）だけが短い線に見え、
	 * グリップは手に隠れる。面の真ん中は手の少し前
	 */
	across?: number;
}

export interface SideFigure {
	shoe: string; // polygon の points
	leg: string; // polyline の points（足首・ひざ・股関節）
	/** 腰から足首までの形（path） */
	lowerBody: string;
	/** 奥の足（腰から足首までの形と、靴）。ふつうの構えでは手前の足と同じ形で、重なって見えない */
	lowerBody2: string;
	shoe2: string;
	torso: string; // path の d（胴の横から見た形）
	neck: [number, number, number, number];
	/** 首の形（台形の path） */
	neckShape: string;
	/** 髪と横顔（path） */
	hair: string;
	headShape: string;
	head: { cx: number; cy: number; rx: number; ry: number; rot: number };
	upperArm: [number, number, number, number];
	forearm: [number, number, number, number]; // ひじ → 手（パドルを握る所）
	/** パドル: グリップ（端〜面の始まり）と面（面の始まり〜先） */
	grip: [number, number, number, number];
	face: [number, number, number, number];
	/** 手（こぶし）と、股関節のまわり（胴と足のつなぎめ） */
	hand: { cx: number; cy: number; r: number };
	hip: { cx: number; cy: number; r: number };
	widths: { leg: number; neck: number; upperArm: number; forearm: number; grip: number; face: number; arm: { shoulder: number; elbowUpper: number; elbowFore: number; wrist: number } };
	/** 体を後ろに置いた量（ft） */
	bodyBack: number;
	/** パドルの面の真ん中の高さ（ft） */
	faceH: number;
}

/** 点をなめらかな閉じた曲線でつなぐ（Catmull-Rom 曲線を3次ベジェにする。角ばって見えないように） */
function smoothClosed(q: [number, number][]): string {
	const n = q.length;
	const f = (v: number) => +v.toFixed(3);
	let d = `M${q[0].map(f).join(' ')}`;
	for (let i = 0; i < n; i++) {
		const [p0, p1, p2, p3] = [q[(i - 1 + n) % n], q[i], q[(i + 1) % n], q[(i + 2) % n]];
		const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
		const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
		d += ` C${[...c1, ...c2, ...p2].map(f).join(' ')}`;
	}
	return `${d} Z`;
}

export function sideFigure(o: SideFigureInput): SideFigure {
	const { x0, k, y, toNet, hitH, faceY } = o;
	// 打つ高さが腰より上で、形の違う打ち方（「打ち方:high」）はその形
	// トラップしてから打つ打ち方は、元の打ち方の構え
	const shot = o.shot && baseShot(o.shot);
	const byShot = shot ? (o.hitH > WAIST_FT && STANCE_BY_SHOT[`${shot}:high`]) || (o.hand === 'bh' && STANCE_BY_SHOT[`${shot}:bh`]) || STANCE_BY_SHOT[shot] : undefined;
	const stance = { ...STANCE, ...byShot };
	// 図の座標へ: 高さ h（ft）→ x、前後 d（ft、ネットの側が +）→ y。前後も k 倍にして形をゆがめない
	const X = (h: number) => x0 + h * k;
	const Y = (d: number) => y + toNet * d * k;
	// 体を後ろに置いたぶん（bodyBack）は、描くときに引く（solve の中は体の足首を 0 とした前後）
	let shiftBack = 0;
	const at = (p: P): [number, number] => [X(p.h), Y(p.d - shiftBack)];
	// パドルの面の真ん中: 本当の位置（ボールと同じ）を、図の前後の向きに戻す
	const face: P = { h: hitH, d: (faceY - y) / (toNet * k) };

	const thigh = LEN.thigh * H;
	const shank = LEN.shank * H;
	const ankle: P = { h: LEVEL.ankle * H, d: 0 };
	const trunkLen = (LEVEL.shoulder - LEVEL.hip) * H;
	const upper = LEN.upperArm * H;
	const lower = (LEN.forearm + LEN.handToGrip) * H;

	/** ひざの曲げ kneeDeg と上体の前傾 leanDeg のときの、骨組みの点 */
	const pose = (kneeDeg: number, leanDeg: number) => {
		// すねは前へ、ももは後ろへ、半分ずつ傾ける（腰が足の上に残る）
		const a = rad(kneeDeg / 2);
		const knee: P = { h: ankle.h + shank * Math.cos(a), d: ankle.d + shank * Math.sin(a) };
		const hip: P = { h: knee.h + thigh * Math.cos(a), d: knee.d - thigh * Math.sin(a) };
		const t = rad(leanDeg);
		const up = (len: number, from: P): P => ({ h: from.h + len * Math.cos(t), d: from.d + len * Math.sin(t) });
		const shoulderTop = up(trunkLen, hip);
		const shoulder = up(trunkLen - SHOULDER_JOINT_DROP * H, hip);
		const shoulderJoint: P = { h: shoulder.h, d: shoulder.d + 0.01 * H };
		const neckBase = up((NECK_BASE - LEVEL.hip) * H, hip);
		const chin = up((LEVEL.chin - LEVEL.hip) * H, hip);
		return { knee, hip, shoulderTop, shoulderJoint, neckBase, chin, t };
	};
	// パドルの向き（書き手と決めた規則）: 腰より下では腕の延長（肩からボールへの向き）でヘッドが下がり、
	// 腰より上では高くなるほどヘッドが上を向き、肩より上ではほぼ真上（少しだけ前）になる（solve の gripAt）
	const reach = upper + lower;
	/** 構えと腕: 体を back（ft）だけ後ろに置いたときの、構え・手・ひじ */
	const solve = (back: number) => {
		const faceAt: P = { h: face.h, d: face.d + back };
		const gripAt = (sj: P, f: P = faceAt, own = true) => {
			const vh = f.h - sj.h;
			const vd = f.d - sj.d;
			const l = Math.hypot(vh, vd) || 1;
			const t = Math.max(0, Math.min(1, (f.h - WAIST * H) / ((LEVEL.shoulder - WAIST) * H)));
			// 打ち方でパドルの向きを決めているとき（paddleTip）はその向き。ロールボレーは、ほぼ真下で、ヘッドの先を少しだけ手前に引く。
			// 面は少しかぶせて（閉じて）球の後ろの下半分に当て、持ち上げるのは振りでする。面を上へ向ける（開く）と、
			// 落ちてくる球が浮いてスマッシュされる（記事:「面は垂直より少し前へ、閉じる」。書き手の指示）
			// 体の前を横切るパドル（across）は、横から見ると面の幅だけが見える。手から前へ 0.15ft の所が面の真ん中
			const crossing = own && stance.across !== undefined;
			const tip = crossing ? 0 : !own || stance.paddleTip === undefined ? undefined : (stance.paddleTip * Math.PI) / 180;
			const bh = tip !== undefined ? Math.sin(tip) : vh / l + (0.97 - vh / l) * t;
			const bd = tip !== undefined ? Math.cos(tip) : vd / l + (0.25 - vd / l) * t;
			const bl = Math.hypot(bh, bd) || 1;
			let u = { h: bh / bl, d: bd / bl };
			// 面の向き（面に垂直な前向き）は、球の飛び出す向きと 20° 以内にする（docs/diagrams.md の決まり: 25° 以内）。
			// 高さの規則で決めたパドルの向きが外れるときだけ、外れた分だけパドルを回す（打ち方で向きを決めた paddleTip は回さない）
			if (own && tip === undefined && o.launch !== undefined) {
				const thU = Math.atan2(u.h, u.d);
				// 前向きの面の向き: パドルの向きを 90° 回した向き（ヘッドが下なら前上、上なら前下）
				const thN = thU + (u.h <= 0 ? Math.PI / 2 : -Math.PI / 2);
				const L = rad(o.launch);
				const lim = rad(20);
				const off = Math.atan2(Math.sin(thN - L), Math.cos(thN - L));
				if (Math.abs(off) > lim) {
					const th = thU - (off - Math.sign(off) * lim);
					u = { h: Math.sin(th), d: Math.cos(th) };
				}
			}
			const toFace = crossing ? 0.15 : PADDLE.toFace;
			return { grip: { h: f.h - u.h * toFace, d: f.d - u.d * toFace }, u };
		};
		// 構えを決める高さ: ふつうは打つ高さ。setupH があれば（ほかの球と同じ構えから打つ打ち方）、その高さで構える
		const setupFace: P = stance.setupH === undefined ? faceAt : { h: stance.setupH, d: faceAt.d };
		const fits = (q: ReturnType<typeof pose>) => {
			const { grip } = gripAt(q.shoulderJoint, setupFace, stance.setupH === undefined);
			return Math.hypot(grip.h - q.shoulderJoint.h, grip.d - q.shoulderJoint.d) <= reach * 0.97;
		};
		// ふつうの構えから始め、届かなければ、ひざを少しずつ曲げ、上体を少しずつ倒す
		let knee = stance.kneeReady;
		let lean = stance.leanReady;
		let q = pose(knee, lean);
		while (!fits(q) && (knee < stance.kneeMax || lean < stance.leanMax)) {
			knee = Math.min(stance.kneeMax, knee + 1);
			lean = Math.min(stance.leanMax, lean + 0.4);
			q = pose(knee, lean);
		}
		// 腕: 肩の関節から手（パドルを握る所）まで、ひじで曲げる（2つの長さが決まった腕の、ひじの位置を求める）。
		// 届かないときはまっすぐ伸ばす。ひじの候補は2つ（腕の線の両側）で、下に来るほう（人のひじは下に曲がる）
		const { grip, u } = gripAt(q.shoulderJoint);
		const sj = q.shoulderJoint;
		const dx = grip.h - sj.h;
		const dz = grip.d - sj.d;
		const dist = Math.min(Math.hypot(dx, dz), reach * 0.999);
		const cosA = (upper * upper + dist * dist - lower * lower) / (2 * upper * dist);
		const base = Math.atan2(dz, dx);
		const bend = Math.acos(Math.max(-1, Math.min(1, cosA)));
		const cands = [base + bend, base - bend].map((g): P => ({ h: sj.h + upper * Math.cos(g), d: sj.d + upper * Math.sin(g) }));
		const elbow = (cands[0].h <= cands[1].h) !== !!stance.elbowHigh ? cands[0] : cands[1];
		// 届くか（setupH の打ち方は打つ高さで確かめる）
		const ok = Math.hypot(grip.h - sj.h, grip.d - sj.d) <= reach * 0.99;
		return { p: q, grip, u, sj, elbow, back, ok };
	};
	// ひじは体（肩の関節）より ELBOW_FRONT 前に置く（コーチの記事:「ひじは体の少し前に」「ひじを体の後ろへ引かない」）。
	// 手が体に近くてひじが後ろへ出るときは、体を少しずつ後ろに置いて、手を体の前へ伸ばす（最大 BACK_MAX）
	// ボレー（弾む前に打つ打ち方）は、キッチンラインの後ろに立つ人が体を前に置いても、つま先がキッチンラインを越えない
	// （書き手の指摘: パンチボレーでキッチンラインを越えて見えた。ボレーはキッチンの外から打つ決まり。弾んだ球はキッチンに入って打ってよい）。
	// minBack: 体を後ろに置く量の下限（負 = 前）
	const kitchenLine = COURT.net - o.toNet * COURT.kitchen;
	const behind = (kitchenLine - o.y) * o.toNet;
	const minBack = o.shot && VOLLEYS.has(o.shot) && behind >= 0 ? -Math.max(0, behind - 0.81 * LEN.footLength * H) : -Infinity;
	let r = solve(Math.max(stance.reach, minBack));
	if (o.angles) {
		// 関節の角度から組み立てる。ひじは 0〜150° に、手首（パドル）は -80〜80° に収める（人の動く範囲）
		const A = o.angles;
		const q = pose(A.knee, A.lean);
		const dir = (deg: number) => ({ h: -Math.cos(rad(deg)), d: Math.sin(rad(deg)) });
		const sjA = q.shoulderJoint;
		const ua = dir(A.shoulder);
		const elbowA: P = { h: sjA.h + upper * ua.h, d: sjA.d + upper * ua.d };
		const fa = dir(A.shoulder + Math.max(0, Math.min(150, A.elbow)));
		const gripA: P = { h: elbowA.h + lower * fa.h, d: elbowA.d + lower * fa.d };
		const uA = dir(A.shoulder + Math.max(0, Math.min(150, A.elbow)) + Math.max(-80, Math.min(80, A.paddle)));
		// 体を後ろに置く量: 描く面の真ん中（横切るパドルは手の 0.15ft 前）が、球の奥行きに来るように
		const faceD = A.across !== undefined ? gripA.d + 0.15 : gripA.d + uA.d * PADDLE.toFace;
		r = { p: q, grip: gripA, u: uA, sj: sjA, elbow: elbowA, back: o.bodyBack ?? Math.max(minBack, faceD - face.d), ok: true };
	}
	// パドルの面の真ん中は、いつも球に当てる: 手が届かないときは、体を少しずつ前（球の側）に置く（最大 FORWARD_MAX）
	// （手が肩より前にあるあいだだけ。真上の球のように前へ寄っても届かないときは寄らない）
	while (!o.angles && !r.ok && r.grip.d - r.sj.d > 0.1 && r.back > Math.max(stance.reach - FORWARD_MAX, minBack + 0.05)) r = solve(r.back - 0.05);
	if (!o.angles && r.ok) while (r.elbow.d - r.sj.d < (stance.elbowFront ?? ELBOW_FRONT) * H && r.back < BACK_MAX) r = solve(r.back + 0.05);
	const { p, grip, u, sj, elbow, back: bodyBack } = r;
	shiftBack = bodyBack;
	const toGrip = Math.atan2(grip.d - elbow.d, grip.h - elbow.h);
	const hand: P = { h: elbow.h + lower * Math.cos(toGrip), d: elbow.d + lower * Math.sin(toGrip) };
	let butt: P = { h: hand.h - u.h * PADDLE.toButt, d: hand.d - u.d * PADDLE.toButt };
	let tip: P = { h: hand.h + u.h * PADDLE.toTip, d: hand.d + u.d * PADDLE.toTip };
	let faceStart: P = { h: tip.h - u.h * PADDLE.faceLen, d: tip.d - u.d * PADDLE.faceLen };
	const acrossDeg = o.angles ? o.angles.across : stance.across;
	if (acrossDeg !== undefined) {
		// 体の前を横切るパドル: 面の幅（約 8 インチ）だけを、across の向きの短い線で描く。真ん中は手の 0.15ft 前
		const a = rad(acrossDeg);
		const w = { h: -Math.cos(a), d: Math.sin(a) };
		const c: P = { h: hand.h, d: hand.d + 0.15 };
		const half = 4 / 12;
		faceStart = { h: c.h - w.h * half, d: c.d - w.d * half };
		tip = { h: c.h + w.h * half, d: c.d + w.d * half };
		butt = faceStart;
	}

	// 胴の横から見た形: 背中側と胸側の線を、腰（股関節の少し下）から肩のいちばん上まで。上体の傾きに合わせて回す
	const trunkAt = (frac: number, side: number): P => {
		// frac: 0 = 股関節、1 = 肩のいちばん上。side: 前後のずれ（ft。胸側が +）
		const h = p.hip.h + frac * trunkLen * Math.cos(p.t) - side * Math.sin(p.t);
		const d = p.hip.d + frac * trunkLen * Math.sin(p.t) + side * Math.cos(p.t);
		return { h, d };
	};
	const profile: [number, number, number][] = [
		// [股関節からの割合, 背中側, 胸側]（ft）
		// 胴の下の端は、腰から下の形（lowerBody）の中に隠す（角が外に出ないように）
		[0.3, -DEPTH.waist * H * 0.4, DEPTH.waist * H * 0.5],
		[0.35, -DEPTH.waist * H * 0.45, DEPTH.waist * H * 0.55],
		[0.7, -DEPTH.chest * H * 0.45, DEPTH.chest * H * 0.55],
		// 肩の上は、背中側から首へなだらかに下る（角が首の後ろに突き出て段に見えないように）
		[0.88, -DEPTH.chest * H * 0.42, DEPTH.chest * H * 0.48],
		[1.0, -DEPTH.chest * H * 0.2, DEPTH.chest * H * 0.28],
	];
	// 腰から下（書き手の希望: 腰のつなぎ目がカクっとしないように、リアルに）。お尻・もも・ひざ・ふくらはぎ・すね・足首の
	// 前と後ろの線を、腰（胴のくびれ）から足首まで1つのなめらかな形にする。太さは成人男性の平均的な寸法から
	// （ももの付け根 約18cm → ひざ 約11cm、ふくらはぎ 約11cm → 足首 約6cm）。胴はこの上に重ねて描く
	const along = (from: P, to: P, t: number, off: number): P => {
		const dh = to.h - from.h;
		const dd = to.d - from.d;
		const l = Math.hypot(dh, dd) || 1;
		// 線に垂直な向きのうち、前（d が + の側）
		let nh = -dd / l;
		let nd = dh / l;
		if (nd < 0) [nh, nd] = [-nh, -nd];
		return { h: from.h + dh * t + nh * off, d: from.d + dd * t + nd * off };
	};
	// 足1本の形（ひざ kn・足首 an）
	const legShape = (kn: P, an: P) => {
	const legFront: P[] = [
		trunkAt(0.35, DEPTH.waist * H * 0.55), // 腰の前（くびれ）
		trunkAt(0.02, DEPTH.pelvis * H * 0.4), // 下腹
		along(p.hip, kn, 0.2, 0.05 * H), // ももの前
		along(p.hip, kn, 0.6, 0.042 * H),
		along(p.hip, kn, 0.95, 0.034 * H), // ひざの上
		along(kn, an, 0.05, 0.03 * H), // ひざ（お皿）
		along(kn, an, 0.4, 0.022 * H), // すね
		along(kn, an, 0.85, 0.017 * H),
		along(kn, an, 1.0, 0.017 * H), // 足首の前
	];
	const legBack: P[] = [
		along(kn, an, 1.0, -0.017 * H), // 足首の後ろ（アキレス腱）
		along(kn, an, 0.75, -0.02 * H),
		along(kn, an, 0.3, -0.04 * H), // ふくらはぎ
		along(kn, an, 0.05, -0.03 * H), // ひざの裏
		along(p.hip, kn, 0.85, -0.03 * H),
		along(p.hip, kn, 0.45, -0.042 * H), // ももの裏
		along(p.hip, kn, 0.12, -0.055 * H), // お尻の下
		trunkAt(-0.05, -DEPTH.pelvis * H * 0.62), // お尻
		trunkAt(0.35, -DEPTH.waist * H * 0.45), // 腰の後ろ（くびれ）
	];
	return smoothClosed([...legFront, ...legBack].map(at));
	};
	// 2本の足（legs）: 股関節から、ももの向きとひざの曲げで、ひざと足首を決める。書かなければ、構えの足が2本重なる
	const legDir = (deg: number): P => ({ h: -Math.cos(rad(deg)), d: Math.sin(rad(deg)) });
	const legAt = ([thighDeg, kneeDeg]: [number, number]) => {
		const kn: P = { h: p.hip.h + thigh * legDir(thighDeg).h, d: p.hip.d + thigh * legDir(thighDeg).d };
		const an: P = { h: kn.h + shank * legDir(thighDeg - kneeDeg).h, d: kn.d + shank * legDir(thighDeg - kneeDeg).d };
		return { kn, an };
	};
	const nearLeg = o.legs ? legAt(o.legs.near) : { kn: p.knee, an: ankle };
	const farLeg = o.legs ? legAt(o.legs.far) : { kn: p.knee, an: ankle };
	const lowerBody = legShape(nearLeg.kn, nearLeg.an);
	const lowerBody2 = legShape(farLeg.kn, farLeg.an);
	const back = profile.map(([f, b]) => at(trunkAt(f, b)));
	const front = profile.map(([f, , fr]) => at(trunkAt(f, fr))).reverse();
	const torso = `M${back.map((q) => q.join(' ')).join(' L')} L${front.map((q) => q.join(' ')).join(' L')} Z`;

	// 頭: 縦に長い楕円（高さ 0.13H、前後 0.112H）。あごの上、少し前に置き、上体と同じだけ傾ける
	// 頭の傾き: 上体を前に倒しても、顔は前（ネット）を向けたまま、あごを少し引く（書き手の指摘:「頭は水平に、あごを引いて」）。
	// 上体の傾きのうち 1/4 だけ（最大 10°）頭も前へ傾ける
	const headTilt = Math.min(p.t * 0.25, (10 * Math.PI) / 180);
	const headC: P = {
		h: p.chin.h + (LEN.head * H) / 2 * Math.cos(headTilt),
		d: p.chin.d + (LEN.head * H) / 2 * Math.sin(headTilt) + 0.012 * H,
	};
	const [hcx, hcy] = at(headC);

	// 首: 胴の上の端の中から頭の真ん中まで、すそが広い台形（線の丸い端だと、胴と頭のつなぎ目がふくらんで見える。書き手の指摘）。
	// 元（胴の中）は首の太さより少し太く、先（頭の中）は首の太さ。元の幅は胴の上の端からはみ出さない
	const neckFrom = trunkAt(0.9, 0.005 * H);
	const nh = headC.h - neckFrom.h;
	const nd = headC.d - neckFrom.d;
	const nl = Math.hypot(nh, nd) || 1;
	const across = { h: -nd / nl, d: nh / nl };
	const nw = DEPTH.neck * H;
	const side = (q: P, w: number, sgn: number): P => ({ h: q.h + across.h * w * sgn, d: q.d + across.d * w * sgn });
	// 見える所の太さは約 10cm（首の前後の厚み 11cm より少し細く。書き手の指摘:「首が少し太い」）
	const neckShape = `M${[side(neckFrom, nw * 0.5, 1), side(headC, nw * 0.4, 1), side(headC, nw * 0.4, -1), side(neckFrom, nw * 0.5, -1)].map((q) => at(q).join(' ')).join(' L')} Z`;

	// 横顔と髪（書き手の希望: 鼻・彫り・あごまである横顔と、男性の短髪）。美術の頭の描き方（ルーミス法など）の比率から:
	// 横から見ると頭は正方形に収まる（あご〜頭のてっぺん ≒ 鼻の先〜後頭部）。目は高さの半分、鼻の下は 0.30、口は 0.20、
	// 眉は 0.62、生え際は 0.86。眉の上が少し出て、鼻の付け根がくぼみ、鼻は前へ約 2cm 出る。下唇が上唇より少し出て、
	// その下がくぼんでからあごが出る（2026-11-27 に調べた。open.edu・lifedrawing.academy・Tuts+）。
	// 点は [前へ, 上へ]（頭の高さ = 1。後頭部が 0、鼻の先が 1、あごの下が 0）。上体と同じだけ傾ける
	const hh = LEN.head * H;
	const local = ([x, y]: [number, number]): P => {
		const upL = (y - 0.5) * hh;
		const fwL = (x - 0.46) * hh;
		return { h: headC.h + upL * Math.cos(headTilt) - fwL * Math.sin(headTilt), d: headC.d + upL * Math.sin(headTilt) + fwL * Math.cos(headTilt) };
	};
	const shape = (pts: [number, number][]) => smoothClosed(pts.map((pt) => at(local(pt))));
	const headShape = shape([
		[0.6, 0.03], // のど
		[0.8, 0.0], // あごの下
		[0.88, 0.05], // あごの先
		[0.86, 0.12], // 下唇の下のくぼみ
		[0.9, 0.17], // 下唇
		[0.88, 0.2], // 口
		[0.91, 0.24], // 上唇
		[0.89, 0.29], // 鼻の下
		[1.0, 0.33], // 鼻の先
		[0.97, 0.37],
		[0.9, 0.53], // 鼻の付け根
		[0.93, 0.61], // 眉の上の出っぱり
		[0.92, 0.72], // おでこ
		[0.88, 0.86],
		[0.8, 0.96],
		[0.52, 1.0], // 頭のてっぺん
		[0.18, 0.91],
		[0.0, 0.62], // 後頭部
		[0.06, 0.4],
		[0.16, 0.27],
		[0.22, 0.17], // うなじ
		[0.45, 0.1], // えらの下
	]);
	// 男性の短髪: おでこの生え際から頭の上と後ろを覆い、襟足まで。耳の前に短いもみあげ
	const hair = shape([
		[0.89, 0.86], // 前の生え際
		[0.82, 0.99],
		[0.52, 1.035], // 頭のてっぺん（髪のぶん少し上）
		[0.17, 0.94],
		[-0.015, 0.62],
		[0.045, 0.4],
		[0.16, 0.26], // 襟足
		[0.3, 0.38],
		[0.46, 0.62], // 耳の上
		[0.56, 0.6],
		[0.57, 0.45], // もみあげ
		[0.61, 0.45],
		[0.63, 0.66],
		[0.8, 0.76], // こめかみ
	]);


	// スニーカー（足首の真下を 0 とした、前後・高さ ft の点。長さは足の長さ 0.152H）
	const fl = LEN.footLength * H;
	const sneaker: [number, number][] = [
		[-0.22, 0.02], [0.75, 0.02], [0.8, 0.05], [0.81, 0.1], [0.76, 0.14], [0.55, 0.18], [0.28, 0.27], [0.08, 0.33], [-0.12, 0.33], [-0.2, 0.28], [-0.23, 0.13],
	].map(([d, h]) => [d * fl, h * fl]) as [number, number][];

	const line = (a: P, b: P): [number, number, number, number] => [...at(a), ...at(b)];
	return {
		// 靴は足首の下に置く（足首が上がれば靴も上がる）
		shoe: sneaker.map(([d, h]) => at({ h: h + nearLeg.an.h - ankle.h, d: d + nearLeg.an.d }).join(',')).join(' '),
		shoe2: sneaker.map(([d, h]) => at({ h: h + farLeg.an.h - ankle.h, d: d + farLeg.an.d }).join(',')).join(' '),
		lowerBody2,
		leg: [ankle, p.knee, p.hip].map((q) => at(q).join(',')).join(' '),
		torso,
		lowerBody,
		neck: line(p.neckBase, { h: p.chin.h - 0.01 * H, d: p.chin.d + 0.01 * H }),
		neckShape,
		hair,
		headShape,
		head: { cx: hcx, cy: hcy, rx: (LEN.head * H * k) / 2, ry: (DEPTH.head * H * k) / 2, rot: (toNet * p.t * 180) / Math.PI },
		upperArm: line(sj, elbow),
		forearm: line(elbow, hand),
		grip: line(butt, faceStart),
		face: line(faceStart, tip),
		hand: { cx: at(hand)[0], cy: at(hand)[1], r: (FIST * H * k) / 2 },
		bodyBack,
		faceH: (faceStart.h + tip.h) / 2,
		hip: { cx: at(p.hip)[0], cy: at(p.hip)[1], r: DEPTH.pelvis * H * k * 0.42 },
		widths: {
			grip: PADDLE.gripThick * k,
			face: PADDLE.faceThick * k,
			leg: ((DEPTH.thigh + DEPTH.shank) / 2) * H * k,
			neck: DEPTH.neck * H * k,
			upperArm: DEPTH.upperArm * H * k,
			arm: { shoulder: ARM_W.shoulder * H * k, elbowUpper: ARM_W.elbowUpper * H * k, elbowFore: ARM_W.elbowFore * H * k, wrist: ARM_W.wrist * H * k },
			forearm: DEPTH.forearm * H * k,
		},
	};
}
