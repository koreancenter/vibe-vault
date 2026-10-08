# Vibe Vault (✦)

> **스위스 프라이빗 뱅킹 감성의 로컬 퍼스트 다중 통화 자산 관리 & 행사 결산 금고**  
> *Private, On-Device, Multi-Currency Financial Command Center & Event Settlement PWA.*

---

## ✦ Overview

**Vibe Vault**는 서버로 금융 데이터를 단 한 줄도 전송하지 않는 **100% 로컬 퍼스트(Local-First)** 프라이빗 자산 금고이자 회계 장부 PWA입니다.  
일상적인 자산/생활비 관리뿐만 아니라, **동창회 여행·프로젝트 모임** 등 한시적 행사의 지출을 일상 지출과 철저히 분리하여 기록하고 **한국식 표준 결산서(Running Balance)**로 즉시 출력·정산할 수 있습니다.

---

## ✦ Key Features

### 1. 프라이빗 자산 관리 (Private Wealth Vault)
- **Zero-Server Privacy**: 모든 데이터는 기기 내부 `IndexedDB`에 로컬 저장되며, AES-GCM 및 마스터 PIN으로 강력하게 보호됩니다.
- **다중 통화 (Multi-Currency)**: 원화(KRW), 인도네시아 루피아(IDR), 달러(USD), 유로(EUR) 등 다중 통화를 실시간 환율과 연동하여 통합 순자산으로 환산합니다.
- **모바일 네이티브 스와이프 UX**: `자산` ⇄ `인사이트` ⇄ `장부` 간 부드러운 수평 터치 스와이프 제스처를 지원합니다.

### 2. 프로젝트 및 행사 장부 (Event Vault Mode)
- **일상 장부와 행사 지출 격리**: 7박 8일 동창회 여행, 가족 휴가 등 한시적 프로젝트 장부를 생성하여 일상 생활비 통계 왜곡 없이 독립적으로 운영합니다.
- **한국식 표준 결산서 인쇄/PDF (`@media print`)**:
  - `번호 | 날짜 | 항목 | 내역 | 수입 | 지출 | 잔액(누적) | 비고` 표준 서식 지원.
  - 회원 수(N명)에 따른 **1인당 분담금 및 최종 환급/추가 납부액 자동 계산기** 탑재.
  - A4 인쇄 최적화 및 UTF-8 BOM 엑셀 CSV 내보내기 지원.

### 3. 지능형 파싱 & 온디바이스 AI
- **자연어 복합 지출 파싱**: 다중 품목 및 더치페이/N분의 1 산술 연산 자동 인식.
- **영수증 카메라 OCR**: 오프라인 또는 클라우드 Gemini Vision을 통한 영수증 즉시 캡처.
- **하이브리드 AI 엔진**: 초경량 클라우드 Gemini API 또는 기기 메모리에서 완전 오프라인으로 구동되는 온디바이스 WebGPU(WebLLM) 선택 가능.

---

## ✦ Design System: Quiet Luxury

- **Theme**: 무광 흑연 및 옵시디언 블랙 (`#08090C`, `#0D0F14`)
- **Aesthetic**: 불투명하고 탁한 박스 중첩(Box-in-Box)을 배제하고, 섬세한 헤어라인 광택(`border-white/[0.06]`)과 맑은 스모키 글래스 질감 적용.
- **Typography**: 해상도에 유동적으로 스케일링되는 Fluid Typography (`clamp()`) 적용.

---

## ✦ Tech Stack

- **Core**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, CSS Clamp Variables
- **Storage**: Browser IndexedDB, Web Crypto API (AES-GCM / PBKDF2)
- **AI / OCR**: WebGPU (WebLLM - Gemma 2B), Google Gemini Flash API, Tesseract OCR
- **Platform**: Progressive Web App (PWA) with Offline Service Worker

---

## ✦ Getting Started

### 1. Installation & Setup
```bash
git clone [https://github.com/koreancenter/vibe-vault.git](https://github.com/koreancenter/vibe-vault.git)
cd vibe-vault
npm install

### 2. Environment Configuration

Bash
cp .env.example .env
필요한 경우 .env 파일에 Gemini API 키를 입력합니다 (온디바이스 모드 단독 사용 시 생략 가능):

코드 스니펫
GEMINI_API_KEY=your_gemini_api_key_here

### 3. Local Development

Bash
npm run dev

### 4. Production Build & Audit

Bash
npm run build
npm run preview
✦ License
Private & Open-source for personal financial autonomy.