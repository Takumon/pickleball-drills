# 設計メモ

このサイトを作るうえでの前提、設計の考え方、決めたことをまとめる。コードや設定ファイルだけでは分からない「なぜそうしたか」を残すためのフォルダで、サイトには公開されない（サイトのページは `src/content/docs/` にある）。

| ファイル | 書いてあること |
|---|---|
| [principles.md](principles.md) | サイトの目的と読者、文章と運用の方針、公開しない情報 |
| [diagrams.md](diagrams.md) | コート図とアニメーションの約束と、その理由 |
| [decisions.md](decisions.md) | 決めたこと、やめた案とその理由（日付順） |
| [roadmap.md](roadmap.md) | 合意済みで、まだ作っていないもの |

ドリル1つを書くときの手順は `.claude/skills/add-drill/SKILL.md` にある。図の色や高さの値は `src/config/court.ts`、項目の見せ方は `src/config/drill-display.ts` が正しい値を持つ。このフォルダにはそれらを書き写さず、考え方だけを書く。
