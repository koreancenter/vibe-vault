# Vibe Vault (✦)

> **스위스 프라이빗 뱅킹 감성의 로컬 퍼스트 다중 통화 자산 관리 & 행사 결산 금고**  
> *Private, On-Device, Multi-Currency Financial Command Center & Event Settlement Safe.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.1-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Web Crypto API](https://img.shields.io/badge/Cryptography-AES--GCM--256-white?logo=lock&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
[![Storage](https://img.shields.io/badge/Storage-IndexedDB_Local--First-4A90E2)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline_First-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

---

## ✦ Overview

**Vibe Vault**는 서버로 사용자의 금융 데이터를 단 한 줄도 전송하지 않는 **100% 로컬 퍼스트(Local-First)** 프라이빗 자산 금고이자 하이엔드 회계 장부 웹 애플리케이션입니다.

스위스 독립 시계 공방의 정밀함과 하이엔드 프라이빗 뱅킹의 절제미(*Haute Horlogerie & Stealth Wealth*)를 디자인 모티프로 삼아 탄생했습니다. 일상적인 계좌·카드·투자 포트폴리오 관리뿐만 아니라, **동창회 여행·동호회 행사·프로젝트 모임** 등 한시적인 활동의 지출을 일상 가계부와 완벽히 격리하여 관리하고, 인쇄 가능한 **한국식 표준 결산서(Running Balance)**를 즉시 출력·정산할 수 있습니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             VIBE VAULT ECOSYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [ PRIVATE ASSET VAULT ]     [ EVENT LEDGER SPACES ]     [ HYBRID OMNIBAR ] │
│  - Multi-Currency Treasury   - Episodic Space Isolation  - Regex + Gemini   │
│  - Multi-Brokerage Net Worth - Korean Running Balance    - WebGPU (WebLLM)  │
│  - AES-GCM Zero-Knowledge    - A4 Printable Settlement   - Cam Vision OCR   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✦ Core Pillars & Architectural Highlights

### 1. 로컬 퍼스트 제로 놀리지 프라이버시 (Zero-Knowledge Privacy)
- **100% On-Device IndexedDB**: 모든 자산 내역, 지출 영수증, 거래 장부는 브라우저 내부 `IndexedDB`(`vibe-vault-db`)에만 저장됩니다. 외부 클라우드 데이터베이스로의 비인가 데이터 동기화가 원천 차단됩니다.
- **하드웨어 급 Web Crypto 암호화**:
  - **대칭키 암호화**: `AES-GCM-256`(Authenticated Encryption with Associated Data, 128-bit MAC Tag).
  - **키 유도 함수(KDF)**: `PBKDF2-SHA-256` (마스터 PIN 인증 100,000회 / 휴대용 백업 600,000회 라운드 적용으로 GPU/ASIC 브루트포스 차단).
  - **Non-Extractable Master Key**: 디바이스 마스터 키는 `{ extractable: false }` 속성으로 격리 키스토어(`vibe-vault-keystore`)에 보관되어 자바스크립트 콘솔이나 악성 스크립트의 탈취를 방지합니다.
- **휘발성 메모리 생명주기 관리**: 화면 잠금(PIN Lock), 지정된 유휴 시간(Inactivity Timeout), 브라우저 탭 비활성화(`visibilitychange: hidden`) 감지 시 메모리 내 복호화 키를 즉각 소멸(Purge)시킵니다.
- **게스트 세션 완벽 위생 처리**: 둘러보기 모드 종료 시 브라우저 캐시 및 서비스 워커 스토리지를 흔적 없이 초기화합니다.

### 2. 다중 통화 글로벌 트레저리 (Multi-Currency Global Treasury)
- **전 세계 주요 통화 네이티브 지원**:
  - 원화(KRW), 미국 달러(USD), 유로(EUR), 일본 엔(JPY), 영국 파운드(GBP), 인도네시아 루피아(IDR), 중국 위안(CNY), 스위스 프랑(CHF), 캐나다 달러(CAD), 호주 달러(AUD), 싱가포르 달러(SGD), 홍콩 달러(HKD), 태국 바트(THB), 베트남 동(VND), 대만 달러(TWD) 등.
- **실시간 환율 연동 및 기준 통화 환산**: 실시간 외환 환율(`/api/fx-rates`)을 동기화하여 해외 결제 및 다국적 자산을 사용자의 기준 통화(Base Currency)로 자동 통합 평가합니다.
- **다중 계좌·다양한 자산군 분류**: 증권사 주식(국내/해외), 은행 예적금, 가상자산, 부동산, 현금, 부채/대출 계좌를 단일 뷰에서 실시간으로 산출합니다.

### 3. 프로젝트 및 행사 장부 공간 분리 (Ledger Spaces)
- **일상 장부와 행사 지출의 완전한 격리**:
  - 제주도 동창회 3박 4일 여행, 가족 유럽 휴가, 스터디 모임 회비 등 특정 이벤트 장부(`spaceId`)를 생성하여 일상 생활비 통계가 왜곡되는 현상을 근본적으로 방지합니다.
- **공간별 독립 메타데이터**:
  - 장부별 전용 통화(예: 유럽 여행 장부는 `EUR`, 발리 휴가는 `IDR`), 목표 예산, 참가자 수(N명), 진행 기간(시작일~종료일)을 독립 구성할 수 있습니다.
- **공간 간 즉시 전환**: 상단 헤더 칩을 통해 `일상 장부`와 각 프로젝트 장부 간 1초 이내 전환이 가능합니다.

### 4. 한국식 표준 결산서 인쇄 & 정산 시스템 (Printable Settlement Statement)
- **표준 누적 잔액(Running Balance) 회계 서식**:
  - `번호 | 날짜 | 항목(구분) | 내역 | 수입(회비 등) | 지출 | 누적 잔액 | 비고` 체계의 정통 결산 서식 지원.
- **스마트 N분의 1 균등 분담금 계산기**:
  - 총 지출액, 총 수입액, 최종 잔액, 인원수(N명)를 기반으로 **1인당 최종 분담금**을 자동 계산.
  - 회비 선납 여부에 따른 **최종 환급액(+) 또는 1인당 추가 납부액(-)**을 즉시 브리핑.
- **인쇄 최적화 `@media print` 스타일시트**:
  - 모달 윈도우에서 `인쇄 / PDF 저장` 클릭 시 웹 내비게이션, 버튼, 배경 노이즈를 완전 제거.
  - A4 용지 규격에 완벽히 맞춘 흑백 고대비 인쇄 레이아웃, 표 헤더 자동 반복, 깔끔한 페이지 분할(`page-break-inside: avoid`).
- **Excel 호환 UTF-8 BOM CSV 내보내기**:
  - 한글 깨짐 없이 Microsoft Excel과 한글과컴퓨터에서 즉시 열람 가능한 `\uFEFF` BOM 포함 CSV 다운로드 지원.

### 5. 2단계 하이브리드 지능형 파싱 (Two-Tier Hybrid Omnibar)
- **Tier 1: 결정론적 정규식 파서 (Zero-Latency & 100% Offline)**
  - 한국어 복합 수사 단위 처리: `억`, `만`, `만원`, `천`, `천원`, `k`, `m` 자동 정규화.
  - 더치페이 및 산술 연산 자동 인식: `민수랑 파스타 4만원 더치페이하고 2만원 받음` 입력 시 실지출 20,000원 + 채권 회수 자동 분리.
  - 다중 품목 동시 결제 분할: `쿠팡 화장지 2만, 영양제 3만` 입력 시 2건의 독립 거래 자동 생성.
- **Tier 2: AI 파싱 엔진 (Gemini Flash & On-Device WebGPU)**
  - 서버 측 Gemini API (`gemini-3.8-flash` / `gemini-2.5-flash`)를 통한 정밀 카테고리 추론.
  - 완전 오프라인 환경을 위한 **온디바이스 WebGPU WebLLM (Gemma 2B)** 구동 지원.
- **영수증 카메라 OCR & 프라이버시 마스킹**:
  - 영수증 촬영 시 클라이언트 캔버스 단에서 카드 번호·계좌 번호·주민번호 등 PII(개인식별정보)를 사전 마스킹한 후 품목별 영수증 내역을 정밀 추출.

---

## ✦ Design System: Haute Horlogerie & Obsidian Black

Vibe Vault는 시각적 공해와 장식적 요소를 배제하고 본질적인 숫자의 정밀함과 보안성에 집중합니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OBSIDIAN DESIGN SPECIFICATIONS                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Base Canvas        │  #08090C / #090A0D (Deep Obsidian Vault)              │
│  Elevated Surface   │  #111217 with backdrop-blur-2xl (Smoked Glass)        │
│  Hairline Borders   │  border-white/[0.07] (Ultra-thin 1px Subpixel)        │
│  Primary Typography │  #FFFFFF (Pure Platinum White, tabular-nums)          │
│  Muted Signals      │  Inflow: #34D399 (Emerald) · Caution: #FBBF24 (Amber) │
│  Deficit Alert      │  #FB7185 (Rose) · Critical: #F43F5E                   │
│  Zero-Pill Rule     │  No candy pills; quiet inline text with (·) separator │
│  Nested Radii       │  r_inner = max(0, r_outer - padding)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **모바일 네이티브 스와이프 제스처**:
  - 하단 및 메인 뷰포트에서 좌우 스와이프 터치 제스처를 통해 `자산(Vault)` ⇄ `인사이트(Insights)` ⇄ `장부(Ledger)` 3대 코어 스크린을 유기적으로 전환할 수 있습니다.
- **스텔스 모드 (Privacy Blind)**:
  - 공공장소나 대중교통 이용 시 클릭 한 번으로 모든 잔액 및 금액을 블러 처리(`***`)하는 프라이버시 보호 기능 탑재.

---

## ✦ System Architecture

```
[ Client Application: React 19 + TypeScript + Tailwind v4 + PWA ]
  │
  ├── UI Shell & Navigation (Single-Surface Flat Architecture)
  │    ├── 자산 금고 뷰 (VaultOverviewSection, SmartAssetSetup)
  │    ├── 재무 인사이트 (InsightsSection, CategoryDonutChart, MonthlyTrendsChart)
  │    ├── 스마트 장부 (Omnibar, TransactionList, SubscriptionManager)
  │    └── 행사 결산 모달 (EventSettlementReportModal - Running Balance Print)
  │
  ├── On-Device Security & State Layer
  │    ├── IndexedDB (vibe-vault-db: transactions, accounts, spaces, debts)
  │    ├── Isolated Keystore (vibe-vault-keystore: non-extractable CryptoKey)
  │    ├── Vault Lock & PIN Subsystem (PBKDF2-SHA-256 + AES-GCM-256)
  │    └── Cryptographic Backup Engine (VVLT_V1 600,000 PBKDF2 Rounds)
  │
  ├── Intelligent Input Processing
  │    ├── Client Deterministic Regex Normalizer (Korean Currency & Dutch-pay)
  │    ├── Client Canvas PII Sanitizer (Receipt Image Preprocessing)
  │    └── WebGPU Local Inference Engine (WebLLM Gemma 2B - Optional Offline)
  │
  ▼ [HTTP Proxy / REST API]
[ Node.js + Express Backend Proxy: server.ts (Port 3000) ]
  ├── /api/parse             ───► Gemini 3.8 Flash NLP Parser
  ├── /api/parse-receipt     ───► Gemini Vision Multimodal Receipt Parser
  ├── /api/parse-assets      ───► Bank SMS & Statement Asset Extraction
  └── /api/fx-rates          ───► Multi-Currency Real-Time Exchange Provider
```

---

## ✦ Technical Stack

| Layer | Technologies |
|---|---|
| **Core Framework** | React 19, TypeScript 5.8, Vite 6 |
| **Styling & Design** | Tailwind CSS v4, Motion 12, Lucide Icons, Tabular Numbers |
| **Local Storage** | Browser IndexedDB (`idb` v8), LocalStorage (비식별 사용자 환경설정) |
| **Cryptography** | Web Crypto API (`AES-GCM-256`, `PBKDF2-SHA-256`, 100k~600k Iterations) |
| **Data Visualization** | Recharts v3, D3.js v7 |
| **AI / Machine Learning** | Google Gemini API (`@google/genai` Flash), WebGPU WebLLM |
| **Server Proxy** | Express v4, TSX (Node.js 22/20) |
| **PWA & Offline** | Vite Plugin PWA, Workbox Service Worker, Web App Manifest |
| **Testing** | Vitest v5 (Unit & Cryptographic Security Regression Suites) |

---

## ✦ Getting Started

### 1. Prerequisites
- **Node.js**: v20.18.0 이상 (v22 권장)
- **Package Manager**: `npm` v10+ 또는 `pnpm`

### 2. Installation
```bash
# 레포지토리 복제
git clone https://github.com/koreancenter/vibe-vault.git

# 프로젝트 디렉터리 이동
cd vibe-vault

# 의존성 패키지 설치
npm install
```

### 3. Environment Configuration
프로젝트 루트의 `.env.example`을 복사하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

클라우드 기반 Gemini AI 파싱 및 영수증 비전 OCR 기능을 활용하려면 API 키를 입력합니다 (온디바이스 정규식 모드 또는 WebGPU 온디바이스 모드 사용 시 생략 가능):

```env
# Gemini API Key (Server-side proxy)
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Running the Development Server
Express 백엔드 프록시와 Vite 프론트엔드가 통합 구동됩니다:

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### 5. Running Tests & Quality Verification
암호화 무결성, 오프라인 정규식 파서, PII 마스킹, 캐시 격리 테스트를 실행합니다:

```bash
# 전체 테스트 스위트 실행
npm run test

# 타입스크립트 타입 무결성 검증
npm run lint

# 프로덕션 빌드 번들링
npm run build
```

---

## ✦ Cryptographic Backup Specification (`VVLT_V1`)

Vibe Vault는 데이터 백업 시 일반 평문 JSON 내보내기 외에, 군사 등급 보안을 제공하는 자체 암호화 백업 포맷(`VVLT_V1`)을 지원합니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     VVLT_V1 ENCRYPTED BACKUP STRUCTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Magic Header       │  "VVLT_V1" (7 ASCII bytes)                            │
│  Algorithm ID       │  0x01 (PBKDF2-SHA-256 + AES-GCM-256) (1 byte)         │
│  Iterations         │  600,000 rounds (4 bytes Big-Endian)                  │
│  Salt               │  16 bytes CSPRNG (128 bits)                           │
│  Initialization Vec │  12 bytes Nonce (96 bits)                             │
│  Ciphertext + Tag   │  AES-256-GCM Encrypted JSON + 128-bit Auth Tag        │
└─────────────────────────────────────────────────────────────────────────────┘
```

백업 파일 복원 시 사용자의 패스프레이즈가 일치하지 않거나 1비트라도 데이터가 변조된 경우 복호화가 실패(`TAMPERED_PAYLOAD` 또는 `INVALID_PASSWORD`)하여 데이터의 무결성을 보장합니다.

---

## ✦ PWA & Offline Installation

1. **데스크톱 (Chrome / Edge / Safari)**: 주소창 우측의 '설치' 아이콘 또는 앱 내비게이션의 `PWA 설치` 버튼을 클릭합니다.
2. **모바일 (iOS Safari)**: '공유' 버튼 → '홈 화면에 추가'를 탭합니다.
3. **모바일 (Android Chrome)**: 옵션 메뉴 → '앱 설치'를 선택합니다.
4. 설치 후 네트워크 연결이 끊긴 오프라인 환경에서도 모든 자산 입력, 장부 작성, 결산서 인쇄가 온디바이스에서 원활하게 작동합니다.

---

## ✦ License

Distributed under the MIT License for sovereign personal financial autonomy.  
Designed & Engineered with absolute privacy by the Vibe Vault Core Team.

---

## ✦ Maintainer & Organization
- **Organization**: 한국센터글로벌네트워크 지식관리실
- **Inquiries**: master@goguma.app
- **Copyright**: © 2026 한국센터글로벌네트워크 지식관리실. All rights reserved.

## ✦ Security & Billing Disclaimer
- **Client-Side API Key Storage**: 사용자가 등록한 Gemini API 키는 오직 브라우저 내부(IndexedDB/LocalStorage)에만 암호화 및 격리 저장되며, 외부 제3자 서버로 수집되거나 재전송되지 않습니다.
- **Direct HTTPS Communication**: 모든 인공지능 분석 및 영수증 OCR 요청은 사용자의 클라이언트 브라우저에서 Google AI Studio / Google Cloud 공식 엔드포인트로 직접 HTTPS 통신합니다.
- **Zero Third-Party Billing Liability**: Google AI Studio 또는 Google Cloud Platform(GCP)에서 발생하는 모든 API 사용료 및 과금 청구액은 전적으로 사용자 본인의 Google 계정에 직접 부과됩니다. Vibe Vault 및 운영 주체(한국센터글로벌네트워크 지식관리실)는 사용자의 API 호출량 및 이로 인해 발생하는 일체의 제3자 과금·비용에 대해 어떠한 대리 결제나 법적·재정적 책임을 부담하지 않습니다.
