import ExcelJS from "exceljs";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { statusCategory } from "./reflect";
import { getServiceClient } from "@/lib/db/client";
import { putSheet, hasSheetBlob, getSheetBuffer } from "./supa-storage";

const SUPA = () => getServiceClient() !== null;

/** 펀드 시트 원본(.xlsx) 바이트를 백엔드에서 가져옴 (Supabase Storage 또는 로컬 디스크) */
async function getFundBuffer(slug: string): Promise<Buffer | null> {
  if (SUPA()) return getSheetBuffer(slug);
  try { return await readFile(fundFile(slug)); } catch { return null; }
}

/**
 * 감액 투자현황 DB 로더 — 펀드별 파일(data/writeoff-sheet/<fund>.xlsx).
 * 각 펀드 페이지에서 업로드 → 해당 펀드 파일로 저장 → 감액 대조에 사용.
 * '투자집행' 탭의 '상태' 열이 스프레드시트 상태. No. 있는 행만 유효(‘/’=History 무시).
 */

const DIR = path.join(process.cwd(), "data", "writeoff-sheet");
const fundFile = (slug: string) => path.join(DIR, `${slug}.xlsx`);

export interface SheetEntry {
  status: string;
  name: string; // 시트 원래 회사명(국문) — 이름 불일치 비고용
}

/** 국문 회사명 정규화 (㈜/주식회사/공백/후행 괄호 제거) */
export function normName(n: string | undefined): string {
  return (n ?? "")
    .replace(/\(주\)|㈜|주식회사/g, "")
    .replace(/\([^)]*\)\s*$/, "")
    .replace(/\s/g, "")
    .toLowerCase();
}

/** 영문 회사명 정규화 */
export function normNameEn(n: string | undefined): string {
  return (n ?? "").toLowerCase().replace(/\([^)]*\)\s*$/, "").replace(/[^a-z0-9]/g, "");
}

/** 매칭 후보 키 (국문 본체 + 괄호 안 별칭 + 영문명) */
export function nameKeys(ko?: string, en?: string): string[] {
  const keys = new Set<string>();
  const add = (s: string) => s && keys.add(s);
  if (ko) {
    add(normName(ko));
    for (const m of ko.matchAll(/\(([^)]+)\)/g)) add(normName(m[1]));
  }
  if (en) add(normNameEn(en));
  return [...keys];
}

function isNumbered(cell: ExcelJS.Cell): boolean {
  return /^\d+$/.test(String(cell.text ?? "").trim());
}

/** 워크북 → 회사명키 → {상태, 이름} 맵 */
function parseWorkbook(wb: ExcelJS.Workbook): Map<string, SheetEntry> {
  const ws = wb.getWorksheet("투자집행") ?? wb.worksheets[0];
  const map = new Map<string, SheetEntry>();
  if (!ws) return map;

  let noCol = 0, koCol = 0, enCol = 0, statusCol = 0, headerRow = 0;
  for (let r = 1; r <= 5; r++) {
    const vals = ws.getRow(r).values;
    if (!Array.isArray(vals)) continue;
    vals.forEach((v, i) => {
      const s = String((v as { text?: string })?.text ?? v ?? "").trim();
      if (/^no\.?$/i.test(s) || s === "번호" || s === "순번") noCol = i;
      if (s.includes("회사명") && s.includes("국문")) koCol = i;
      if (s.includes("회사명") && s.includes("영문")) enCol = i;
      if (s === "상태") statusCol = i;
    });
    if (koCol && statusCol) {
      headerRow = r;
      break;
    }
  }
  if (!noCol && koCol) noCol = koCol - 1;
  if (!koCol || !statusCol) return map;

  const setPref = (key: string, entry: SheetEntry) => {
    if (!key) return;
    const cur = map.get(key);
    if (cur == null || (statusCategory(cur.status) === "unknown" && statusCategory(entry.status) !== "unknown")) {
      map.set(key, entry);
    }
  };
  ws.eachRow((row, r) => {
    if (r <= headerRow) return;
    if (!isNumbered(row.getCell(noCol))) return;
    const ko = String(row.getCell(koCol).text ?? "").trim();
    const en = enCol ? String(row.getCell(enCol).text ?? "").trim() : "";
    const st = String(row.getCell(statusCol).text ?? "").trim();
    if (!st) return;
    const entry: SheetEntry = { status: st, name: ko || en };
    for (const k of nameKeys(ko, en)) setPref(k, entry);
  });
  return map;
}

/** 업로드된 버퍼 파싱 (검증용) */
export async function parseSheetBuffer(buf: Buffer): Promise<Map<string, SheetEntry>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return parseWorkbook(wb);
}

const cache = new Map<string, Map<string, SheetEntry> | null>();

/** 펀드별 시트 로드 (파일 없으면 null). 캐시됨. */
export async function loadFundSheet(slug: string): Promise<Map<string, SheetEntry> | null> {
  if (cache.has(slug)) return cache.get(slug)!;
  let map: Map<string, SheetEntry> | null = null;
  try {
    const buf = await getFundBuffer(slug);
    if (buf) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);
      map = parseWorkbook(wb);
    }
  } catch {
    map = null; // 파일 없음/읽기 실패
  }
  cache.set(slug, map);
  return map;
}

/** 업로드 파일 저장 + 캐시 무효화 (Supabase Storage 또는 로컬 디스크) */
export async function saveFundSheet(slug: string, buf: Buffer): Promise<void> {
  if (SUPA()) {
    await putSheet(slug, buf);
  } else {
    await mkdir(DIR, { recursive: true });
    await writeFile(fundFile(slug), buf);
  }
  cache.delete(slug);
}

export async function hasFundSheet(slug: string): Promise<boolean> {
  if (SUPA()) return hasSheetBlob(slug);
  try {
    await access(fundFile(slug));
    return true;
  } catch {
    return false;
  }
}

function colLetter(i: number): string {
  let s = "", n = i;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const isNameHeader = (s: string) => /^(기업명|회사명)/.test(s); // 앞에서부터 일치 → "주식 전환 기업명" 같은 오탐 배제
const isNoHeader = (s: string) => /^no\.?$/i.test(s) || s === "번호" || s === "순번";

/**
 * 회사별 표의 헤더 위치 탐색. 요약 블록이 위에 있고 표가 아래에서 시작할 수 있어 최대 60행까지 스캔.
 * No. 열은 실제 'No./번호' 헤더가 있을 때만 잡는다(없으면 0 — 행 필터에서 제외).
 */
function findHeader(ws: ExcelJS.Worksheet): { headerRow: number; nameCol: number; noCol: number } {
  const lastCol = Math.min(ws.columnCount, 50);
  const txt = (r: number, i: number) => String(ws.getRow(r).getCell(i).text ?? "").replace(/\s+/g, " ").trim();
  const maxRow = Math.min(ws.rowCount, 60);
  for (let r = 1; r <= maxRow; r++) {
    let nameCol = 0, noCol = 0;
    for (let i = 1; i <= lastCol; i++) {
      const s = txt(r, i);
      if (isNoHeader(s)) noCol = i;
      if (isNameHeader(s) && !nameCol) nameCol = i;
    }
    if (nameCol) return { headerRow: r, nameCol, noCol };
  }
  return { headerRow: 0, nameCol: 0, noCol: 0 };
}

/** 워크시트가 '회사별' 표인지 점수화: 기업명/회사명 열 아래 회사 행 수. 표가 아니면 0. */
function companyTableScore(ws: ExcelJS.Worksheet): number {
  const { headerRow, nameCol, noCol } = findHeader(ws);
  if (!headerRow) return 0;
  const txt = (r: number, i: number) => String(ws.getRow(r).getCell(i).text ?? "").replace(/\s+/g, " ").trim();
  let count = 0;
  ws.eachRow((row, r) => {
    if (r <= headerRow) return;
    if (!txt(r, nameCol)) return;
    if (noCol && !/^\d+$/.test(txt(r, noCol))) return; // No. 열이 있으면 번호 있는 행만
    count += 1;
  });
  return count;
}

/**
 * 업로드된 펀드 파일의 탭 이름 목록 — '회사별 표'로 보이는 탭을 앞으로 정렬.
 * (요약 탭 '투자 및 전환현황' 등은 회사 목록이 없어 감액 분석 대상이 아니므로 뒤로.)
 */
export async function listTabs(slug: string): Promise<string[]> {
  const buf = await getFundBuffer(slug);
  if (!buf) return [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const scored = wb.worksheets.map((w, idx) => ({
    name: w.name,
    score: companyTableScore(w),
    preferred: w.name.trim() === "투자집행" ? 0 : 1, // 표준 탭명 우선
    idx,
  }));
  // '투자집행' 최우선 → 회사 행 많은 순 → 원래 순서
  scored.sort((a, b) => a.preferred - b.preferred || b.score - a.score || a.idx - b.idx);
  return scored.map((s) => s.name);
}

/**
 * 선택한 탭을 LLM이 읽기 좋은 텍스트로 변환.
 * 기업명 열이 있는 헤더 행을 찾아, 그 위 그룹행(예: 현재시점)+헤더+회사 행만 열=값 형태로 출력.
 */
export async function sheetToText(
  slug: string,
  tab: string,
): Promise<{ text: string; names: string[] }> {
  const buf = await getFundBuffer(slug);
  if (!buf) return { text: "", names: [] };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.getWorksheet(tab) ?? wb.worksheets[0];
  if (!ws) return { text: "", names: [] };
  const lastCol = Math.min(ws.columnCount, 50);
  const txt = (r: number, i: number) => String(ws.getRow(r).getCell(i).text ?? "").replace(/\s+/g, " ").trim();

  let { headerRow, nameCol, noCol } = findHeader(ws);
  if (!headerRow) {
    headerRow = 1;
    nameCol = 1;
  }

  const lines: string[] = [];
  if (headerRow > 1) {
    const grp = Array.from({ length: lastCol }, (_, i) => txt(headerRow - 1, i + 1));
    if (grp.some(Boolean))
      lines.push("그룹: " + grp.map((g, i) => (g ? `${colLetter(i + 1)}:${g}` : "")).filter(Boolean).join(" | "));
  }
  lines.push(
    "헤더: " + Array.from({ length: lastCol }, (_, i) => txt(headerRow, i + 1)).map((h, i) => (h ? `${colLetter(i + 1)}=${h}` : "")).filter(Boolean).join(" | "),
  );

  const names: string[] = [];
  let count = 0;
  ws.eachRow((row, r) => {
    if (r <= headerRow || count >= 400) return;
    const name = txt(r, nameCol);
    if (!name) return; // 회사명 없는 행 skip
    // No.가 숫자인 정식 행만 (‘/’=History 등 제외) — noCol이 유효할 때만 적용
    if (noCol >= 1 && !/^\d+$/.test(txt(r, noCol))) return;
    const cells: string[] = [];
    for (let i = 1; i <= lastCol; i++) {
      const v = txt(r, i);
      if (v) cells.push(`${colLetter(i + 1)}=${v}`);
    }
    if (cells.length) {
      lines.push(cells.join(" | "));
      names.push(name);
      count += 1;
    }
  });
  return { text: lines.join("\n"), names };
}
