-- SLAB 데이터 최신화 에이전트 — 초기 스키마 (Phase 0)
-- PRD §7 기반. runs 배치 테이블 + 인덱스 + updated_at 트리거 추가.

create extension if not exists "pgcrypto";

-- 기업 마스터
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- 실행 배치 (한 번의 "새로고침" = 하나의 run)
create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- 'followup' | 'writeoff'
  status text not null default 'running',   -- 'running' | 'completed' | 'failed'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  note text
);

-- SLAB 원본 스냅샷 (매 실행마다 새 row)
create table if not exists slab_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  share_count_total integer,          -- 발행주식총수
  investment_status text,             -- 투자유치여부: 투자완료/투자예정/해당없음/미확인
  writeoff_status text,               -- 감액 관련 SLAB 상태
  raw_response jsonb,                 -- API 원본 응답 (디버깅용)
  pulled_at timestamptz not null default now()
);

-- 등기부등본 파싱 결과
create table if not exists registry_extracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  file_name text,
  issue_date date,                    -- 발행일
  share_count_total integer,          -- 발행주식총수
  extraction_method text,             -- 'text' | 'ocr'
  confidence numeric,                 -- ocr인 경우 신뢰도 (0~1)
  extracted_at timestamptz not null default now()
);

-- 감액용 스프레드시트 상태
create table if not exists spreadsheet_statuses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  status text,                        -- Live / Written-off / Exit
  pulled_at timestamptz not null default now()
);

-- 후속투자 결과 (run + company 당 하나 → upsert)
create table if not exists followup_investment_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  run_id uuid not null references runs(id) on delete cascade,
  slab_share_count integer,
  registry_share_count integer,
  registry_issue_date date,
  investment_status text,
  match_status text,                  -- '일치' | '불일치' | '확인필요'
  extraction_method text,             -- 'text' | 'ocr'
  ocr_confidence numeric,
  followup_applicable text,           -- 'Y' | 'N' | null (불일치 시 사람이 채움)
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, company_id)
);

-- 감액 결과 (Phase 3)
create table if not exists writeoff_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  run_id uuid not null references runs(id) on delete cascade,
  spreadsheet_status text,
  slab_status text,
  reflection_status text,             -- '이미 반영됨' | '미반영' | '판단애매'
  llm_reasoning text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, company_id)
);

-- 감사 로그 (모든 상태 변경 기록)
create table if not exists review_history (
  id uuid primary key default gen_random_uuid(),
  result_table text not null,         -- 'followup_investment_results' | 'writeoff_results'
  result_id uuid not null,
  actor text not null,                -- 'agent' | 사람 이름
  action text not null,               -- 'auto_judged' | 'manually_overridden' | 'confirmed'
  old_value text,
  new_value text,
  note text,
  created_at timestamptz not null default now()
);

-- 인덱스
create index if not exists idx_slab_snapshots_company on slab_snapshots(company_id, pulled_at desc);
create index if not exists idx_registry_company on registry_extracts(company_id, extracted_at desc);
create index if not exists idx_followup_run on followup_investment_results(run_id);
create index if not exists idx_followup_company on followup_investment_results(company_id, created_at desc);
create index if not exists idx_writeoff_run on writeoff_results(run_id);
create index if not exists idx_history_result on review_history(result_table, result_id, created_at desc);
