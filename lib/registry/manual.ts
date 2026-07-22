import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getServiceClient } from "@/lib/db/client";

/**
 * 등기부등본 판독 불가 건에 대한 수기 입력값. PDF는 링크돼 있으니 사람이 직접 보고 발행주식총수를 입력.
 * 키 = 등기부 PDF URL. 백엔드: Supabase(registry_manual) 있으면 그걸, 없으면 로컬 디스크.
 */

export interface ManualReg { shares: number; issueDate: string | null; author: string }

const TABLE = "registry_manual";
const FILE = path.join(process.cwd(), "data", "registry-manual.json");

export async function getManualMap(): Promise<Map<string, ManualReg>> {
  const c = getServiceClient();
  const out = new Map<string, ManualReg>();
  if (c) {
    const { data } = await c.from(TABLE).select("url,shares,issue_date,author");
    for (const r of (data ?? []) as any[]) out.set(r.url, { shares: Number(r.shares), issueDate: r.issue_date ?? null, author: r.author ?? "" });
    return out;
  }
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8")) as Record<string, ManualReg>;
    for (const [k, v] of Object.entries(raw)) out.set(k, v);
  } catch { /* none */ }
  return out;
}

export async function deleteManual(url: string): Promise<void> {
  const c = getServiceClient();
  if (c) { await c.from(TABLE).delete().eq("url", url); return; }
  const map = await getManualMap();
  map.delete(url);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(Object.fromEntries(map), null, 2));
}

export async function setManual(url: string, m: ManualReg): Promise<void> {
  const c = getServiceClient();
  if (c) {
    await c.from(TABLE).upsert({ url, shares: m.shares, issue_date: m.issueDate, author: m.author, updated_at: new Date().toISOString() });
    return;
  }
  const map = await getManualMap();
  map.set(url, m);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(Object.fromEntries(map), null, 2));
}
