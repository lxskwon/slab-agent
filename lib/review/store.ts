import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * 조치 필요 큐의 사람 검토 상태 + 메모 디스크 저장소.
 * 키 = 이슈 ID(펀드·분류·회사·종류로 구성, 실행마다 안정적).
 * status(확인/무시)와 memos(작성자별 메모)는 서로 독립.
 * (Supabase 도입 전 임시 저장. data/review-state.json, gitignored)
 */

export type ReviewStatus = "open" | "ack" | "dismissed";

export interface Memo {
  id: string; // 메모 고유 id (작성 기기 소유 확인 + 수정/삭제 대상)
  author: string;
  content: string;
  at: string; // ISO 작성 시각
  editedAt?: string; // ISO 수정 시각 (수정된 경우)
}

export interface ReviewItem {
  status: ReviewStatus;
  memos: Memo[];
  updatedAt: string; // ISO
}

export type ReviewState = Record<string, ReviewItem>;

const FILE = path.join(process.cwd(), "data", "review-state.json");
const VALID: ReviewStatus[] = ["open", "ack", "dismissed"];
let mem: ReviewState | null = null;
let writing: Promise<void> = Promise.resolve();

function normalize(raw: any): ReviewState {
  const out: ReviewState = {};
  for (const [id, v] of Object.entries(raw ?? {})) {
    const item = v as any;
    const status: ReviewStatus = VALID.includes(item?.status) ? item.status : "open";
    // 구버전 단일 note → memo 한 건으로 변환. 모든 메모에 id 보장.
    let memos: Memo[] = Array.isArray(item?.memos) ? item.memos : [];
    if (!memos.length && typeof item?.note === "string" && item.note.trim()) {
      memos = [{ id: randomUUID(), author: "—", content: item.note, at: item.updatedAt ?? "" }];
    }
    memos = memos.map((m: any) => ({ id: typeof m?.id === "string" ? m.id : randomUUID(), author: m?.author ?? "—", content: m?.content ?? "", at: m?.at ?? "", editedAt: m?.editedAt }));
    if (status === "open" && memos.length === 0) continue; // 기본값이면 저장 안 함
    out[id] = { status, memos, updatedAt: item?.updatedAt ?? "" };
  }
  return out;
}

async function load(): Promise<ReviewState> {
  if (mem) return mem;
  try {
    mem = normalize(JSON.parse(await readFile(FILE, "utf8")));
  } catch {
    mem = {};
  }
  return mem!;
}

async function persist(m: ReviewState): Promise<void> {
  writing = writing.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(m, null, 2));
  });
  await writing;
}

export async function getReviewState(): Promise<ReviewState> {
  return { ...(await load()) };
}

export async function setStatus(id: string, status: ReviewStatus, at: string): Promise<void> {
  const m = await load();
  const item: ReviewItem = m[id] ?? { status: "open", memos: [], updatedAt: at };
  item.status = status;
  item.updatedAt = at;
  if (item.status === "open" && item.memos.length === 0) delete m[id];
  else m[id] = item;
  await persist(m);
}

export async function addMemo(id: string, memo: Memo): Promise<void> {
  const m = await load();
  const item: ReviewItem = m[id] ?? { status: "open", memos: [], updatedAt: memo.at };
  item.memos = [...item.memos, memo];
  item.updatedAt = memo.at;
  m[id] = item;
  await persist(m);
}

export async function editMemo(id: string, memoId: string, content: string, at: string): Promise<void> {
  const m = await load();
  const item = m[id];
  if (!item) return;
  item.memos = item.memos.map((mm) => (mm.id === memoId ? { ...mm, content, editedAt: at } : mm));
  item.updatedAt = at;
  await persist(m);
}

export async function deleteMemo(id: string, memoId: string, at: string): Promise<void> {
  const m = await load();
  const item = m[id];
  if (!item) return;
  item.memos = item.memos.filter((mm) => mm.id !== memoId);
  item.updatedAt = at;
  // 메모가 모두 삭제되고 상태도 기본(open)이면 항목 제거
  if (item.status === "open" && item.memos.length === 0) delete m[id];
  await persist(m);
}
