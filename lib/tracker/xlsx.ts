import ExcelJS from "exceljs";
import type { FollowupRow, WriteoffRow, Section, Flag } from "./mock-data";

/**
 * 트래커 웹 뷰와 동일한 형식의 .xlsx 내보내기.
 * 실제 Google Sheet 구조를 따름: 두 시트(① 후속투자 / ② 감액),
 * 각 시트에 펀드별(1차 CJFtr / 2차 SKF4) 섹션이 쌓임. 불일치/미반영=빨강, 애매=노랑.
 */

const NAVY = "FF1F3A5F";
const RED_FILL = "FFFFC7CE";
const RED_TEXT = "FF9C0006";
const YELLOW_FILL = "FFFFEB9C";
const YELLOW_TEXT = "FF9C6500";

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function flagFill(flag: Flag): string | null {
  if (flag === "red") return RED_FILL;
  if (flag === "yellow") return YELLOW_FILL;
  return null;
}

function sectionTitle(ws: ExcelJS.Worksheet, span: number, text: string) {
  const r = ws.addRow([text]);
  ws.mergeCells(r.number, 1, r.number, span);
  r.getCell(1).font = { bold: true, size: 12, color: { argb: NAVY } };
  r.height = 20;
}

function headerRow(ws: ExcelJS.Worksheet, headers: string[]) {
  const r = ws.addRow(headers);
  r.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = solid(NAVY);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF16304D" } } };
  });
  r.height = 28;
}

function border(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "hair", color: { argb: "FFD0D0D0" } },
    left: { style: "hair", color: { argb: "FFD0D0D0" } },
    bottom: { style: "hair", color: { argb: "FFD0D0D0" } },
    right: { style: "hair", color: { argb: "FFD0D0D0" } },
  };
}

function buildFollowupSheet(wb: ExcelJS.Workbook, sections: Section<FollowupRow>[]) {
  const ws = wb.addWorksheet("① 후속투자");
  ws.columns = [
    { width: 5 },
    { width: 22 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
    { width: 15 },
    { width: 9 },
    { width: 11 },
    { width: 60 },
  ];
  const H = [
    "NO",
    "회사명",
    "분기(대상)",
    "투자유치여부(자가보고)",
    "등기부등본 확인일",
    "등기상 발행주식총수",
    "SLAB상 발행주식총수",
    "일치여부",
    "후속투자 해당여부",
    "비고",
  ];

  sections.forEach((s, i) => {
    if (i > 0) ws.addRow([]);
    sectionTitle(ws, H.length, `① 후속투자 · ${s.fund}`);
    headerRow(ws, H);

    for (const r of s.rows) {
      const row = ws.addRow([
        r.no,
        r.company,
        r.quarter,
        r.investStatus,
        r.registryDate ?? "",
        r.registryShares ?? "",
        r.slabShares ?? "",
        r.match,
        r.followupApplicable,
        r.note,
      ]);
      row.eachCell(border);
      [6, 7].forEach((c) => {
        if (typeof row.getCell(c).value === "number") row.getCell(c).numFmt = '#,##0"주"';
      });
      row.getCell(8).alignment = { horizontal: "center" };
      row.getCell(9).alignment = { horizontal: "center" };
      row.getCell(10).alignment = { wrapText: true, vertical: "top" };

      const fill = flagFill(r.flag);
      if (fill) row.eachCell((cell) => (cell.fill = solid(fill)));
      if (r.match === "불일치") row.getCell(8).font = { bold: true, color: { argb: RED_TEXT } };
    }
  });
}

function buildWriteoffSheet(wb: ExcelJS.Workbook, sections: Section<WriteoffRow>[]) {
  const ws = wb.addWorksheet("② 감액");
  ws.columns = [{ width: 5 }, { width: 24 }, { width: 16 }, { width: 13 }, { width: 72 }];
  const H = ["NO", "회사명", "스프레드시트 상태", "SLAB 반영여부", "비고"];

  sections.forEach((s, i) => {
    if (i > 0) ws.addRow([]);
    sectionTitle(ws, H.length, `② 감액 · ${s.fund}`);
    headerRow(ws, H);

    for (const r of s.rows) {
      const row = ws.addRow([r.no, r.company, r.sheetStatus, r.reflected, r.note]);
      row.eachCell(border);
      row.getCell(4).alignment = { horizontal: "center" };
      row.getCell(5).alignment = { wrapText: true, vertical: "top" };

      const fill = flagFill(r.flag);
      if (fill) row.eachCell((cell) => (cell.fill = solid(fill)));
      if (r.reflected === "미반영") row.getCell(4).font = { bold: true, color: { argb: RED_TEXT } };
      else if (r.reflected === "판단애매")
        row.getCell(4).font = { bold: true, color: { argb: YELLOW_TEXT } };
    }
  });
}

export async function buildTrackerWorkbook(
  followup: Section<FollowupRow>[],
  writeoff: Section<WriteoffRow>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  buildFollowupSheet(wb, followup);
  buildWriteoffSheet(wb, writeoff);
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
