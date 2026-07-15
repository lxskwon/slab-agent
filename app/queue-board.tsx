"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DashIssue } from "@/lib/slab/service";
import type { ReviewStatus } from "@/lib/review/store";

const kindColor: Record<string, string> = {
  "후속 불일치": "bg-red-100 text-red-700 ring-red-200",
  "감액 미반영": "bg-red-100 text-red-700 ring-red-200",
  "확인 필요": "bg-amber-100 text-amber-700 ring-amber-200",
};
const HEADER = { bar: "bg-gray-100 border-gray-200", dot: "bg-gray-500", text: "text-gray-800" };
const STATUS_META: Record<Exclude<ReviewStatus, "open">, { label: string; chip: string }> = {
  ack: { label: "확인함", chip: "bg-blue-100 text-blue-700 ring-blue-200" },
  dismissed: { label: "무시", chip: "bg-gray-200 text-gray-600 ring-gray-300" },
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ko-KR"));
function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
type Sev = "all" | "red" | "yellow";

export default function QueueBoard({ issues, fund }: { issues: DashIssue[]; fund: string }) {
  const [items, setItems] = useState(issues);
  const [sev, setSev] = useState<Sev>("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [author, setAuthor] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<Set<string>>(new Set()); // 이 기기에서 작성한 메모 id (수정/삭제 권한)
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // 이름 + 내가 쓴 메모 id를 브라우저에 기억
  useEffect(() => {
    try {
      const a = localStorage.getItem("memoAuthor"); if (a) setAuthor(a);
      setMine(new Set(JSON.parse(localStorage.getItem("myMemoIds") || "[]")));
    } catch {}
  }, []);
  const rememberMine = (next: Set<string>) => {
    try { localStorage.setItem("myMemoIds", JSON.stringify([...next])); } catch {}
    return next;
  };

  // 라이브: 2초마다 서버의 상태/메모를 병합 → 다른 사람이 남긴 메모가 자동 반영
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/review", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const state = await res.json();
        setItems((prev) => prev.map((it) => ({ ...it, status: state[it.id]?.status ?? "open", memos: state[it.id]?.memos ?? [] })));
      } catch {}
    };
    const iv = setInterval(tick, 2000);
    tick();
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const post = (body: Record<string, unknown>) =>
    fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});

  const toggleStatus = (i: DashIssue, s: ReviewStatus) => {
    const next = i.status === s ? "open" : s;
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, status: next } : x)));
    post({ id: i.id, status: next });
  };

  const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const publishMemo = (i: DashIssue) => {
    const a = author.trim();
    const content = (drafts[i.id] ?? "").trim();
    if (!a || !content) return;
    try { localStorage.setItem("memoAuthor", a); } catch {}
    const memoId = newId();
    const memo = { id: memoId, author: a, content, at: new Date().toISOString() };
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, memos: [...x.memos, memo] } : x)));
    setDrafts((d) => ({ ...d, [i.id]: "" }));
    setMine((prev) => rememberMine(new Set(prev).add(memoId)));
    post({ id: i.id, memo: { memoId, author: a, content } });
  };

  const editMemoFn = (i: DashIssue, memoId: string, content: string) => {
    const c = content.trim();
    if (!c) return;
    const at = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, memos: x.memos.map((m) => (m.id === memoId ? { ...m, content: c, editedAt: at } : m)) } : x)));
    post({ id: i.id, editMemo: { memoId, content: c } });
  };

  const deleteMemoFn = (i: DashIssue, memoId: string) => {
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, memos: x.memos.filter((m) => m.id !== memoId) } : x)));
    setMine((prev) => { const n = new Set(prev); n.delete(memoId); return rememberMine(n); });
    post({ id: i.id, deleteMemo: { memoId } });
  };

  const rank = (s: DashIssue["severity"]) => (s === "red" ? 0 : 1);
  const forCat = (category: DashIssue["category"]) =>
    items
      .filter((i) => i.category === category)
      .filter((i) => fund === "all" || i.fundSlug === fund)
      .filter((i) => sev === "all" || i.severity === sev);
  const visible = (category: DashIssue["category"]) =>
    forCat(category).filter((i) => showDismissed || i.status !== "dismissed").sort((a, b) => rank(a.severity) - rank(b.severity));

  const hiddenCount = (["followup", "writeoff"] as const).reduce((n, c) => n + forCat(c).filter((i) => i.status === "dismissed").length, 0);

  const rowProps = { openId, setOpenId, toggleStatus, author, setAuthor, drafts, setDrafts, publishMemo, mine, editMemo: editMemoFn, deleteMemo: deleteMemoFn };

  return (
    <div className="space-y-3">
      {/* 심각도 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSev((c) => (c === "red" ? "all" : "red"))}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition ${sev === "red" ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
        >🔴 조치만</button>
        <button
          onClick={() => setSev((c) => (c === "yellow" ? "all" : "yellow"))}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition ${sev === "yellow" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
        >🟡 확인만</button>
        {sev !== "all" && <button onClick={() => setSev("all")} className="text-xs text-gray-400 hover:text-gray-700">필터 해제</button>}
        <div className="ml-auto">
          <button
            onClick={() => setShowDismissed((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition ${showDismissed ? "border-gray-300 bg-gray-100 text-gray-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
          >{showDismissed ? "무시 항목 숨기기" : `무시 항목 보기${hiddenCount ? ` (${hiddenCount})` : ""}`}</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="후속투자" issues={visible("followup")} {...rowProps} />
        <Section title="감액" issues={visible("writeoff")} {...rowProps} />
      </div>
    </div>
  );
}

type RowShared = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  toggleStatus: (i: DashIssue, s: ReviewStatus) => void;
  author: string;
  setAuthor: (v: string) => void;
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  publishMemo: (i: DashIssue) => void;
  mine: Set<string>;
  editMemo: (i: DashIssue, memoId: string, content: string) => void;
  deleteMemo: (i: DashIssue, memoId: string) => void;
};

function Section({ title, issues, ...shared }: { title: string; issues: DashIssue[] } & RowShared) {
  const red = issues.filter((i) => i.severity === "red").length;
  const yellow = issues.length - red;
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center justify-between border-b px-4 py-3 ${HEADER.bar}`}>
        <h2 className={`flex items-center gap-2 text-sm font-semibold ${HEADER.text}`}>
          <span className={`h-2 w-2 rounded-full ${HEADER.dot}`} />
          {title} <span className="font-normal opacity-60">({issues.length})</span>
        </h2>
        <span className="text-[11px] text-gray-500">🔴 조치 {red} · 🟡 확인 {yellow}</span>
      </div>
      {issues.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">조치할 항목이 없습니다 ✓</div>
      ) : (
        <ul className="max-h-[430px] divide-y divide-gray-50 overflow-y-auto">
          {issues.map((i) => <Row key={i.id} i={i} {...shared} />)}
        </ul>
      )}
    </div>
  );
}

function Row({ i, openId, setOpenId, toggleStatus, author, setAuthor, drafts, setDrafts, publishMemo, mine, editMemo, deleteMemo }: { i: DashIssue } & RowShared) {
  const open = openId === i.id;
  const meta = i.status !== "open" ? STATUS_META[i.status] : null;
  const dim = i.status === "dismissed";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const startEdit = (mid: string, content: string) => { setEditingId(mid); setEditDraft(content); };
  const saveEdit = () => { if (editingId) editMemo(i, editingId, editDraft); setEditingId(null); };
  return (
    <li className={dim ? "opacity-55" : ""}>
      <div onClick={() => setOpenId(open ? null : i.id)} className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50">
        <span className="w-24 shrink-0 truncate text-[11px] font-medium text-gray-400" title={i.fund}>{i.fund}</span>
        {i.companyId ? (
          <Link href={`/company/${i.companyId}`} onClick={(e) => e.stopPropagation()} className="w-24 shrink-0 truncate text-sm font-medium hover:text-[#1f3a5f] hover:underline">{i.company}</Link>
        ) : (
          <span className="w-24 shrink-0 truncate text-sm font-medium">{i.company}</span>
        )}
        <span className={`w-20 shrink-0 rounded-full py-0.5 text-center text-[11px] ring-1 ${kindColor[i.kind]}`}>{i.kind}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{i.detail}</span>
        {i.memos.length > 0 && <span className="shrink-0 text-[11px] text-gray-400">💬 {i.memos.length}</span>}
        {meta && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${meta.chip}`}>{meta.label}</span>}
        <span className="shrink-0 text-gray-300">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-xs">
          <Evidence i={i} />
          <div className="flex flex-wrap items-center gap-1.5">
            <ActionBtn active={i.status === "ack"} on={() => toggleStatus(i, "ack")} cls="border-blue-300 bg-blue-50 text-blue-700">확인</ActionBtn>
            <ActionBtn active={i.status === "dismissed"} on={() => toggleStatus(i, "dismissed")} cls="border-gray-300 bg-gray-100 text-gray-700">무시</ActionBtn>
            <Link href={`/fund/${i.fundSlug}?tab=${i.category}`} className="ml-auto text-[11px] text-gray-400 hover:text-[#1f3a5f]">펀드에서 보기 →</Link>
          </div>

          {/* 메모 (작성자별 · 공유 · 실시간). 수정/삭제는 작성한 기기에서만 */}
          <div className="space-y-1.5">
            {i.memos.map((m) => {
              const owned = mine.has(m.id);
              const editing = editingId === m.id;
              return (
                <div key={m.id} className="rounded-md bg-white px-2.5 py-1.5 ring-1 ring-gray-100">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold text-gray-700">{m.author}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[10px] text-gray-300">{fmtTime(m.editedAt || m.at)}{m.editedAt ? " (수정됨)" : ""}</span>
                      {owned && !editing && (
                        <>
                          <button onClick={() => startEdit(m.id, m.content)} className="text-[10px] text-gray-400 hover:text-[#1f3a5f]">수정</button>
                          <button onClick={() => deleteMemo(i, m.id)} className="text-[10px] text-gray-400 hover:text-red-600">삭제</button>
                        </>
                      )}
                    </div>
                  </div>
                  {editing ? (
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                        autoFocus
                        className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-[#1f3a5f] focus:outline-none"
                      />
                      <button onClick={saveEdit} className="text-[11px] font-medium text-[#1f3a5f]">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-[11px] text-gray-400">취소</button>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-xs text-gray-600">{m.content}</div>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="이름"
                className="w-20 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-[#1f3a5f] focus:outline-none"
              />
              <input
                value={drafts[i.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [i.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") publishMemo(i); }}
                placeholder="메모 내용"
                className="min-w-[8rem] flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-[#1f3a5f] focus:outline-none"
              />
              <button
                onClick={() => publishMemo(i)}
                disabled={!author.trim() || !(drafts[i.id] ?? "").trim()}
                className="rounded-md bg-[#1f3a5f] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
              >게시</button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ActionBtn({ active, on, cls, children }: { active: boolean; on: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button onClick={on} className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${active ? cls : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}>{children}</button>
  );
}

function Evidence({ i }: { i: DashIssue }) {
  const e = i.evidence;
  const Cell = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <>
      <span className="text-gray-400">{k}</span>
      <span className="text-gray-700">{children}</span>
    </>
  );
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {i.category === "followup" ? (
        <>
          <Cell k="등기부등본">
            {fmt(e.registryShares)}주
            {e.registryQuarter ? ` · ${e.registryQuarter}` : ""}
            {e.registryDate ? ` · ${e.registryDate}` : ""}
            {e.registryUrl && <a href={e.registryUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#1f3a5f] underline">PDF 열기 ↗</a>}
          </Cell>
          <Cell k="SLAB">{fmt(e.slabShares)}주</Cell>
          {e.reportShares != null && <Cell k="분기보고">{fmt(e.reportShares)}주</Cell>}
        </>
      ) : (
        <>
          <Cell k="스프레드시트">{e.sheetName ?? i.company}{e.sheetStatus ? ` · ${e.sheetStatus}` : ""}</Cell>
          <Cell k="SLAB">{e.slabStatus || "—"}</Cell>
        </>
      )}
    </div>
  );
}
