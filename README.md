# SLAB 데이터 최신화 에이전트

수작업 데이터 검증(**후속투자 판단**, **감액 판단**)을 자동화하는 내부 도구.
SLAB · 등기부등본 · 스프레드시트에서 값을 모아 비교하고, 사람은 대시보드에서
빨강(불일치/미반영)·노랑(판단애매)으로 플래그된 항목만 확인한다.

PRD: `../Downloads/SLAB_에이전트_PRD.md`

## 현재 구현 범위 (Phase 0 + 1)

- ✅ Supabase 스키마 (`supabase/migrations/0001_init.sql`)
- ✅ 후속투자 파이프라인: SLAB 발행주식총수 ↔ 등기부등본 발행주식총수 **exact match**
- ✅ 등기부등본 **텍스트 PDF** 파서 (발행주식총수 · 발행일, 말소 항목 제외)
- ✅ **스캔 PDF OCR** (Phase 2): GPT 비전(gpt-4.1)으로 취소선(말소) 시각 판독 → 현재 유효 발행주식총수 추출 + confidence
- ✅ **감액 파이프라인 (Phase 3)**: 스프레드시트 상태 ↔ SLAB 상태를 **GPT LLM**이 비교 → 이미 반영됨/미반영/판단애매 + 근거 (표현이 달라도 의미로 판단)
- ✅ 대시보드: 개요 · 후속투자 리뷰 · 감액 리뷰(색상 플래그, LLM 근거, 확인, 필터/검색) · "지금 새로고침"(두 파이프라인 실행)
- ✅ 감사 로그(review_history) 자동 기록

### 인터페이스만 있고 아직 목업/스텁 (다음 Phase)

| 항목 | 상태 | 파일 |
|---|---|---|
| SLAB API (실데이터) | 목업 — API 스펙 확정 후 `RealSlabClient` 구현 | `lib/slab/client.ts` |
| 감액 스프레드시트 (실데이터) | 목업 — Google 서비스 계정 확보 후 `GoogleSheetsSource` 구현 | `lib/writeoff/spreadsheet.ts` |

감액 LLM 판단은 실제로 동작한다(`lib/writeoff/judge.ts`, `gpt-4.1-mini`) — 목업은 스프레드시트·SLAB 상태값뿐이다.

OCR은 `OPENAI_API_KEY`가 설정돼 있으면 스캔본에 자동 실행된다(`lib/registry/ocr.ts`, 모델 `gpt-4.1`). 키가 없으면 스캔본은 confidence 0("재확인 필요")로 표시된다.

## 빠른 시작

```bash
npm install
npm run followup        # 목업 데이터로 후속투자 판정 결과 출력 (DB 불필요)
npm run dev             # 대시보드 → http://localhost:3200
```

Supabase 없이도 대시보드는 **라이브 프리뷰 모드**(목업 실시간 판정)로 동작한다.
Y/N 입력·저장·히스토리는 Supabase 연결 후 활성화된다.

## Supabase 연결 (저장 활성화)

1. Supabase 프로젝트 생성 후 `supabase/migrations/0001_init.sql` 실행
   (SQL Editor에 붙여넣거나 `supabase db push`)
2. `.env.example` → `.env.local` 복사 후 값 채우기:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (서버 전용, 클라이언트 노출 금지)
3. `npm run followup` 또는 대시보드 "지금 새로고침" → 결과가 저장되고 Y/N 입력 가능

## 실제 데이터 붙이기

- **등기부등본**: `data/registry-samples/` 에 PDF를 넣으면 자동 파싱된다.
  파일명에 기업명을 포함시킬 것 (예: `알파테크_등기부등본.pdf`).
  실제 샘플로 `lib/registry/parse.ts`의 정규식을 보정할 것.
- **SLAB API**: 스펙 확정 후 `.env`에 `SLAB_API_BASE_URL`/`SLAB_API_KEY` 설정하고
  `lib/slab/client.ts`의 `RealSlabClient` TODO를 채운다.

## 확정 필요 (PRD §11 open questions)

1. **SLAB API** 인증 방식/엔드포인트/rate limit → `RealSlabClient`
2. **등기부등본** 파일 저장 위치, 새 파일 인지 방식
3. **감액 스프레드시트**: Google Sheets 확정
   (`1VUNVEdrZnB-9azEUagTtTLbNB0ol_hPnHkfyxjrNuiA`) → 서비스 계정 권한 필요
4. 불일치 시 Y/N 판단 로직 (현재: 빨간 플래그 후 사람이 입력)
5. 처리 규모/실행 주기 (Phase 5 cron)
6. 대시보드 접근/오버라이드 권한 (Supabase Auth — 미구현)

## 구조

```
supabase/migrations/  DB 스키마
lib/slab/             SLAB 클라이언트 (interface + mock + real stub)
lib/registry/         등기부등본 파서 + 소스
lib/pipelines/        후속투자 판정 로직
lib/db/               Supabase 클라이언트 + repositories
app/                  대시보드 (App Router) + /api/refresh, /api/followup
scripts/              CLI 실행기
```
