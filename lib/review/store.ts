import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { CLOUD, redis } from "@/lib/cloud";

/**
 * 조치 필요 큐의 사람 검토 상태 + 메모 저장소.
 * 백엔드: 클라우드(Vercel)=Upstash Redis 해시, 로컬/컨테이너=디스크 JSON.
 * 키 = 이슈 ID(펀드·분류·회사·종류). status(확인/무시)와 memos는 서로 독립.
 */

export type ReviewStatus = "open" | "ack" | "dismissed";
export interface Memo { id: string; author: string; content: string; at: string; editedAt?: string }
export interface ReviewItem { status: ReviewStatus; memos: Memo[]; updatedAt: string }
export type ReviewState = Record<string, ReviewItem>;

const FILE = path.join(process.cwd(), "data", "review-state.json");
const HASH = "slab:review";
const VALID: ReviewStatus[] = ["open", "ack", "dismissed"];

function normItem(v: any): ReviewItem {
  const status: ReviewStatus = VALID.includes(v?.status) ? v.status : "open";
  let memos: Memo[] = Array.isArray(v?.memos) ? v.memos : [];
  if (!memos.length && typeof v?.note === "string" && v.note.trim()) {
    memos = [{ id: randomUUID(), author: "—", content: v.note, at: v.updatedAt ?? "" }];
  }
  memos = memos.map((m: any) => ({ id: typeof m?.id === "string" ? m.id : randomUUID(), author: m?.author ?? "—", content: m?.content ?? "", at: m?.at ?? "", editedAt: m?.editedAt }));
  return { status, memos, updatedAt: v?.updatedAt ?? "" };
}
const isDefault = (it: ReviewItem) => it.status === "open" && it.memos.length === 0;

// ---- 디스크 백엔드 ----
let mem: ReviewState | null = null;
let writing: Promise<void> = Promise.resolve();
async function diskLoad(): Promise<ReviewState> {
  if (mem) return mem;
  try {
    const raw = JSON.parse(await readFile(FILE, "utf8"));
    mem = {};
    for (const [id, v] of Object.entries(raw ?? {})) { const it = normItem(v); if (!isDefault(it)) mem[id] = it; }
  } catch { mem = {}; }
  return mem!;
}
async function diskPersist(m: ReviewState) {
  writing = writing.then(async () => { await mkdir(path.dirname(FILE), { recursive: true }); await writeFile(FILE, JSON.stringify(m, null, 2)); });
  await writing;
}

// ---- 공통 접근자 (백엔드 분기) ----
async function readItem(id: string): Promise<ReviewItem> {
  if (CLOUD) {
    const v = await redis().hget<any>(HASH, id);
    return v ? normItem(v) : { status: "open", memos: [], updatedAt: "" };
  }
  const m = await diskLoad();
  return m[id] ?? { status: "open", memos: [], updatedAt: "" };
}
async function writeItem(id: string, item: ReviewItem): Promise<void> {
  if (CLOUD) {
    if (isDefault(item)) await redis().hdel(HASH, id);
    else await redis().hset(HASH, { [id]: item });
    return;
  }
  const m = await diskLoad();
  if (isDefault(item)) delete m[id]; else m[id] = item;
  await diskPersist(m);
}

export async function getReviewState(): Promise<ReviewState> {
  if (CLOUD) {
    const all = (await redis().hgetall<Record<string, any>>(HASH)) ?? {};
    const out: ReviewState = {};
    for (const [id, v] of Object.entries(all)) { const it = normItem(v); if (!isDefault(it)) out[id] = it; }
    return out;
  }
  return { ...(await diskLoad()) };
}

export async function setStatus(id: string, status: ReviewStatus, at: string): Promise<void> {
  const item = await readItem(id);
  item.status = status; item.updatedAt = at;
  await writeItem(id, item);
}
export async function addMemo(id: string, memo: Memo): Promise<void> {
  const item = await readItem(id);
  item.memos = [...item.memos, memo]; item.updatedAt = memo.at;
  await writeItem(id, item);
}
export async function editMemo(id: string, memoId: string, content: string, at: string): Promise<void> {
  const item = await readItem(id);
  item.memos = item.memos.map((m) => (m.id === memoId ? { ...m, content, editedAt: at } : m)); item.updatedAt = at;
  await writeItem(id, item);
}
export async function deleteMemo(id: string, memoId: string, at: string): Promise<void> {
  const item = await readItem(id);
  item.memos = item.memos.filter((m) => m.id !== memoId); item.updatedAt = at;
  await writeItem(id, item);
}
