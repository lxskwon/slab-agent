/**
 * 감액 파이프라인 로컬 실행 CLI.
 *   npm run writeoff
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runWriteoff } from "@/lib/pipelines/writeoff";
import { isSlabMocked } from "@/lib/slab/client";
import { isSpreadsheetMocked } from "@/lib/writeoff/spreadsheet";
import { hasSupabase } from "@/lib/db/client";
import { persistWriteoffRun } from "@/lib/db/repositories";
import { buildWriteoffWorkbook } from "@/lib/checklist/xlsx";

const FLAG: Record<string, string> = {
  "이미 반영됨": "🟢",
  "미반영": "🔴",
  "판단애매": "🟡",
};

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(`\n스프레드시트: ${isSpreadsheetMocked() ? "MOCK" : "Google Sheets"}`);
  console.log(`SLAB: ${isSlabMocked() ? "MOCK" : "REAL API"}`);
  console.log(`LLM: ${process.env.ANTHROPIC_API_KEY ? "Claude" : "미설정 → 판단애매"}\n`);

  const { judgments, summary } = await runWriteoff();

  for (const j of judgments) {
    console.log(
      `${FLAG[j.reflectionStatus] ?? ""} ${j.companyName.padEnd(6)} 시트=${(j.spreadsheetStatus ?? "-").padEnd(12)} SLAB=${(j.slabStatus ?? "-").padEnd(20)} → ${j.reflectionStatus}`,
    );
    console.log(`     └ ${j.reasoning}`);
  }
  console.log(
    `\n합계 ${summary.total} · 🟢이미반영 ${summary.reflected} · 🔴미반영 ${summary.notReflected} · 🟡판단애매 ${summary.ambiguous}`,
  );

  // 체크리스트 .xlsx 생성 (미반영=빨강, 판단애매=노랑)
  const now = new Date();
  const buf = await buildWriteoffWorkbook({ judgments, summary }, now.toLocaleString("ko-KR"));
  const outDir = path.join(process.cwd(), "output");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `감액_체크리스트_${now.toISOString().slice(0, 10)}.xlsx`);
  await writeFile(outPath, buf);
  console.log(`\n체크리스트 저장: ${outPath}`);

  if (!dry && hasSupabase()) {
    const { runId } = await persistWriteoffRun({ judgments, summary });
    console.log(`\n저장 완료 · run_id=${runId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
