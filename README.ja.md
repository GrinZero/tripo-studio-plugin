<div align="center">

<img src="docs/images/banner.png" alt="Tripo Studio for Codex — 対話型 3D アセットスタジオ" width="100%" />

<p align="center">
  <a href="README.md"><b>简体中文</b></a> ·
  <a href="README.zh-TW.md"><b>繁體中文</b></a> ·
  <a href="README.en.md"><b>English</b></a> ·
  <a href="README.ja.md"><b>日本語</b></a> ·
  <a href="README.ko.md"><b>한국어</b></a>
</p>

# Tripo Studio for Codex

**あなた専属の独立系 3D スタジオ。Codex 内の自然言語ひとつで、コンセプトからリギングまで全自動 3D 制作。**

*Your own one-person 3D studio. Create, sculpt, rig, and export 3D assets inside Codex with natural language.*

<p align="center">
  <a href="#2-インストールとクイックスタート-quick-start"><img src="https://img.shields.io/badge/INSTALL-CODEX%20PLUGIN-000000?style=for-the-badge&logo=openai&logoColor=white" alt="Install Plugin" /></a>
  <a href="https://www.npmjs.com/package/tripo-studio-plugin"><img src="https://img.shields.io/badge/NPM-v0.3.4-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="NPM Package" /></a>
  <a href="https://github.com/GrinZero/tripo-studio-plugin"><img src="https://img.shields.io/badge/GITHUB-REPO-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
  <a href="#3-ツールマトリクスと機能一覧-67-mcp-tools"><img src="https://img.shields.io/badge/DOCS-67%20TOOLS-2563EB?style=for-the-badge" alt="67 Tools" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/built%20on-Codex%20MCP%20Apps-6366f1?style=flat-square&logo=openai&logoColor=white" alt="Codex MCP Apps" />
  <img src="https://img.shields.io/badge/models-H3.1%20%C2%B7%20Smart%20Mesh%20%C2%B7%20Rig%20V3-1f2937?style=flat-square" alt="Models" />
  <img src="https://img.shields.io/badge/credits-BYO%20Account%20%C2%B7%20Zero%20Markup-ff5722?style=flat-square" alt="BYO Account" />
  <img src="https://img.shields.io/badge/local%20engine-Blender%20Integrated-e87d0d?style=flat-square&logo=blender&logoColor=white" alt="Blender Integrated" />
  <img src="https://img.shields.io/badge/tools-67%20MCP%20Tools-10b981?style=flat-square" alt="67 MCP Tools" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981?style=flat-square" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/i18n-%E7%AE%80%E4%BD%93%20%C2%B7%20%E7%B9%81%E9%AB%94%20%C2%B7%20EN%20%C2%B7%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%C2%B7%20%ED%95%9C%EA%B5%AD%EC%96%B4-8b5cf6?style=flat-square" alt="Multi-language" />
</p>

<p align="center">
  <a href="#1-tripo-studio-for-codex-とは-what-it-is"><b>💡 本プラグインとは</b></a> ·
  <a href="#2-インストールとクイックスタート-quick-start"><b>🚀 クイックスタート</b></a> ·
  <a href="#3-ツールマトリクスと機能一覧-67-mcp-tools"><b>🛠️ 67 ツール一覧</b></a> ·
  <a href="#4-プロンプト例と対話パターン-showcase--prompts"><b>💬 プロンプト例</b></a> ·
  <a href="#5-ギャラリー-showcase-gallery"><b>🖼️ ギャラリー</b></a> ·
  <a href="#6-制限事項と設計境界-engineering-boundaries"><b>📐 設計境界</b></a> ·
  <a href="#7-ドキュメント一覧-documentation"><b>📖 ドキュメント</b></a>
</p>

</div>

---

> [!NOTE]
> 🚀 **API キー不要 · 既存 Studio アカウント直通**：Web 版 Tripo Studio の既存メンバーシップアカウントを直接連携。高価な API トークンを別途購入する必要はありません。67 個の MCP ツールと対話型 MCP Apps ワークベンチを内蔵し、透明性の高いクレジット見積もりと完全無料のローカル Blender 連携を実現！

---

## 1. Tripo Studio for Codex とは (What it is)

**Tripo API は Tripo が公式に提供しています。一方、Tripo Studio for Codex は私たちが独自に開発した非公式プラグインです。** 現在、Tripo は既存の Tripo Studio の Web 会員アカウントを直接利用できる Codex 連携を公式には提供していません。そのため、このプラグインでその機能を補い、自分の Studio アカウントを使って Codex 内で 3D アセット制作を進められるようにしました。

従来の 3D アセット制作は分断された煩雑な作業の連続でした：
Web ブラウザでプロンプトを入力して生成 ➔ GLB ファイルを手動ダウンロード ➔ Blender に取り込んでトポロジーとポリゴン数を確認 ➔ 修正のためにブラウザへ戻り再生成 ➔ 外部ツールでボーン入れとリギング ➔ テクスチャのベイクやフォーマット変換で頻発するエラー。

**Tripo Studio for Codex は、この 3D 制作パイプライン全体を Codex AI エージェント内に統合します。**

Codex に自然言語で話しかけるだけで、エージェントがパラメータの下書き作成、クレジット見積もり、Tripo Studio の最新高精度/Smart Mesh モデルの呼び出しを実行します。チャット内で 3D GLB モデルを回転・確認し、リトポロジー、Rig V3 自動リギング、モーション適用までワンストップで完了。さらに、ローカル Blender エンジンにより、マニホールド検査、ワイヤーフレーム描画、テクスチャ投影ベイク、FBX/OBJ/USDZ 出力を完全無料（消費ポイント 0）で行えます。

### 3 つのコア設計原則

1. **デュアル協調：対話型生成 ＋ 統合ワークベンチ** (Agent-Driven & Interactive Workbench)
   自然言語による指示に加え、いつでも「アセットライブラリ」「タスク監視」「作成パネル」が統合されたビジュアルワークベンチを開くことができます。誤送信を防ぐ 60 秒カウントダウン確認カードを搭載。
2. **アカウント直通：Studio 会員再利用 · 仲介手数料ゼロ** (BYO Account · Zero API Token Markup)
   お使いの PC の Tripo Studio ログインセッションを直接流用。最新の H3.1、Smart Mesh P2、Rig V3 の性能を余計な仲介コストなしで活用できます。
3. **クラウド ＋ ローカル閉ループパイプライン** (Cloud Generation + Local Blender Engine)
   高負荷な幾何生成、8K PBR テクスチャ生成、AI モーション生成はクラウドで行い、メッシュ検査やワイヤーフレーム描画、FBX 出力などの仕上げ作業はローカル Blender で無料処理します。

---

## 2. インストールとクイックスタート (Quick Start)

### 2.1 事前準備

- **Node.js ≥ 22**（npm / npx が Codex 環境から実行可能であること）
- MCP Apps をサポートする Codex（プラグイン拡張対応環境）
- **Tripo Studio 会員アカウント**（Web ブラウザのログインセッション）
- *（任意）* **Blender**：ローカルメッシュ検査、ワイヤーフレーム描画、投影ベイク用

### 2.2 AI にコピーしてインストールを任せる（推奨）

**以下の文章をすべてコピーし、Codex のチャットに貼り付けて送信してください。** AI が環境の確認、インストール、結果の検証を行います。

```text
Tripo Studio for Codex プラグインをインストールしてください。
リポジトリ：https://github.com/GrinZero/tripo-studio-plugin

まず Node.js ≥ 22、npm / npx、プラグイン対応の Codex CLI があるか確認し、不足があればインストールや設定を手伝ってください。
次に以下のコマンドを実行してください：
codex plugin marketplace add GrinZero/tripo-studio-plugin
codex plugin add tripo-studio-plugin@tripo-studio-plugins

マーケットプレイスが追加済みなら再利用し、更新が必要なら codex plugin marketplace upgrade tripo-studio-plugins を実行してください。
インストールの成功を確認し、エラーがあれば原因を調べて修正してください。完了したら Codex で新しいチャットを開き、
「Tripo Studio のログイン状態を確認して、必要ならログインを手伝って」、続いて「Tripo ワークベンチを開いて」と送信するよう案内してください。
```

手動でインストールする場合は、ターミナルで以下のコマンドを実行します：

```bash
codex plugin marketplace add GrinZero/tripo-studio-plugin
codex plugin add tripo-studio-plugin@tripo-studio-plugins
```

インストール後、Codex で新しいチャットを開始してください。リポジトリの手動クローンやビルド、MCP の手動登録は一切不要です。

> **公開状況**：この手順は npm に公開されたパッケージを使用します。手動での開発者向けセットアップは [コントリビューションガイド (CONTRIBUTING.md)](CONTRIBUTING.md#本地开发) をご覧ください。

### 2.3 ログインとワークベンチ起動

1. **ログイン確認**：Codex に「Tripo Studio のログイン状態を確認して」と指示します。
   - ブラウザの既存セッションが自動的に認識されます。未ログインの場合はログインページが開きます。
2. **ワークベンチを開く**：Codex に「Tripo ワークベンチを開いて」と指示します。
   - アセット・タスク・作成パネルを備えた UI が立ち上がります（閲覧自体は無料です）。
3. **制作を開始**：チャットまたは作成パネルで 3D のプロンプトを送信してください！

> デフォルトのデータ保存先は `~/Documents/TripoStudio` です。[設定ガイド (docs/CONFIGURATION.md)](docs/CONFIGURATION.md) から変更可能です。

### 2.4 アップデートとアンインストール

```bash
# アップデート
codex plugin marketplace upgrade tripo-studio-plugins
codex plugin add tripo-studio-plugin@tripo-studio-plugins

# アンインストール
codex plugin remove tripo-studio-plugin@tripo-studio-plugins
```

---

## 3. ツールマトリクスと機能一覧 (67 MCP Tools)

プラグインには **63 個のエージェント可視ツール** と **4 個の Webview 専用ツール** が登録されています。

```text
┌─────────────────────────────────────────────────────────────┐
│                    Tripo Studio for Codex                   │
├─────────────────┬──────────────────────┬────────────────────┤
│ 🖥️ Workbench (1)│ 👤 Session & Auth (5)│ ⚡ 3D Generation(8)│
│ UIルーティング  │ ログイン・ステータス │ H3.1/SmartMesh/多視│
├─────────────────┼──────────────────────┼────────────────────┤
│ 🔧 Mesh Ops (6) │ 🎨 Texture/PBR (5)   │ 🦴 Rig & Motion (5)│
│ パーツ分割/補完 │ 8K PBR/部分再描画    │ Rig V3/モーション  │
├─────────────────┼──────────────────────┼────────────────────┤
│ 🛠️ Local Engine(6)│ 📦 Asset Groups (5) │ 📋 Tasks & DL (12) │
│ Blender完全無料 │ ローカルグループ管理 │ キュー/履歴/エクス │
└─────────────────┴──────────────────────┴────────────────────┘
```

👉 **[全 67 ツール詳細インデックス (docs/tools/README.md)](docs/tools/README.md)**

---

### 3.1 🖥️ 対話型ワークベンチ (Workbench)
- **主要ツール**：`tripo_open_workbench`（および App 専用ツール 4 個）。
- **特徴**：アセット管理、タスク履歴、モデル作成が統合された UI。ダーク/ライトモード対応、日・中・英言語切り替え可能。
- **プロンプト例**：「Tripo ワークベンチのアセット一覧を開いて」

<div align="center">
  <img src="docs/images/workbench-create-dark.png" alt="統合ワークベンチ作成パネル" width="85%" />
</div>

---

### 3.2 ⚡ クラウド 3D 生成とマルチモーダル制作 (Generation)
- **詳細ガイド**：👉 **[3D 生成ツール詳細マニュアル (docs/tools/generation.md)](docs/tools/generation.md)**
- **ツール一覧**：`tripo_generate_model`, `tripo_generate_image`, `tripo_generate_multiview`, `tripo_regenerate_image`, `tripo_upscale_image`, `tripo_split_image`, `tripo_import_model`, `tripo_list_image_templates`
- **主な機能**：
  - **High Detail パイプライン**：H3.1 世代アーキテクチャ、高密度メッシュ、2K/4K/8K PBR テクスチャ。
  - **Smart Mesh P2**：ゲーム向け 500〜25,000 面クアッド（四角形面）トポロジー、1/2/4 バリアント同時出力。
  - **4 視点画像からの生成**：正面・背面・左・右の画像から破綻のない 3D モデルを構築。
  - **60 秒確認カード**：生成前に見積もりポイントを表示、パラメータ編集時は自動停止。

<div align="center">
  <img src="docs/images/configuration-dark.png" alt="ダークモード設定カード" width="70%" />
</div>

---

### 3.3 🔧 メッシュ工房と 🎨 マテリアル・テクスチャ (Mesh & Texture)
- **詳細ガイド**：👉 **[メッシュ・テクスチャ詳細マニュアル (docs/tools/mesh-texture.md)](docs/tools/mesh-texture.md)**
- **ツール一覧**：
  - メッシュ処理：`tripo_segment_model` (部位自動分割), `tripo_complete_parts` (欠損補完), `tripo_remesh_model` (リトポロジー), `tripo_generate_uv` (Smart UV 候補), `tripo_apply_uv`, `tripo_get_uv_context`
  - テクスチャ：`tripo_generate_texture` (リペイント), `tripo_preview_texture_edit`, `tripo_apply_texture_edits`, `tripo_upscale_texture` (8K 超解像), `tripo_generate_pbr` (PBR マテリアル展開)

<div align="center">
  <img src="docs/images/model-detail.png" alt="モデル詳細とリトポロジー設定" width="85%" />
</div>

---

### 3.4 🦴 ボーン構造と AI モーション (Rigging & Animation)
- **詳細ガイド**：👉 **[リギングとアニメーション詳細マニュアル (docs/tools/rigging-animation.md)](docs/tools/rigging-animation.md)**
- **ツール一覧**：`tripo_rig_model`, `tripo_animate_model`, `tripo_list_animation_presets`, `tripo_generate_motion`, `tripo_apply_motion`, `tripo_list_motions`, `tripo_get_motion`
- **主な機能**：
  - **Rig V3 自動リギング**：ActorCore、Mixamo、Unreal Engine Mannequin、Unity Humanoid 規格準拠。
  - **プリセットアニメーション**：歩行、走行、攻撃、ジャンプ等の基本モーション。
  - **AI Motion テキスト駆動アニメーション**：1〜5 ステージの複雑な連動アクションを自然言語から生成しモデルへリターゲティング。

---

### 3.5 🛠️ ローカル Blender エンジン (完全無料 · クレジット消費ゼロ)
- **詳細ガイド**：👉 **[ローカル Blender ツール詳細マニュアル (docs/tools/local-blender.md)](docs/tools/local-blender.md)**
- **ツール一覧**：`tripo_render_model`, `tripo_inspect_local_parts`, `tripo_edit_parts`, `tripo_bake_texture_projection`, `tripo_paint_texture`, `tripo_crop_image`
- **主なメリット**：
  - 🛡️ **ポイント消費 0 · 100% オフライン処理**：外部クラウドにモデルや画像を送信せずプライバシーを保護。
  - **トポロジー検査**：マニホールドの整合性やポリゴン分布、UV 利用率を精密測定。
  - **ワイヤーフレーム描画**：陰影なしのワイヤーフレームおよび多視点レンダリング出力。
  - **投影ベイク**：2D 画像を参照カメラ視点から UV テクスチャへ高精度マッピング。

---

### 3.6 📦 アセットグループ・系統追跡・エクスポート (Assets, Tasks & Export)
- **詳細ガイド**：👉 **[アセット・タスク・エクスポート詳細マニュアル (docs/tools/assets-tasks-export.md)](docs/tools/assets-tasks-export.md)**
- **ツール一覧**：
  - グループ管理：`tripo_list_asset_groups`, `tripo_list_group_assets`, `tripo_create_asset_group`, `tripo_set_asset_group`, `tripo_rename_asset_group`
  - タスク追跡：`tripo_submit_task`, `tripo_task_sync`, `tripo_task_wait`, `tripo_task_cancel`, `tripo_task_reconcile`, `tripo_list_tasks`, `tripo_get_task`, `tripo_list_task_groups`, `tripo_set_task_character`
  - エクスポート：`tripo_export_model`, `tripo_download`, `tripo_show_result`, `tripo_quote_operation`

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>アセットグループカード</b><br/>
      <img src="docs/images/asset-groups.png" alt="グループカード" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>3D プレビューとダウンロードカード</b><br/>
      <img src="docs/images/model-preview-download.png" alt="3D 結果カード" width="100%" />
    </td>
  </tr>
</table>

---

## 4. プロンプト例と対話パターン (Showcase & Prompts)

```text
この参考画像から「メカフォックス」の 3D モデルを生成して：
- アーキテクチャ: H3.1、標準ジオメトリ、60,000 面、4K PBR テクスチャ
- review:false, submit:false で下書きを作成し、まだ送信しないでください。
```

| 実践シナリオ | Codex への指示内容 | 利用される機能 |
| --- | --- | --- |
| **🎮 厳格なポリゴン予算** | 「この画像から Smart Mesh P2 を使い、5,000 面と 10,000 面の 2 種類のバリアントの下書きを作って。」 | Smart Mesh P2、複数バリアント |
| **📐 4 視点の一致生成** | 「添付の 4 枚は正面・左・背面・右です。これらを組み合わせて単一のモデルを生成して。」 | マルチビューモデリング |
| **🏃 リギングとモーション** | 「このモデルに二足歩行リギングを行い、Unity 互換ボーンを入れて歩行モーションを適用して。」 | Rig V3、骨格プリセット、モーション |
| **📦 アセットのグループ整理** | 「選択したモデルと画像を『メカフォックス · ゲームアセット』というグループにまとめて。」 | ローカルグループ管理 |
| **🔍 生成系統の調査** | 「このモデルがどの元画像とパラメータから生成されたか、親タスクの履歴を教えて。」 | タスク系統追跡 |
| **🚀 Blender 向け出力** | 「このプロジェクトを Blender プリセット、2K テクスチャ付きの FBX として書き出して。」 | FBX エクスポート、テクスチャ同梱 |

---

## 5. ギャラリー (Showcase Gallery)

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>ダークモード設定カード</b><br/>
      <img src="docs/images/configuration-dark.png" alt="ダーク設定カード" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>ライトモード設定カード</b><br/>
      <img src="docs/images/configuration-light.png" alt="ライト設定カード" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>アセット複数選択操作バー</b><br/>
      <img src="docs/images/asset-multiselect.png" alt="複数選択バー" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>日本語レイアウト対応</b><br/>
      <img src="docs/images/workbench-japanese-narrow.png" alt="日本語画面" width="60%" />
    </td>
  </tr>
</table>

---

## 6. 制限事項と設計境界 (Engineering Boundaries)

- **検証範囲**：本プラグインは Web 版 Tripo Studio の通信仕様に基づいています。自動テストの通過は無料動作の整合性を保証するものであり、有料タスクはアカウント残高に依存します。
- **エクスポート制限**：エクスポートは自身の所有プロジェクトに限定されます。ファイルの拡張子を手動で変更しても 3D 形式は変換されません。
- **ローカル処理境界**：ローカル Blender 処理は 150 MiB 以下の自己完結型 GLB に限定されます。スキニング保護のため、リギング済みメッシュの構造編集は拒否されます。
- **履歴追跡の範囲**：本プラグイン外（Web ブラウザ単体など）で行われた操作は自動的には履歴同期されません。

---

## 7. ドキュメント一覧 (Documentation)

- 🛠️ **[全 67 ツール詳細インデックス (docs/tools/README.md)](docs/tools/README.md)**
- ⚡ **[3D 生成ツール詳細マニュアル (docs/tools/generation.md)](docs/tools/generation.md)**
- 🔧 **[メッシュ・テクスチャ詳細マニュアル (docs/tools/mesh-texture.md)](docs/tools/mesh-texture.md)**
- 🦴 **[リギングとアニメーション詳細マニュアル (docs/tools/rigging-animation.md)](docs/tools/rigging-animation.md)**
- 🛠️ **[ローカル Blender ツール詳細マニュアル (docs/tools/local-blender.md)](docs/tools/local-blender.md)**
- 📦 **[アセット・タスク・エクスポート詳細マニュアル (docs/tools/assets-tasks-export.md)](docs/tools/assets-tasks-export.md)**
- 📖 **[総合利用ガイド (docs/USAGE.md)](docs/USAGE.md)**
- ⚙️ **[環境設定 (docs/CONFIGURATION.md)](docs/CONFIGURATION.md)**
- 💻 **[コントリビューション (CONTRIBUTING.md)](CONTRIBUTING.md)**
- 📦 **[配布・リリース手順 (docs/DISTRIBUTION.md)](docs/DISTRIBUTION.md)**

---

## 8. ライセンス (License)

本プロジェクトは [MIT ライセンス](LICENSE) に基づいてオープンソースで公開されています。サードパーティの依存パッケージにはそれぞれのライセンスが適用され、関連する通知は配布パッケージの `dist/THIRD_PARTY_NOTICES.txt` に含まれています。
