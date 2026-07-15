import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 전용 Supabase 클라이언트 (service role).
 * NFR: service role 키는 서버에서만 사용, 클라이언트로 절대 노출 금지.
 * 환경변수가 없으면 null → 호출부에서 "미설정" 상태로 처리 (목업 라이브 모드로 동작).
 */
let cached: SupabaseClient | null | undefined;

export function getServiceClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function hasSupabase(): boolean {
  return getServiceClient() !== null;
}
