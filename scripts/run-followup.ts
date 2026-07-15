/**
 * 후속투자 파이프라인 로컬 실행 CLI.
 *   npm run followup            # 판정 결과 출력 (Supabase 있으면 저장까지)
 *   npm run followup -- --dry   # 저장 없이 출력만
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runFollowup } from "@/lib/pipelines/followup";
import { isSlabMocked } from "@/lib/slab/client";
import { hasSupabase } from "@/lib/db/client";
import { persistFollowupRun } from "@/lib/db/repositories";
import { buildFollowupWorkbook } from "@/lib/checklist/xlsx";

const FLAG: Record<string, string> = {
  일치: "🟢",
  불일치: "🔴",
  확인필요: "⚪",
};

async function main() {
  const dry = process.argv.includes("--dry");

  console.log(`\nSLAB 소스: ${isSlabMocked() ? "MOCK (API 미설정)" : "REAL API"}`);
  console.log(`Supabase: ${hasSupabase() ? "연결됨" : "미설정 (저장 생략)"}\n`);

  const { judgments, summary } = await runFollowup();

  for (const j of judgments) {
    const flag = FLAG[j.matchStatus] ?? "";
    const ocr =
      j.extractionMethod === "ocr"
        ? ` [OCR ${Math.round((j.ocrConfidence ?? 0) * 100)}%]`
        : "";
    console.log(
      `${flag} ${j.companyName.padEnd(8)} SLAB=${String(j.slabShareCount ?? "-").padStart(9)}  등기부=${String(
        j.registryShareCount ?? "-",
      ).padStart(9)}  → ${j.matchStatus}${j.followupApplicable ? ` (${j.followupApplicable})` : ""}${ocr}`,
    );
  }

  console.log(
    `\n합계 ${summary.total} · 🟢일치 ${summary.matched} · 🔴불일치 ${summary.mismatched} · ⚪확인필요 ${summary.needsCheck} · OCR재확인 ${summary.lowConfidenceOcr}`,
  );

  // 체크리스트 .xlsx 생성 (불일치=빨강, 확인필요=회색)
  const now = new Date();
  const buf = await buildFollowupWorkbook({ judgments, summary }, now.toLocaleString("ko-KR"));
  const outDir = path.join(process.cwd(), "output");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `후속투자_체크리스트_${now.toISOString().slice(0, 10)}.xlsx`);
  await writeFile(outPath, buf);
  console.log(`\n체크리스트 저장: ${outPath}`);

  if (!dry && hasSupabase()) {
    const { runId } = await persistFollowupRun({ judgments, summary });
    console.log(`\n저장 완료 · run_id=${runId}`);
  } else if (!dry) {
    console.log("\n(Supabase 미설정 → 저장 생략. .env에 키를 넣으면 저장됩니다.)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
