## このリポジトリの作業ルール

作業を始める前に `docs/`（設計メモ）を読む。サイトの目的、図の約束、決めたこととやめた案、まだ作っていないものが書いてある。ドリルを書く・直すときは `add-drill` スキル（`.claude/skills/add-drill/SKILL.md`）に従う。

- リポジトリもサイトも公開されている。個人を特定できる情報、練習会の団体名・日付・会場・参加者、外部のサービスから集めた練習会の情報は、git に入れない（コード、`docs/`、コミットのメッセージを含む）。これらは git の管理から外した `menus-raw/` にだけ置く。
- プッシュの前に、ローカルの開発サーバーを起動し、ブラウザで指示どおりに直っているかをスマホの幅（400px 前後）でも確かめる。終わったら開発サーバーを止める。
- 書き手は GitHub Pages に公開されたページで確認することが多い。確認してもらう単位でプッシュし、反映を待ってから、確認してほしいページのURLを伝える。
- 新しく書いた日本語は yomiyasu スキルで確かめてから反映する。
- 不明な点は1つずつ番号を振り、おすすめを添えて文章で聞く。
- Node 24 を使う（`.nvmrc`）。シェルごとに `nvm use` する。

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
