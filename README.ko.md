<div align="center">

<p align="center">
  <a href="README.md"><b>简体中文</b></a> ·
  <a href="README.zh-TW.md"><b>繁體中文</b></a> ·
  <a href="README.en.md"><b>English</b></a> ·
  <a href="README.ja.md"><b>日本語</b></a> ·
  <a href="README.ko.md"><b>한국어</b></a>
</p>

<img src="docs/images/banner.png" alt="Tripo Studio for Codex — 대화형 3D 에셋 스튜디오" width="100%" />

# Tripo Studio for Codex

**당신만의 1인 3D 에셋 스튜디오. Codex 내에서 자연어 한마디로 컨셉부터 리깅까지 3D 에셋 전 과정을 제작하세요.**

*Your own one-person 3D studio. Create, sculpt, rig, and export 3D assets inside Codex with natural language.*

<p align="center">
  <a href="#2-설치-및-빠른-시작-quick-start"><img src="https://img.shields.io/badge/INSTALL-CODEX%20PLUGIN-000000?style=for-the-badge&logo=openai&logoColor=white" alt="Install Plugin" /></a>
  <a href="https://www.npmjs.com/package/tripo-studio-plugin"><img src="https://img.shields.io/badge/NPM-v0.3.4-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="NPM Package" /></a>
  <a href="https://github.com/GrinZero/tripo-studio-plugin"><img src="https://img.shields.io/badge/GITHUB-REPO-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repo" /></a>
  <a href="#3-전체-도구-매트릭스-및-기능-목록-67-mcp-tools"><img src="https://img.shields.io/badge/DOCS-67%20TOOLS-2563EB?style=for-the-badge" alt="67 Tools" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/built%20on-Codex%20MCP%20Apps-6366f1?style=flat-square&logo=openai&logoColor=white" alt="Codex MCP Apps" />
  <img src="https://img.shields.io/badge/models-H3.1%20%C2%B7%20Smart%20Mesh%20%C2%B7%20Rig%20V3-1f2937?style=flat-square" alt="Models" />
  <img src="https://img.shields.io/badge/credits-BYO%20Account%20%C2%B7%20Zero%20Markup-ff5722?style=flat-square" alt="BYO Account" />
  <img src="https://img.shields.io/badge/local%20engine-Blender%20Integrated-e87d0d?style=flat-square&logo=blender&logoColor=white" alt="Blender Integrated" />
  <img src="https://img.shields.io/badge/tools-67%20MCP%20Tools-10b981?style=flat-square" alt="67 MCP Tools" />
  <img src="https://img.shields.io/badge/license-UNLICENSED-4b5563?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/i18n-%E7%AE%80%E4%BD%93%20%C2%B7%20%E7%B9%81%E9%AB%94%20%C2%B7%20EN%20%C2%B7%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%C2%B7%20%ED%95%9C%EA%B5%AD%EC%96%B4-8b5cf6?style=flat-square" alt="Multi-language" />
</p>

<p align="center">
  <a href="#1-tripo-studio-for-codex란-what-it-is"><b>💡 플러그인 소개</b></a> ·
  <a href="#2-설치-및-빠른-시작-quick-start"><b>🚀 빠른 시작</b></a> ·
  <a href="#3-전체-도구-매트릭스-및-기능-목록-67-mcp-tools"><b>🛠️ 67개 도구</b></a> ·
  <a href="#4-사용-예시-및-프롬프트-패턴-showcase--prompts"><b>💬 프롬프트 예시</b></a> ·
  <a href="#5-인터페이스-갤러리-showcase-gallery"><b>🖼️ 갤러리</b></a> ·
  <a href="#6-사용-제한-및-엔지니어링-경계-engineering-boundaries"><b>📐 엔지니어링 경계</b></a> ·
  <a href="#7-문서-내비게이션-documentation"><b>📖 문서 목록</b></a>
</p>

</div>

---

> [!NOTE]
> 🚀 **API 키 불필요 · 기존 Studio 계정 직접 연동**: 별도의 고가 API 토큰 구매 없이 Tripo Studio 웹 멤버십 계정을 직접 연결할 수 있습니다. 67개의 MCP 도구와 상호작용형 MCP Apps 워크벤치가 내장되어 있으며, 투명한 크레딧 견적 및 완전 무료 로컬 Blender 파이프라인을 지원합니다!

---

## 1. Tripo Studio for Codex란? (What it is)

기존의 3D 에셋 제작은 매우 번거롭고 단절된 워크플로우였습니다:
웹 브라우저에서 프롬프트로 모델 생성 ➔ GLB 파일 수동 다운로드 ➔ Blender로 가져와 토폴로지와 폴리곤 수 검사 ➔ 문제 발견 시 브라우저로 돌아가 재시도 ➔ 외부 리깅 툴로 이동해 뼈대 및 모션 부여 ➔ 텍스처 베이킹 및 포맷 변환 오류 해결.

**Tripo Studio for Codex는 이 모든 3D 산업용 파이프라인을 Codex AI 에이전트 내에 완전히 통합합니다.**

Codex에 자연어로 요청하기만 하면, 에이전트가 생성 파라미터 초안을 작성하고 크레딧을 견적하며 Tripo Studio의 최신 H3.1 및 Smart Mesh 모델을 호출합니다. 대화창에서 인터랙티브 3D GLB 모델을 직접 회전하며 검토하고, 리토폴로지, Rig V3 자동 본 리깅, 모션 리타기팅까지 한 번에 완료할 수 있습니다. 또한 내장된 로컬 Blender 엔진을 통해 메쉬 검사, 와이어프레임 렌더링, 텍스처 프로젝션 베이킹 및 FBX/OBJ/USDZ 내보내기를 무료(크레딧 소모 0)로 실행합니다.

### 3대 핵심 설계 원칙

1. **듀얼 협업: 대화형 생성 ＋ 비주얼 워크벤치** (Agent-Driven & Interactive Workbench)
   자연어로 명령을 내리는 동시에 **에셋 보관함, 작업 모니터링, 생성 패널**이 통합된 3-in-1 그래픽 워크벤치를 언제든 열 수 있습니다. 60초 카운트다운 확인 카드를 통해 의도치 않은 포인트 소모를 방지합니다.
2. **계정 직통: Studio 회원 직접 활용 · 중간 마진 제로** (BYO Account · Zero API Token Markup)
   PC의 웹 브라우저 로그인 세션을 그대로 사용하여 공식 최신 H3.1, Smart Mesh P2 및 Rig V3 엔진을 추가 비용 없이 누릴 수 있습니다.
3. **클라우드 ＋ 로컬 완결형 파이프라인** (Cloud Generation + Local Blender Engine)
   고성능 지오메트리 생성, 8K PBR 텍스처 및 AI Motion은 클라우드에서 처리하고, 메쉬 무결성 검사, 와이어프레임 렌더링, 텍스처 프로젝션 및 FBX 내보내기는 로컬 Blender에서 무료로 처리합니다.

---

## 2. 설치 및 빠른 시작 (Quick Start)

### 2.1 사전 요구사항

- **Node.js ≥ 22** (npm / npx 포함, Codex 환경에서 접근 가능해야 함)
- MCP Apps를 지원하는 Codex (플러그인 확장 기능 지원)
- **Tripo Studio 계정** (브라우저 로그인 세션)
- *(선택 사항)* **Blender** (로컬 메쉬 검사, 와이어프레임 렌더링 및 텍스처 프로젝션 베이킹용)

### 2.2 Codex 마켓플레이스를 통한 설치

터미널에서 아래 명령을 실행하여 마켓플레이스를 추가하고 설치합니다:

```bash
codex plugin marketplace add GrinZero/tripo-studio-plugin
codex plugin add tripo-studio-plugin@tripo-studio-plugins
```

설치 후 Codex에서 새 대화를 시작하세요. npm에서 완성된 플러그인을 가져오므로 수동 빌드나 복잡한 등록 과정이 필요하지 않습니다.

> **배포 상태**: 본 설치는 npm에 정식 배포된 패키지를 기준으로 합니다. 로컬 소스코드 개발 환경은 [기여 가이드 (CONTRIBUTING.md)](CONTRIBUTING.md#本地开发)를 참조하세요.

### 2.3 세션 로그인 및 워크벤치 실행

1. **로그인 상태 확인**: Codex에게 *"Tripo Studio 로그인 상태 확인하고 필요하면 로그인해 줘"*라고 입력합니다.
   - 브라우저에 기존 세션이 있다면 자동 연동되며, 미로그인 시 로그인 페이지가 열립니다.
2. **워크벤치 열기**: Codex에게 *"Tripo 워크벤치 열어줘"*라고 입력합니다.
   - 에셋, 작업, 생성 탭을 갖춘 UI가 열립니다(UI 열기 자체는 무료입니다).
3. **제작 시작**: 생성 패널이나 대화창에서 3D 묘사를 전송하여 모델링을 시작하세요!

> 기본 에셋 저장 경로는 `~/Documents/TripoStudio`이며 [설정 가이드 (docs/CONFIGURATION.md)](docs/CONFIGURATION.md)에서 변경할 수 있습니다.

### 2.4 업데이트 및 삭제

```bash
# 업데이트
codex plugin marketplace upgrade tripo-studio-plugins
codex plugin add tripo-studio-plugin@tripo-studio-plugins

# 삭제
codex plugin remove tripo-studio-plugin@tripo-studio-plugins
```

---

## 3. 전체 도구 매트릭스 및 기능 목록 (67 MCP Tools)

플러그인 서버에는 **63개의 에이전트 가시 도구**와 **4개의 Webview 앱 전용 도구**가 등록되어 있습니다.

```text
┌─────────────────────────────────────────────────────────────┐
│                    Tripo Studio for Codex                   │
├─────────────────┬──────────────────────┬────────────────────┤
│ 🖥️ Workbench (1)│ 👤 Session & Auth (5)│ ⚡ 3D Generation(8)│
│ UI 라우팅       │ 로그인/상태/크레딧   │ H3.1/SmartMesh/멀티│
├─────────────────┼──────────────────────┼────────────────────┤
│ 🔧 Mesh Ops (6) │ 🎨 Texture/PBR (5)   │ 🦴 Rig & Motion (5)│
│ 파츠분할/리메쉬 │ 8K PBR/부분수정/초해상│ Rig V3/골격/AI모션 │
├─────────────────┼──────────────────────┼────────────────────┤
│ 🛠️ Local Engine(6)│ 📦 Asset Groups (5) │ 📋 Tasks & DL (12) │
│ Blender 무료처리│ 로컬 그룹/다중선택   │ 큐/계통추적/내보내기│
└─────────────────┴──────────────────────┴────────────────────┘
```

👉 **[전체 67개 도구 상세 인덱스 보기 (docs/tools/README.md)](docs/tools/README.md)**

---

### 3.1 🖥️ 상호작용형 워크벤치 (Workbench)
- **주요 도구**: `tripo_open_workbench` (및 4개 앱 전용 스트리밍 도구).
- **특징**: 에셋 관리, 작업 기록, 3D 생성이 하나로 통합된 UI. 다크/라이트 테마 자동 적응, 다국어 전환 지원.
- **프롬프트 예시**: *"Tripo 워크벤치의 에셋 페이지를 열어줘."*

<div align="center">
  <img src="docs/images/workbench-create-dark.png" alt="3-in-1 워크벤치 생성 패널" width="85%" />
</div>

---

### 3.2 ⚡ 클라우드 3D 생성 및 멀티모달 제작 (Generation)
- **상세 가이드**: 👉 **[3D 생성 도구 상세 가이드 (docs/tools/generation.md)](docs/tools/generation.md)**
- **포함 도구**: `tripo_generate_model`, `tripo_generate_image`, `tripo_generate_multiview`, `tripo_regenerate_image`, `tripo_upscale_image`, `tripo_split_image`, `tripo_import_model`, `tripo_list_image_templates`
- **핵심 기능**:
  - **High Detail 파이프라인**: H3.1 세대 아키텍처, 독립 지오메트리 퀄리티, 2K/4K/8K PBR 텍스처.
  - **Smart Mesh P2**: 500~25,000면 쿼드(사각면) 게임 토폴로지, 단일 생성으로 1/2/4개 LOD 변형 모델 동시 출력.
  - **4뷰 다각도 이미지 기반 생성**: 앞/뒤/좌/우 레퍼런스 이미지를 정렬하여 왜곡 없는 3D 모델 생성.
  - **60초 카운트다운 확인 카드**: 실행 전 예상 소모 포인트를 표시하며, 파라미터 편집 시 카운트다운이 자동 정지됩니다.

<div align="center">
  <img src="docs/images/configuration-dark.png" alt="다크 모드 파라미터 확인 카드" width="70%" />
</div>

---

### 3.3 🔧 메쉬 공방 및 🎨 텍스처 파이프라인 (Mesh & Texture)
- **상세 가이드**: 👉 **[메쉬 및 텍스처 도구 상세 가이드 (docs/tools/mesh-texture.md)](docs/tools/mesh-texture.md)**
- **포함 도구**:
  - 메쉬 편집: `tripo_segment_model` (의미론적 파츠 분할), `tripo_complete_parts` (파츠 형태 복원), `tripo_remesh_model` (리토폴로지), `tripo_generate_uv` (Smart UV 후보 생성), `tripo_apply_uv`, `tripo_get_uv_context`
  - 텍스처 편집: `tripo_generate_texture` (리페인팅), `tripo_preview_texture_edit`, `tripo_apply_texture_edits`, `tripo_upscale_texture` (8K 초해상도), `tripo_generate_pbr` (PBR 맵 추출)

<div align="center">
  <img src="docs/images/model-detail.png" alt="모델 상세 정보 및 리메쉬 파라미터 패널" width="85%" />
</div>

---

### 3.4 🦴 본 리깅 및 AI 모션 시스템 (Rigging & Animation)
- **상세 가이드**: 👉 **[본 리깅 및 AI 모션 도구 상세 가이드 (docs/tools/rigging-animation.md)](docs/tools/rigging-animation.md)**
- **포함 도구**: `tripo_rig_model`, `tripo_animate_model`, `tripo_list_animation_presets`, `tripo_generate_motion`, `tripo_apply_motion`, `tripo_list_motions`, `tripo_get_motion`
- **핵심 기능**:
  - **Rig V3 자동 리깅**: 이족보행 특성을 분석하여 ActorCore, Mixamo, Unreal Engine Mannequin, Unity Humanoid 표준에 완벽 부합하는 스켈레톤 생성.
  - **프리셋 모션 라이브러리**: 걷기, 달리기, 점프, 전투 등 표준 애니메이션 클립 즉시 적용.
  - **AI Motion 텍스트 애니메이션**: 자연어로 1~5단계 복합 전신 모션을 생성하고 리깅된 캐릭터에 매끄럽게 리타기팅.

---

### 3.5 🛠️ 로컬 Blender 산업용 도구함 (완전 무료 · 크레딧 소모 0)
- **상세 가이드**: 👉 **[로컬 Blender 도구 상세 가이드 (docs/tools/local-blender.md)](docs/tools/local-blender.md)**
- **포함 도구**: `tripo_render_model`, `tripo_inspect_local_parts`, `tripo_edit_parts`, `tripo_bake_texture_projection`, `tripo_paint_texture`, `tripo_crop_image`
- **주요 장점**:
  - 🛡️ **크레딧 소모 0 · 100% 오프라인 처리**: 외부 클라우드로 에셋을 전송하지 않아 상업용 자산을 안전하게 보호.
  - **지오메트리 무결성 검사**: GLB 메쉬의 매니폴드 상태, 폴리곤 분포, UV 면적 활용률 검사.
  - **와이어프레임 렌더링**: 무조명 와이어프레임 뷰 및 2× 뷰포트 고화질 렌더링.
  - **텍스처 프로젝션 베이킹**: 2D 레퍼런스 이미지를 카메라 뷰포트 시점에서 UV 텍스처로 정밀 역투영 베이킹.

---

### 3.6 📦 에셋 그룹, 작업 계통 및 다중 포맷 배포 (Assets, Tasks & Export)
- **상세 가이드**: 👉 **[에셋, 작업 및 내보내기 상세 가이드 (docs/tools/assets-tasks-export.md)](docs/tools/assets-tasks-export.md)**
- **포함 도구**:
  - 에셋 그룹: `tripo_list_asset_groups`, `tripo_list_group_assets`, `tripo_create_asset_group`, `tripo_set_asset_group`, `tripo_rename_asset_group`
  - 작업 엔진: `tripo_submit_task`, `tripo_task_sync`, `tripo_task_wait`, `tripo_task_cancel`, `tripo_task_reconcile`, `tripo_list_tasks`, `tripo_get_task`, `tripo_list_task_groups`, `tripo_set_task_character`
  - 내보내기: `tripo_export_model`, `tripo_download`, `tripo_show_result`, `tripo_quote_operation`

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>에셋 그룹 카드 (썸네일 및 수량 요약)</b><br/>
      <img src="docs/images/asset-groups.png" alt="에셋 그룹 카드" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>3D 뷰어 및 다운로드 결과 카드</b><br/>
      <img src="docs/images/model-preview-download.png" alt="3D 결과 카드" width="100%" />
    </td>
  </tr>
</table>

---

## 4. 사용 예시 및 프롬프트 패턴 (Showcase & Prompts)

```text
첨부된 참고 이미지를 사용하여 "메카 폭스" 3D 모델을 생성해 줘:
- 아키텍처: H3.1, 표준 지오메트리, 60,000면, 4K PBR 텍스처
- review:false, submit:false 로 초안만 먼저 준비하고 아직 실행하지 마.
```

| 시나리오 | Codex에게 할 말 | 관련 기능 |
| --- | --- | --- |
| **🎮 엄격한 폴리곤 예산** | "이 이미지로 Smart Mesh P2 모델을 만들고 5,000면과 10,000면 변형 모델 초안을 준비해 줘." | Smart Mesh P2, 다중 변형 |
| **📐 다각도 일관 생성** | "첨부한 4장의 앞/뒤/좌/우 뷰 이미지를 사용해 단일 모델로 정합 생성해 줘." | 멀티뷰 3D 생성 |
| **🏃 본 리깅 및 모션** | "이 모델의 리깅 적합도를 확인하고, 언리얼 호환 본을 적용한 후 걷기 모션을 입혀줘." | Rig V3, 프리셋 모션 |
| **📦 에셋 그룹 정리** | "선택한 참고 이미지와 모델을 묶어서 '메카 폭스 · 게임 에셋' 그룹으로 정리해 줘." | 로컬 에셋 그룹화 |
| **🔍 생성 계통 역추적** | "이 모델이 어떤 원본 이미지와 파라미터로 생성되었는지 부모 작업 정보를 보여줘." | 작업 계통 추적 |
| **🚀 Blender 호환 배포** | "이 프로젝트를 Blender 프리셋, 2K 텍스처가 적용된 FBX로 내보내고 저장 경로를 알려줘." | FBX 내보내기, 패키징 |

---

## 5. 인터페이스 갤러리 (Showcase Gallery)

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <b>다크 모드 파라미터 설정 카드</b><br/>
      <img src="docs/images/configuration-dark.png" alt="다크 설정 카드" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>라이트 모드 파라미터 설정 카드</b><br/>
      <img src="docs/images/configuration-light.png" alt="라이트 설정 카드" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>다중 선택 및 일괄 그룹화 바</b><br/>
      <img src="docs/images/asset-multiselect.png" alt="다중 선택 바" width="100%" />
    </td>
    <td width="50%" align="center">
      <b>사이드바 반응형 레이아웃</b><br/>
      <img src="docs/images/workbench-japanese-narrow.png" alt="반응형 레이아웃" width="60%" />
    </td>
  </tr>
</table>

---

## 6. 사용 제한 및 엔지니어링 경계 (Engineering Boundaries)

- **검증 범위**: 본 플러그인은 Tripo Studio 웹 클라이언트 네트워크 프로토콜을 기반으로 구현되었습니다. 무료 동작 규약 검증은 보장되나 유료 작업은 실제 계정 잔여 크레딧에 따라 달라집니다.
- **내보내기 제한**: 모델 내보내기는 본인 소유 프로젝트에만 적용됩니다. 로컬 파일 확장자를 수동 변경해도 3D 포맷이 변환되지 않습니다.
- **로컬 처리 한계**: 로컬 Blender 처리는 150 MiB 이하의 자립형 GLB 파일로 제한됩니다. 리깅된 메쉬의 스키닝 보존을 위해 위상 구조 임의 변경은 차단됩니다.
- **계통 추적 범위**: 플러그인 외부(웹 브라우저 단독 조작 등)에서 이루어진 수정 작업은 로컬 작업 트리에 자동 역추적되지 않습니다.

---

## 7. 문서 내비게이션 (Documentation)

- 🛠️ **[전체 67개 도구 상세 인덱스 (docs/tools/README.md)](docs/tools/README.md)**
- ⚡ **[3D 생성 도구 상세 가이드 (docs/tools/generation.md)](docs/tools/generation.md)**
- 🔧 **[메쉬 및 텍스처 도구 가이드 (docs/tools/mesh-texture.md)](docs/tools/mesh-texture.md)**
- 🦴 **[본 리깅 및 AI 모션 가이드 (docs/tools/rigging-animation.md)](docs/tools/rigging-animation.md)**
- 🛠️ **[로컬 Blender 도구 가이드 (docs/tools/local-blender.md)](docs/tools/local-blender.md)**
- 📦 **[에셋, 작업 및 내보내기 가이드 (docs/tools/assets-tasks-export.md)](docs/tools/assets-tasks-export.md)**
- 📖 **[사용자 가이드 (docs/USAGE.md)](docs/USAGE.md)**
- ⚙️ **[환경 설정 가이드 (docs/CONFIGURATION.md)](docs/CONFIGURATION.md)**
- 💻 **[개발 및 기여 가이드 (CONTRIBUTING.md)](CONTRIBUTING.md)**
- 📦 **[배포 가이드 (docs/DISTRIBUTION.md)](docs/DISTRIBUTION.md)**

---

## 8. 라이선스 (License)

본 플러그인 매니페스트는 현재 `UNLICENSED`로 선언되어 있습니다. 오픈소스 라이선스가 부여되지 않았습니다. [.codex-plugin/plugin.json](.codex-plugin/plugin.json)을 참조하세요.
