import ExcelJS from "exceljs";
import type { FollowupRunResult } from "@/lib/pipelines/followup";
import type { WriteoffRunResult } from "@/lib/pipelines/writeoff";

/**
 * 체크리스트 Excel(.xlsx) 생성 — 색상 셀로 플래그.
 * 후속투자: 불일치 = 빨강 / 확인필요 = 연회색
 * 감액: 미반영 = 빨강 / 판단애매 = 노랑 / 이미 반영됨 = 연초록
 */

// ARGB 색상 (Excel 표준 톤)
const RED_FILL = "FFFFC7CE";
const RED_TEXT = "FF9C0006";
const YELLOW_FILL = "FFFFEB9C";
const YELLOW_TEXT = "FF9C6500";
const GREEN_FILL = "FFC6EFCE";
const GREEN_TEXT = "FF006100";
const GRAY_FILL = "FFE7E6E6";
const HEADER_FILL = "FF1F2937";

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(HEADER_FILL);
    cell.alignment = { vertical: "middle" };
  });
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, generatedAt: string, summaryLine: string) {
  const t = ws.addRow([title]);
  t.getCell(1).font = { bold: true, size: 14 };
  ws.addRow([`생성: ${generatedAt}`]).getCell(1).font = { color: { argb: "FF6B7280" }, size: 10 };
  ws.addRow([summaryLine]).getCell(1).font = { color: { argb: "FF6B7280" }, size: 10 };
  ws.addRow([]);
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

export async function buildFollowupWorkbook(
  result: FollowupRunResult,
  generatedAt: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("후속투자");

  const s = result.summary;
  titleBlock(
    ws,
    "후속투자 체크리스트",
    generatedAt,
    `전체 ${s.total} · 불일치 ${s.mismatched} · 확인필요 ${s.needsCheck} · OCR재확인 ${s.lowConfidenceOcr}`,
  );

  const headerRow = ws.addRow([
    "기업명",
    "SLAB 발행주식총수",
    "등기부 발행주식총수",
    "발행일",
    "투자유치여부",
    "추출방법",
    "일치여부",
    "후속투자 해당(Y/N)",
  ]);
  styleHeader(headerRow);
  ws.columns.forEach((c, i) => (c.width = [16, 18, 18, 14, 14, 16, 12, 18][i] ?? 14));

  for (const j of result.judgments) {
    const method =
      j.extractionMethod === "ocr"
        ? `OCR ${Math.round((j.ocrConfidence ?? 0) * 100)}%`
        : j.extractionMethod === "text"
          ? "텍스트"
          : "—";
    const row = ws.addRow([
      j.companyName,
      j.slabShareCount ?? "—",
      j.registryShareCount ?? "—",
      j.registryIssueDate ?? "—",
      j.investmentStatus,
      method,
      j.matchStatus,
      j.followupApplicable ?? (j.matchStatus === "일치" ? "N" : ""),
    ]);

    // 숫자 셀 천단위 표시
    [2, 3].forEach((c) => {
      if (typeof row.getCell(c).value === "number") row.getCell(c).numFmt = "#,##0";
    });

    if (j.matchStatus === "불일치") {
      row.eachCell((cell) => (cell.fill = solid(RED_FILL)));
      row.getCell(7).font = { bold: true, color: { argb: RED_TEXT } };
    } else if (j.matchStatus === "확인필요") {
      row.eachCell((cell) => (cell.fill = solid(GRAY_FILL)));
    } else {
      row.getCell(7).font = { color: { argb: GREEN_TEXT } };
    }
  }

  ws.views = [{ state: "frozen", ySplit: 5 }]; // 헤더 고정
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 8 } };
  return toBuffer(wb);
}

export async function buildWriteoffWorkbook(
  result: WriteoffRunResult,
  generatedAt: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("감액");

  const s = result.summary;
  titleBlock(
    ws,
    "감액 체크리스트",
    generatedAt,
    `전체 ${s.total} · 미반영 ${s.notReflected} · 판단애매 ${s.ambiguous} · 이미반영 ${s.reflected}`,
  );

  const headerRow = ws.addRow([
    "기업명",
    "스프레드시트 상태",
    "SLAB 상태",
    "반영여부",
    "LLM 판단 근거",
  ]);
  styleHeader(headerRow);
  ws.columns.forEach((c, i) => (c.width = [16, 18, 24, 12, 70][i] ?? 14));

  for (const j of result.judgments) {
    const row = ws.addRow([
      j.companyName,
      j.spreadsheetStatus ?? "—",
      j.slabStatus ?? "—",
      j.reflectionStatus,
      j.reasoning,
    ]);
    row.getCell(5).alignment = { wrapText: true, vertical: "top" };

    if (j.reflectionStatus === "미반영") {
      row.eachCell((cell) => (cell.fill = solid(RED_FILL)));
      row.getCell(4).font = { bold: true, color: { argb: RED_TEXT } };
    } else if (j.reflectionStatus === "판단애매") {
      row.eachCell((cell) => (cell.fill = solid(YELLOW_FILL)));
      row.getCell(4).font = { bold: true, color: { argb: YELLOW_TEXT } };
    } else {
      row.getCell(4).fill = solid(GREEN_FILL);
      row.getCell(4).font = { color: { argb: GREEN_TEXT } };
    }
  }

  ws.views = [{ state: "frozen", ySplit: 5 }];
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 5 } };
  return toBuffer(wb);
}
