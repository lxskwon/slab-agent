// 로컬 data/를 Supabase로 1회 시드: interp → fund_interp 테이블, xlsx → Storage 버킷 'sheets'.
// 실행: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 를 넣고 `node scripts/seed-supabase.mjs`
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Supabase env 없음 (URL/SERVICE_ROLE_KEY)"); process.exit(1); }
const supa = createClient(url, key, { auth: { persistSession: false } });

// 버킷 보장
const BUCKET = "sheets";
const { data: buckets } = await supa.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
  const { error } = await supa.storage.createBucket(BUCKET, { public: false });
  if (error) { console.error("버킷 생성 실패:", error.message); process.exit(1); }
  console.log("버킷 생성:", BUCKET);
}

const dir = "data/writeoff-sheet";
const files = await readdir(dir).catch(() => []);
for (const f of files) {
  const full = path.join(dir, f);
  if (f.endsWith(".interp.json")) {
    const slug = f.replace(".interp.json", "");
    const data = JSON.parse(await readFile(full, "utf8"));
    const { error } = await supa.from("fund_interp").upsert({ fund: slug, data, updated_at: new Date().toISOString() });
    console.log("interp →", slug, error ? `FAIL ${error.message}` : "ok");
  } else if (f.endsWith(".xlsx")) {
    const slug = f.replace(".xlsx", "");
    const { error } = await supa.storage.from(BUCKET).upload(`${slug}.xlsx`, await readFile(full), {
      upsert: true, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    console.log("xlsx →", slug, error ? `FAIL ${error.message}` : "ok");
  }
}
console.log("seed-supabase done");
