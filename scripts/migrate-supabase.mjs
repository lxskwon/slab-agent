// 개인 Supabase → 회사(Sparkai) Supabase 1회 마이그레이션.
// 테이블 3개(review_items, fund_interp, registry_manual) + Storage 버킷 'sheets' 전체 복사.
//
// 사전: 새 프로젝트 SQL Editor에서 supabase-schema.sql 실행(테이블 생성) 완료.
//
// 실행:
//   OLD_SUPABASE_URL=... OLD_SUPABASE_SERVICE_ROLE_KEY=... \
//   NEW_SUPABASE_URL=... NEW_SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/migrate-supabase.mjs
//
// 안전: upsert(멱등)라 재실행해도 중복 안 생김. 새 DB의 기존 데이터는 같은 키만 덮어씀.
import { createClient } from "@supabase/supabase-js";

const OLD_URL = process.env.OLD_SUPABASE_URL;
const OLD_KEY = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const NEW_URL = process.env.NEW_SUPABASE_URL;
const NEW_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error("env 4개 필요: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (OLD_URL === NEW_URL) {
  console.error("OLD과 NEW URL이 같습니다. 확인하세요.");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const oldDb = createClient(OLD_URL, OLD_KEY, opts);
const newDb = createClient(NEW_URL, NEW_KEY, opts);
const BUCKET = "sheets";

// ── 테이블 복사 (전체 읽어서 새 DB에 upsert) ──
async function copyTable(table, conflictKey) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await oldDb.from(table).select("*").range(from, from + pageSize - 1);
    if (error) { console.error(`  [${table}] 읽기 실패:`, error.message); return; }
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  if (rows.length === 0) { console.log(`  [${table}] 0건 (건너뜀)`); return; }
  const { error } = await newDb.from(table).upsert(rows, { onConflict: conflictKey });
  console.log(`  [${table}] ${rows.length}건 →`, error ? `FAIL ${error.message}` : "ok");
}

// ── Storage 버킷 복사 ──
async function ensureBucket() {
  const { data: buckets } = await newDb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await newDb.storage.createBucket(BUCKET, { public: false });
    if (error) { console.error("  버킷 생성 실패:", error.message); return; }
    console.log("  버킷 생성:", BUCKET);
  }
}
async function copyStorage() {
  const { data: files, error } = await oldDb.storage.from(BUCKET).list("", { limit: 1000 });
  if (error) { console.error("  [storage] 목록 실패:", error.message); return; }
  const real = (files ?? []).filter((f) => f.id); // 폴더 placeholder 제외
  if (real.length === 0) { console.log("  [storage] 파일 0개"); return; }
  for (const f of real) {
    const { data: blob, error: dlErr } = await oldDb.storage.from(BUCKET).download(f.name);
    if (dlErr) { console.log(`  [storage] ${f.name} 다운로드 FAIL ${dlErr.message}`); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const { error: upErr } = await newDb.storage.from(BUCKET).upload(f.name, buf, {
      upsert: true,
      contentType: f.metadata?.mimetype || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    console.log(`  [storage] ${f.name} →`, upErr ? `FAIL ${upErr.message}` : "ok");
  }
}

console.log("== 테이블 복사 ==");
await copyTable("review_items", "id");
await copyTable("fund_interp", "fund");
await copyTable("registry_manual", "url");

console.log("== Storage 복사 ==");
await ensureBucket();
await copyStorage();

console.log("migrate-supabase done ✅");
