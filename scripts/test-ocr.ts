import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extractViaVision } from "@/lib/registry/ocr";

// 사용법: OPENAI_API_KEY 설정 후  `npx tsx scripts/test-ocr.ts <등기부.pdf>`
// 실제 프로덕션 OCR 경로(gpt-4.1)를 그대로 태워 결과를 확인한다.
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("PDF 경로를 인자로 넘겨주세요.");
  const buf = await readFile(path);
  const res = await extractViaVision(buf, "테스트기업", path);
  console.log(JSON.stringify(res, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
