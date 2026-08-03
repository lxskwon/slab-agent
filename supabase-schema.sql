-- SLAB 에이전트 Supabase 스키마.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- (접근 제어는 앱의 SITE_PASSWORD + service-role 키로 처리하므로 RLS는 꺼둠.
--  service-role 키는 서버에서만 사용됨 — 클라이언트로 노출 금지.)

-- 조치 필요 큐의 검토상태 + 메모
create table if not exists review_items (
  id text primary key,
  status text not null default 'open',
  memos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 펀드별 감액 시트 해석 결과
create table if not exists fund_interp (
  fund text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 등기부등본 판독 불가 건의 수기 입력 발행주식총수 (키 = 등기부 PDF URL)
create table if not exists registry_manual (
  url text primary key,
  shares bigint not null,
  issue_date text,
  author text,
  updated_at timestamptz not null default now()
);

-- 등기부등본 OCR 파싱 결과 캐시 (키 = 등기부 PDF URL). 런타임 자동 OCR 결과가 여기 쌓인다.
-- (기존 커밋 스냅샷 data/registry-cache.json 은 읽기 폴백으로 계속 사용됨)
create table if not exists registry_cache (
  url text primary key,
  share_count_total bigint,
  issue_date text,
  method text,
  confidence real,
  oversized boolean not null default false,
  updated_at timestamptz not null default now()
);

-- LLM 토큰/비용 사용 기록 (관리자 대시보드용). user는 예약어라 usr 사용.
create table if not exists llm_usage (
  id bigint generated always as identity primary key,
  feature text not null,
  model text not null,
  usr text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_creation_tokens bigint not null default 0,
  cost_usd double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists llm_usage_created_idx on llm_usage (created_at desc);

-- 감액 원본 xlsx는 Storage 버킷 'sheets'에 저장 (시드 스크립트가 자동 생성).
