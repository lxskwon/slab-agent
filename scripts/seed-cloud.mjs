// 로컬 data/를 클라우드 스토어로 1회 시드: interp → Upstash Redis, xlsx → Vercel Blob.
// 실행: 프로비저닝 후 아래 env를 넣고 `node scripts/seed-cloud.mjs`
//   KV_REST_API_URL / KV_REST_API_TOKEN (또는 UPSTASH_REDIS_REST_URL/TOKEN)
//   BLOB_READ_WRITE_TOKEN
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) { console.error("Redis env 없음"); process.exit(1); }
const redis = new Redis({ url, token });

const dir = "data/writeoff-sheet";
const files = await readdir(dir).catch(() => []);
for (const f of files) {
  const full = path.join(dir, f);
  if (f.endsWith(".interp.json")) {
    const slug = f.replace(".interp.json", "");
    await redis.set(`slab:interp:${slug}`, JSON.parse(await readFile(full, "utf8")));
    console.log("interp →", slug);
  } else if (f.endsWith(".xlsx")) {
    const slug = f.replace(".xlsx", "");
    const { url: blobUrl } = await put(`sheets/${slug}.xlsx`, await readFile(full), {
      access: "public", addRandomSuffix: false, allowOverwrite: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await redis.set(`slab:sheeturl:${slug}`, blobUrl);
    console.log("xlsx →", slug);
  }
}
console.log("seed-cloud done");
