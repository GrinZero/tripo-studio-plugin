<div align="center">

<img src="docs/images/banner.png" alt="Tripo Studio for Codex — 你的對話式 3D 資產工坊" width="100%" />

<p align="center">
  <a href="README.md"><b>简体中文</b></a> ·
  <a href="README.zh-TW.md"><b>繁體中文</b></a> ·
  <a href="README.en.md"><b>English</b></a> ·
  <a href="README.ja.md"><b>日本語</b></a> ·
  <a href="README.ko.md"><b>한국어</b></a>
</p>

# Tripo Studio for Codex

**你的專屬獨立 3D 資產工坊。在 Codex 中，用一句話開啟從概念到綁定的全流程 3D 資產製作。**

*Your own one-person 3D studio. Everything you need to create 3D assets with AI, right inside Codex. Bring your own Tripo Studio account.*

<p align="center">
  <a href="#2-安裝與快速上手-quick-start"><img src="https://img.shields.io/badge/INSTALL-CODEX%20PLUGIN-000000?style=for-the-badge&logo=openai&logoColor=white" alt="Install Plugin" /></a>
  <a href="https://www.npmjs.com/package/tripo-studio-plugin"><img src="https://img.shields.io/badge/NPM-v0.3.4-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="NPM Package" /></a>
  <a href="https://github.com/GrinZero/tripo-studio-plugin"><img src="https://img.shields.io/badge/GITHUB-REPO-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
  <a href="#3-完整工具矩陣與功能清單-68-mcp-tools"><img src="https://img.shields.io/badge/DOCS-68%20TOOLS-2563EB?style=for-the-badge" alt="68 Tools" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/built%20on-Codex%20MCP%20Apps-6366f1?style=flat-square&logo=openai&logoColor=white" alt="Codex MCP Apps" />
  <img src="https://img.shields.io/badge/models-H3.1%20%C2%B7%20Smart%20Mesh%20%C2%B7%20Rig%20V3-1f2937?style=flat-square" alt="Models" />
  <img src="https://img.shields.io/badge/credits-BYO%20Account%20%C2%B7%20Zero%20Markup-ff5722?style=flat-square" alt="BYO Account" />
  <img src="https://img.shields.io/badge/local%20engine-Blender%20Integrated-e87d0d?style=flat-square&logo=blender&logoColor=white" alt="Blender Integrated" />
  <img src="https://img.shields.io/badge/tools-68%20MCP%20Tools-10b981?style=flat-square" alt="68 MCP Tools" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981?style=flat-square" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/i18n-%E7%AE%80%E4%BD%93%20%C2%B7%20%E7%B9%81%E9%AB%94%20%C2%B7%20EN%20%C2%B7%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%C2%B7%20%ED%95%9C%EA%B5%AD%EC%96%B4-8b5cf6?style=flat-square" alt="Multi-language" />
</p>

<p align="center">
  <a href="#1-什麼是-tripo-studio-for-codex-what-it-is"><b>💡 什麼是它</b></a> ·
  <a href="#2-安裝與快速上手-quick-start"><b>🚀 安裝上手</b></a> ·
  <a href="#3-完整工具矩陣與功能清單-68-mcp-tools"><b>🛠️ 工具清單</b></a> ·
  <a href="#4-使用示例與對話範式-showcase--prompts"><b>💬 對話範式</b></a> ·
  <a href="#5-介面畫廊-showcase-gallery"><b>🖼️ 介面畫廊</b></a> ·
  <a href="#6-使用限制與工程邊界-engineering-boundaries"><b>📐 工程邊界</b></a> ·
  <a href="#7-文件導航-documentation"><b>📖 文件導航</b></a>
</p>

</div>

---

> [!NOTE]
> 🚀 **零 API 門檻 · 會員直接複用**：直接連接你在 Tripo Studio 網頁端的現有會員帳號，無需申請與額外購買 Tripo API Key。內嵌 68 個 MCP 工具與可互動式 MCP Apps 工作台，雲端積分透明預估，本地 Blender 輔助操作完全零積分消耗！

---

## 1. 什麼是 Tripo Studio for Codex (What it is)

**Tripo API 由 Tripo 官方提供；Tripo Studio for Codex 是我們獨立開發的非官方外掛。** 官方目前未提供在 Codex 中直接複用 Tripo Studio 網頁會員帳號的整合，因此我們提供這個外掛來補足這項能力，讓使用者透過自己的 Studio 帳號在 Codex 中完成 3D 資產工作流程。

以往製作 3D 資產是一條高度割裂的繁複管線：
在瀏覽器網頁中輸入 Prompt 生成模型 ➔ 手動下載 GLB 導出檔案 ➔ 導入 Blender 檢查拓撲與面數 ➔ 發現問題反覆切換回網頁重刷 ➔ 換外部工具綁定骨骼與動作 ➔ 格式轉換與貼圖烘焙頻繁報錯。

**Tripo Studio for Codex 將整套 3D 工業級生產管線徹底整合進 Codex 智能體中。**

你只需對 Codex 發送一句自然語言描述，Agent 即可為你設計參數草稿、智能核算積分、調起 Tripo Studio 最新高精度或 Smart Mesh 模型生成；在聊天視窗中直接旋轉檢視 3D GLB 模型；一鍵執行拓撲重構、Rig V3 骨骼綁定與動效重定向；本地更內嵌 Blender 引擎，零成本完成幾何檢查、線框渲染、投影烘焙與多格式交付。

### 三大核心設計原則

1. **雙模協同：對話即生成，工作台即控制台** (Agent-Driven & Interactive Workbench)
   不僅能用自然語言向 Agent 發號施令，還能隨時打開集成**資產庫、任務監控、創建面板**的三合一視覺化工作台。聊天中自帶 60 秒草稿防手滑確認卡片，直觀掌握面數、拓撲與貼圖預算。
2. **帳號直通：複用 Studio 會員，告別 API 昂貴中轉** (BYO Account · Zero API Token Markup)
   直接打通並複用本機的 Tripo Studio 網頁會話憑證，享受官方最新 H3.1、Smart Mesh P2 與 Rig V3 算力，無任何二次計費與代理溢價。
3. **端雲閉環：雲端生成算力 + 本地 Blender 管線** (Cloud Generation + Local Blender Engine)
   雲端專攻高負載幾何生成、8K PBR 貼圖生成與 AI Motion 動效；本地靜默調用 Blender 免費完成幾何體素檢查、流形修復、貼圖投影與 FBX/OBJ/USDZ 交付，不消耗任何雲端點數。

---

## 2. 安裝與快速上手 (Quick Start)

### 2.1 環境準備

- **Node.js ≥ 22**（包含 npm / npx，Codex 需要能夠找到這些命令）
- 支援 MCP Apps 的 Codex（完整外掛體驗需要宿主支援 Plugin 擴充）
- 自己的 **Tripo Studio 會員帳號**（瀏覽器登入會話）
- *（可選）* **Blender**：用於本地幾何檢查、線框渲染與投影烘焙；純雲端生成不依賴 Blender

### 2.2 複製給 AI，讓它幫你安裝（推薦）

**複製下面整段文字，貼到 Codex 對話框並送出即可。** AI 會檢查環境、執行安裝並確認結果；你無需自己輸入終端機命令。

```text
請幫我安裝 Tripo Studio for Codex 外掛。
專案網址：https://github.com/GrinZero/tripo-studio-plugin

請先檢查本機是否有 Node.js ≥ 22、npm / npx 和支援外掛的 Codex CLI，缺少時幫我安裝或設定。
然後執行以下命令：
codex plugin marketplace add https://github.com/GrinZero/tripo-studio-plugin.git --ref main
codex plugin add tripo-studio-plugin@tripo-studio-plugins

如果市集已經新增，請沿用它；需要重新整理時執行 codex plugin marketplace upgrade tripo-studio-plugins。
請確認外掛安裝成功；遇到錯誤請排查並修復。完成後提醒我在 Codex 中開啟新聊天，
再傳送「檢查 Tripo Studio 登入狀態，需要的話幫我登入」，然後傳送「打開 Tripo 工作台」。
```

需要自己安裝時，也可以在終端機中執行：

```bash
codex plugin marketplace add https://github.com/GrinZero/tripo-studio-plugin.git --ref main
codex plugin add tripo-studio-plugin@tripo-studio-plugins
```

第一條命令從儲存庫的 `main` 分支新增 `tripo-studio-plugins` 市集，第二條命令安裝其中的外掛。Codex 也支援簡寫：`codex plugin marketplace add GrinZero/tripo-studio-plugin --ref main`。

安裝後在 Codex 中開啟新聊天。市集清單從 npm 獲取對應版本的完整外掛，包含技能、MCP 設定與工作台；無需手動複製儲存庫、執行構建或註冊 MCP。

首次使用時，npx 會下載該版本的執行階段及適合本機平台的依賴，需要存取 npm 註冊表；後續複用本機快取。首次啟動允許最多 180 秒。網路失敗時檢查 npm 網路或代理設定後重試。

> **發布狀態**：此安裝流程需要對應版本已經發布到 npm。首次發布和維護者設定見[分發與發布說明](docs/DISTRIBUTION.md)；在首次發布完成前，使用[本地開發接入](CONTRIBUTING.md#本地開發)。

### 2.3 會話登入與工作台喚起

1. **登入驗證**：對 Codex 說：“檢查 Tripo Studio 登入狀態，需要的話幫我登入。”
   - 已有瀏覽器登入會自動複用會話；若未登入將自動打開官方登入頁。
2. **打開工作台**：對 Codex 說：“打開 Tripo 工作台。”
   - 包含**資產、任務、創建**三個主入口，打開本身不產生任何費用。
3. **開始創作**：在創建面板或直接在聊天中發送你的 3D 描述，享受絲滑的 3D 生成體驗！

> 預設資產儲存路徑為 `~/Documents/TripoStudio`，可透過 [設定說明文件](docs/CONFIGURATION.md) 自定義。

### 2.4 更新與解除安裝

更新市集清單後，透過 Codex 重新安裝當前發布版本，再開啟新聊天：

```bash
codex plugin marketplace upgrade tripo-studio-plugins
codex plugin add tripo-studio-plugin@tripo-studio-plugins
```

解除安裝同樣使用 Codex 外掛命令：

```bash
codex plugin remove tripo-studio-plugin@tripo-studio-plugins
```

任務、登入會話和下載資產保存在外掛安裝目錄之外；更新和解除安裝不會刪除這些數據。開發者的原始碼 MCP 接入方式見[開發說明](CONTRIBUTING.md#本地開發)。

---

## 3. 完整工具矩陣與功能清單 (68 MCP Tools)

外掛伺服器共註冊了 **64 個智能體可見工具** 與 **4 個應用專屬工具**。我們為各個工具分類整理了詳盡的子文件、參數指南與互動截圖：

```text
┌─────────────────────────────────────────────────────────────┐
│                    Tripo Studio for Codex                   │
├─────────────────┬──────────────────────┬────────────────────┤
│ 🖥️ Workbench (1)│ 👤 Session & Auth (5)│ ⚡ 3D Generation(8)│
│ 工作台視圖路由  │ 登入、狀態、支付摘要 │ H3.1/SmartMesh/批量│
├─────────────────┼──────────────────────┼────────────────────┤
│ 🔧 Mesh Ops (6) │ 🎨 Texture/PBR (5)   │ 🦴 Rig & Motion (5)│
│ 分件/補全/拓撲  │ 8K PBR/局部重繪/超分 │ Rig V3/骨架/AI動作 │
├─────────────────┼──────────────────────┼────────────────────┤
│ 🛠️ Local Engine(6)│ 📦 Asset Groups (5) │ 📋 Tasks & DL (12) │
│ Blender離線渲染 │ 本地分組/跨頁多選    │ 調度/血統/多格式導 │
└─────────────────┴──────────────────────┴────────────────────┘
```

👉 **[查看完整工具分類索引總覽 (docs/tools/README.md)](docs/tools/README.md)**

---

### 3.1 🖥️ 視覺化工作台 (Workbench)
- **核心工具**：`tripo_open_workbench`（以及 4 個 App 專屬串流工具 `tripo_ui_preview`, `tripo_ui_import_image`, `tripo_ui_asset_library`, `tripo_ui_review`）。
- **能力**：一鍵喚起包含「資產中心」、「任務隊列」與「創建面板」的三合一工作台，深淺主題自適應，支援簡/繁/英/日多語言切換。
- **對話範例**：“打開 Tripo 工作台的資產頁面。”

<div align="center">
  <img src="docs/images/workbench-create-dark.png" alt="視覺化工作台創建面板" width="85%" />
</div>

---

### 3.2 ⚡ 雲端 3D 生成與多模態創作 (Generation)
- **專題指南**：👉 **[3D 生成工具詳細指南與參數規範 (docs/tools/generation.md)](docs/tools/generation.md)**
- **包含工具**：`tripo_generate_model`, `tripo_generate_image`, `tripo_generate_multiview`, `tripo_regenerate_image`, `tripo_upscale_image`, `tripo_split_image`, `tripo_import_model`, `tripo_list_image_templates`
- **核心能力**：
  - **High Detail**：H2.5 / H3.0 / H3.1 架構，支援指定面數、獨立幾何質量與 2K/4K/8K PBR 貼圖。
  - **Smart Mesh P2**：控制在 500–25,000 面規整四邊形網格，支援單次輸出 1 / 2 / 4 個不同面數預算變體。
  - **多視角建模**：支援前/後/左/右四視角參考圖統相對齊建模。
  - **60 秒安全防手滑草稿卡片**：展示參數與積分預估，點擊編輯即暫停倒數計時，杜絕誤操作。

<div align="center">
  <img src="docs/images/configuration-dark.png" alt="深色安全參數配置卡片" width="70%" />
</div>

---

### 3.3 🔧 網格工坊與 🎨 材質紋理管線 (Mesh & Texture)
- **專題指南**：👉 **[網格與材質工具詳細指南 (docs/tools/mesh-texture.md)](docs/tools/mesh-texture.md)**
- **包含工具**：
  - 網格後處理：`tripo_segment_model` (語義分件), `tripo_complete_parts` (部件補全), `tripo_remesh_model` (工業重拓撲), `tripo_generate_uv` (Smart UV 候選), `tripo_apply_uv` (UV 應用), `tripo_get_uv_context`
  - 材質管線：`tripo_generate_texture` (貼圖重繪), `tripo_preview_texture_edit` (局部修改預覽), `tripo_apply_texture_edits` (應用修改), `tripo_upscale_texture` (貼圖 8K 超分), `tripo_generate_pbr` (PBR 材質生成)
- **對話範例**：“幫我把這個裝甲模型重拓撲到 8000 面，並烘焙一套 4K PBR 貼圖。”

<div align="center">
  <img src="docs/images/model-detail.png" alt="模型詳情與重拓撲參數面板" width="85%" />
</div>

---

### 3.4 🦴 骨骼綁定與 AI 動作系統 (Rigging & Animation)
- **專題指南**：👉 **[骨骼綁定與 AI 動作工具詳細指南 (docs/tools/rigging-animation.md)](docs/tools/rigging-animation.md)**
- **包含工具**：`tripo_rig_model`, `tripo_animate_model`, `tripo_list_animation_presets`, `tripo_generate_motion`, `tripo_apply_motion`, `tripo_list_motions`, `tripo_get_motion`
- **核心能力**：
  - **Rig V3 自動骨架綁定**：自動檢測網格雙足特徵，完美適配 ActorCore、Mixamo、Unreal Engine Mannequin 與 Unity Humanoid 骨骼標準。
  - **預設動畫庫**：快速為角色賦予行走、衝刺、攻擊、跳躍等豐富動作。
  - **AI Motion 文字動作生成**：透過自然語言分階段生成 1–5 個連貫全身動作，並平滑重定向至綁定的角色。

---

### 3.5 🛠️ 本地 Blender 工業級工具箱 (Local Tools · 零積分消耗)
- **專題指南**：👉 **[本地 Blender 工具詳細指南 (docs/tools/local-blender.md)](docs/tools/local-blender.md)**
- **包含工具**：`tripo_render_model`, `tripo_inspect_local_parts`, `tripo_edit_parts`, `tripo_bake_texture_projection`, `tripo_paint_texture`, `tripo_crop_image`
- **核心優勢**：
  - 🛡️ **零積分消耗 · 100% 離線計算**：無需登入，不上傳模型與圖片。
  - **幾何體素檢查**：檢查自包含 GLB 網格流形狀態與面數體素分佈。
  - **線框圖渲染**：一鍵生成無光照線框圖與 2× 視口高保真渲染圖。
  - **貼圖投影烘焙**：將 2D 參考圖精準反向投影並烘焙到模型貼圖表面。

---

### 3.6 📦 資產分組、任務血統與工業交付 (Assets, Tasks & Export)
- **專題指南**：👉 **[資產、任務與導出工具詳細指南 (docs/tools/assets-tasks-export.md)](docs/tools/assets-tasks-export.md)**
- **包含工具**：
  - 資產分組：`tripo_list_asset_groups`, `tripo_list_group_assets`, `tripo_create_asset_group`, `tripo_set_asset_group`, `tripo_rename_asset_group`
  - 任務調度：`tripo_submit_task`, `tripo_task_sync`, `tripo_task_wait`, `tripo_task_cancel`, `tripo_task_reconcile`, `tripo_list_tasks`, `tripo_get_task`, `tripo_list_task_groups`, `tripo_set_task_character`
  - 導出交付：`tripo_export_model`, `tripo_download`, `tripo_show_result`, `tripo_quote_operation`
- **核心能力**：
  - **資產卡片與跨頁多選**：支援模型與圖片混合分組，跨頁勾選批次整理。
  - **全鏈路血統溯源**：完整記錄生成參數快照、輸入檔案雜湊與上游關聯，支援斷網異常對帳。
  - **工業級格式導出**：GLB / FBX (Blender 預設) / OBJ / USDZ / STL / 3MF，下載時自動生成 Blender 適用的 meshopt 解碼副本。

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>資產分組卡片（成員預覽與數量統計）</b><br/>
      <img src="docs/images/asset-groups.png" alt="資產分組卡片" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>可互動 3D 結果卡片與下載交付</b><br/>
      <img src="docs/images/model-preview-download.png" alt="模型結果卡片" width="100%" />
    </td>
  </tr>
</table>

---

## 4. 使用示例與對話範式 (Showcase & Prompts)

安裝完成後，直接在 Codex 對話框向智能體發出指令即可：

```text
用這張參考圖生成「機械狐」模型：H3.1、標準幾何、60,000 面、4K PBR 貼圖。
只準備配置草稿，設置 review:false、submit:false，先不要提交。
```

### 常用實戰場景與指令表

| 實戰場景 | 對 Codex 說 | 涉及能力 |
| --- | --- | --- |
| **🎮 嚴格網格預算** | “用這張圖做 Smart Mesh P2 模型，給我 5,000 和 10,000 面兩個變體，只準備草稿。” | Smart Mesh P2、多變體預算 |
| **📐 多視圖一致建模** | “這四張圖依次是正面、左側、背面、右側，用它們生成同一個模型，只準備草稿。” | 多視角建模、四視圖對齊 |
| **🏃 角色骨骼與動作** | “檢查機械狐模型的綁定能力，使用適合它的骨架，再應用一個可用的走路動畫。” | Rig V3、骨骼綁定、AI Motion |
| **📦 資產分組與歸檔** | “把選中的參考圖和模型收進一個組，命名為「機械狐 · 遊戲資產」，檢查組內數量。” | 本地資產分組、多選整理 |
| **🔍 全鏈路來源溯源** | “查看這個模型的來源任務、輸入圖片與實際生成參數。” | 任務血統追蹤、輸入回溯 |
| **🚀 Blender 格式交付** | “導出這個自有專案為 FBX，使用 Blender 預設、2K 貼圖，下載後展示檔案位置。” | 模型導出、貼圖打包、格式相容 |

---

## 5. 介面畫廊 (Showcase Gallery)

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>深色參數配置卡片（編輯中暫停倒數計時）</b><br/>
      <img src="docs/images/configuration-dark.png" alt="深色配置卡片" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>淺色參數配置卡片（可編輯參數與預估積分）</b><br/>
      <img src="docs/images/configuration-light.png" alt="淺色配置卡片" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>資產直接多選與批次分組操作欄</b><br/>
      <img src="docs/images/asset-multiselect.png" alt="資產多選與分組操作欄" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>日本語窄面板自適應佈局</b><br/>
      <img src="docs/images/workbench-japanese-narrow.png" alt="日語窄面板佈局" width="60%" />
    </td>
  </tr>
</table>

---

## 6. 使用限制與工程邊界 (Engineering Boundaries)

- **驗證範圍**：本專案基於 Tripo Studio 用戶端網路契約實現。契約與自動化測試通過不代表每項付費操作都完成了真實扣費驗證；瀏覽器宿主驗證與原生 Codex 宿主驗證分別記錄，詳見 [驗證記錄索引 (CONTRIBUTING.md)](CONTRIBUTING.md#驗證記錄)。
- **導出與下載限制**：導出功能限使用者自有專案。需先調用導出並指定格式，再下載對應的導出結果；直接修改本地檔案副檔名無法轉換格式。貼圖打包可能返回 ZIP 壓縮包，實際解析度在下載階段核驗。
- **本地模型處理邊界**：本地處理要求自包含 GLB 格式；Blender 自動解碼受 150 MiB 本地模型尺寸限制；UV 利用率為空間估算值；投影烘焙以面中心判定可見性，複雜材質與大面角需複核；蒙皮部件的拓撲結構修改會被拒絕。
- **來源追蹤與恢復**：來源追溯依賴外掛本地持久化的任務與輸入記錄，無法自動補齊在外掛外部進行的網頁端編輯；遇到 `outcome_unknown` 異常任務需核對遠端 ID，不可盲目重複提交。

---

## 7. 文件導航 (Documentation)

- 🛠️ **[完整工具分類索引總覽 (docs/tools/README.md)](docs/tools/README.md)**：全 68 個 MCP 工具分類速查表
- ⚡ **[3D 生成工具指南 (docs/tools/generation.md)](docs/tools/generation.md)**：High Detail、Smart Mesh P2、多視角與草稿保護
- 🔧 **[網格與材質工具指南 (docs/tools/mesh-texture.md)](docs/tools/mesh-texture.md)**：分件、重拓撲、Smart UV 與 8K PBR
- 🦴 **[骨骼與 AI 動作指南 (docs/tools/rigging-animation.md)](docs/tools/rigging-animation.md)**：Rig V3、工業骨架與 AI Motion
- 🛠️ **[本地 Blender 工具指南 (docs/tools/local-blender.md)](docs/tools/local-blender.md)**：零積分離線網格體檢、渲染與投影烘焙
- 📦 **[資產任務與導出指南 (docs/tools/assets-tasks-export.md)](docs/tools/assets-tasks-export.md)**：資產分組、血統追蹤與工業導出
- 📖 **[使用指南 (docs/USAGE.md)](docs/USAGE.md)**：詳細參數選擇、提交行為、草稿確認、任務恢復與導出步驟
- ⚙️ **[配置說明 (docs/CONFIGURATION.md)](docs/CONFIGURATION.md)**：環境變數、本地資料目錄與跨平台 Blender 路徑配置
- 💻 **[參與開發與規範 (CONTRIBUTING.md)](CONTRIBUTING.md)**：構建、測試、分發打包、架構說明與驗證用例索引
- 📦 **[分發與自動發布 (docs/DISTRIBUTION.md)](docs/DISTRIBUTION.md)**：外掛市集、npm 發布包、GitHub Actions 與版本更新
- 🧠 **[核心架構文件 (CORE.md)](CORE.md)**：底層設計哲學、會話管理與端雲通信架構
- 🤖 **[Agent 技能指引 (skills/tripo-studio/SKILL.md)](skills/tripo-studio/SKILL.md)**：針對 AI 智能體的調用指導與最佳工作流實踐

---

## 8. 許可證 (License)

本專案採用 [MIT 許可證](LICENSE) 開源發布。第三方相依套件保留各自的許可證，相關聲明隨發布套件提供於 `dist/THIRD_PARTY_NOTICES.txt`。
