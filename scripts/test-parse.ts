import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";
import { extractRegistryFields } from "@/lib/registry/parse";

async function main() {
  const path = process.argv[2];
  const buf = await readFile(path);
  const parsed = await pdfParse(buf);
  const perPage = parsed.text.trim().length / Math.max(1, parsed.numpages);
  console.log(`\n=== ${path.split("/").pop()} ===`);
  console.log(`pages=${parsed.numpages} textLen=${parsed.text.trim().length} perPage=${perPage.toFixed(1)}`);
  if (perPage < 40) {
    console.log("→ 스캔본으로 판정 (텍스트 없음) → Phase 2 OCR 필요");
    return;
  }
  const fields = extractRegistryFields(parsed.text);
  console.log("발행주식의 총수:", fields.shareCountTotal);
  console.log("후보(시간순):", fields.shareCandidates);
  console.log("문서일자:", fields.issueDate, `(${fields.matchedDateText})`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
