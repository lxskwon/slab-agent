"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
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
type Sev = "all" | "red" | "yellow";

export default function QueueBoard({ issues }: { issues: DashIssue[] }) {
  const [items, setItems] = useState(issues);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [fund, setFund] = useState("all");
  const [sev, setSev] = useState<Sev>("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const funds = useMemo(
    () => [...new Set(issues.map((i) => i.fund))].sort((a, b) => a.localeCompare(b)),
    [issues],
  );

  const post = (id: string, status: ReviewStatus, note: string) => {
    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, note }),
    }).catch(() => {});
  };
  const setStatus = (i: DashIssue, s: ReviewStatus) => {
    const next = i.status === s ? "open" : s;
    const note = itemsRef.current.find((x) => x.id === i.id)?.note ?? "";
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, status: next } : x)));
    post(i.id, next, note);
  };
  const editNote = (id: string, note: string) =>
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, note } : x)));
  const saveNote = (id: string) => {
    const cur = itemsRef.current.find((x) => x.id === id);
    if (cur) post(id, cur.status, cur.note);
  };

  const rank = (s: DashIssue["severity"]) => (s === "red" ? 0 : 1);
  const forCat = (category: DashIssue["category"]) =>
    items
      .filter((i) => i.category === category)
      .filter((i) => fund === "all" || i.fund === fund)
      .filter((i) => sev === "all" || i.severity === sev);
  const visible = (category: DashIssue["category"]) =>
    forCat(category).filter((i) => showDismissed || i.status !== "dismissed").sort((a, b) => rank(a.severity) - rank(b.severity));

  const hiddenCount = (["followup", "writeoff"] as const).reduce(
    (n, c) => n + forCat(c).filter((i) => i.status === "dismissed").length,
    0,
  );

  return (
    <div className="space-y-3">
      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <select
            value={fund}
            onChange={(e) => setFund(e.target.value)}
            className="appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-gray-700 shadow-sm focus:border-[#1f3a5f] focus:outline-none"
          >
            <option value="all">전체 펀드</option>
            {funds.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <button
          onClick={() => setSev((c) => (c === "red" ? "all" : "red"))}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition ${sev === "red" ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
        >
          🔴 조치만
        </button>
        <button
          onClick={() => setSev((c) => (c === "yellow" ? "all" : "yellow"))}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition ${sev === "yellow" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
        >
          🟡 확인만
        </button>
        {(fund !== "all" || sev !== "all") && (
          <button onClick={() => { setFund("all"); setSev("all"); }} className="text-xs text-gray-400 hover:text-gray-700">
            필터 해제
          </button>
        )}
        <div className="ml-auto">
          <button
            onClick={() => setShowDismissed((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-sm transition ${showDismissed ? "border-gray-300 bg-gray-100 text-gray-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
          >
            {showDismissed ? "무시 항목 숨기기" : `무시 항목 보기${hiddenCount ? ` (${hiddenCount})` : ""}`}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="후속투자" issues={visible("followup")} openId={openId} setOpenId={setOpenId} setStatus={setStatus} editNote={editNote} saveNote={saveNote} />
        <Section title="감액" issues={visible("writeoff")} openId={openId} setOpenId={setOpenId} setStatus={setStatus} editNote={editNote} saveNote={saveNote} />
      </div>
    </div>
  );
}

function Section({
  title, issues, openId, setOpenId, setStatus, editNote, saveNote,
}: {
  title: string;
  issues: DashIssue[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  setStatus: (i: DashIssue, s: ReviewStatus) => void;
  editNote: (id: string, note: string) => void;
  saveNote: (id: string) => void;
}) {
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
          {issues.map((i) => (
            <Row key={i.id} i={i} open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)} setStatus={setStatus} editNote={editNote} saveNote={saveNote} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  i, open, onToggle, setStatus, editNote, saveNote,
}: {
  i: DashIssue;
  open: boolean;
  onToggle: () => void;
  setStatus: (i: DashIssue, s: ReviewStatus) => void;
  editNote: (id: string, note: string) => void;
  saveNote: (id: string) => void;
}) {
  const meta = i.status !== "open" ? STATUS_META[i.status] : null;
  const dim = i.status === "dismissed";
  return (
    <li className={dim ? "opacity-55" : ""}>
      <div onClick={onToggle} className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50">
        <span className="w-12 shrink-0 text-[11px] font-medium text-gray-400">{i.fund}</span>
        {i.companyId ? (
          <Link
            href={`/company/${i.companyId}`}
            onClick={(e) => e.stopPropagation()}
            className="w-24 shrink-0 truncate text-sm font-medium hover:text-[#1f3a5f] hover:underline"
          >
            {i.company}
          </Link>
        ) : (
          <span className="w-24 shrink-0 truncate text-sm font-medium">{i.company}</span>
        )}
        <span className={`w-20 shrink-0 rounded-full py-0.5 text-center text-[11px] ring-1 ${kindColor[i.kind]}`}>{i.kind}</span>
        <span className="flex-1 truncate text-xs text-gray-500">{i.detail}</span>
        {meta && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${meta.chip}`}>{meta.label}</span>}
        <span className="shrink-0 text-gray-300">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-xs">
          <Evidence i={i} />
          <div className="flex flex-wrap items-center gap-1.5">
            <ActionBtn active={i.status === "ack"} on={() => setStatus(i, "ack")} cls="border-blue-300 bg-blue-50 text-blue-700">확인</ActionBtn>
            <ActionBtn active={i.status === "dismissed"} on={() => setStatus(i, "dismissed")} cls="border-gray-300 bg-gray-100 text-gray-700">무시</ActionBtn>
            <Link href={`/fund/${i.fundSlug}?tab=${i.category}`} className="ml-auto text-[11px] text-gray-400 hover:text-[#1f3a5f]">펀드에서 보기 →</Link>
          </div>
          <input
            value={i.note}
            onChange={(e) => editNote(i.id, e.target.value)}
            onBlur={() => saveNote(i.id)}
            placeholder="메모 (예: 등기부등본 재요청함 / 담당자 확인 예정)"
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-[#1f3a5f] focus:outline-none"
          />
        </div>
      )}
    </li>
  );
}

function ActionBtn({ active, on, cls, children }: { active: boolean; on: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button
      onClick={on}
      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${active ? cls : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
    >
      {children}
    </button>
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
            {e.registryUrl && (
              <a href={e.registryUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-[#1f3a5f] underline">PDF 열기 ↗</a>
            )}
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
