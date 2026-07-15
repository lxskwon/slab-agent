import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * 조치 필요 큐의 사람 검토 상태 디스크 저장소.
 * 키 = 이슈 ID(펀드·분류·회사·종류로 구성, 실행마다 안정적) → 상태 + 메모.
 * (Supabase 도입 전 임시 저장. data/review-state.json, gitignored)
 */

// open=미확인(기본) · ack=확인함(작업 중) · dismissed=무시(큐에서 숨김).
// '해결됨'은 없음 — SLAB을 고치면 에이전트가 재대조 후 일치/반영으로 큐에서 자동 제거되므로 불필요.
export type ReviewStatus = "open" | "ack" | "dismissed";

export interface ReviewItem {
  status: ReviewStatus;
  note: string;
  updatedAt: string; // ISO
}

export type ReviewState = Record<string, ReviewItem>;

const FILE = path.join(process.cwd(), "data", "review-state.json");
let mem: ReviewState | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<ReviewState> {
  if (mem) return mem;
  try {
    mem = JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    mem = {};
  }
  return mem!;
}

const VALID: ReviewStatus[] = ["open", "ack", "dismissed"];
export async function getReviewState(): Promise<ReviewState> {
  const raw = await load();
  const out: ReviewState = {};
  for (const [id, v] of Object.entries(raw)) {
    // 구버전/유효하지 않은 상태(예: 폐기된 'resolved')는 무시 → open 취급
    if (VALID.includes(v.status)) out[id] = v;
  }
  return out;
}

export async function setReviewItem(
  id: string,
  patch: { status: ReviewStatus; note: string; updatedAt: string },
): Promise<void> {
  const m = await load();
  // status=open && 메모 없음 → 항목 삭제(기본값으로 되돌리기)
  if (patch.status === "open" && !patch.note.trim()) {
    delete m[id];
  } else {
    m[id] = { status: patch.status, note: patch.note, updatedAt: patch.updatedAt };
  }
  writing = writing.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(m, null, 2));
  });
  await writing;
}
