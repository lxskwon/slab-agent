// 배포 첫 부팅 시 seed/ → data/ 로 읽기전용 캐시를 복사 (영구 볼륨이 비어 있을 때만).
// 이미 data/가 채워져 있으면(누적된 메모/업로드 보존) 건너뛴다.
import { cp, mkdir, access } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const dataDir = path.join(cwd, "data");
const seedDir = path.join(cwd, "seed");
const marker = path.join(dataDir, "registry-cache.json");

try {
  await access(marker);
  console.log("[seed] data/ already present — skip");
} catch {
  await mkdir(dataDir, { recursive: true });
  try {
    await cp(seedDir, dataDir, { recursive: true });
    console.log("[seed] seeded data/ from seed/");
  } catch (e) {
    console.log("[seed] seed skipped:", e.message);
  }
}
