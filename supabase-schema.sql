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

-- 감액 원본 xlsx는 Storage 버킷 'sheets'에 저장 (시드 스크립트가 자동 생성).
