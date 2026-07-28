import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminName } from "@/lib/auth";
import { getUsageSummary } from "@/lib/llm/usage";
import { NAVY } from "../tracker-tables";

export const dynamic = "force-dynamic";

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const num = (n: number) => n.toLocaleString("ko-KR");

export default async function AdminPage() {
  const c = await cookies();
  const raw = c.get("slab_name")?.value ?? "";
  let name = "";
  try { name = decodeURIComponent(raw); } catch { name = raw; }
  if (!isAdminName(name)) redirect("/");

  const s = await getUsageSummary();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: NAVY }}>관리자 · LLM 사용량</h1>
          <p className="mt-0.5 text-xs text-gray-500">Claude API 토큰·비용 추적 (등기부 OCR · 감액 해석 · 감액 판정)</p>
        </div>
        <Link href="/" className="text-xs text-gray-400 hover:text-[#1f3a5f]">← 대시보드</Link>
      </div>

      {/* 합계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="총 호출" value={num(s.totals.calls)} />
        <Card label="입력 토큰" value={num(s.totals.inputTokens)} />
        <Card label="출력 토큰" value={num(s.totals.outputTokens)} />
        <Card label="누적 비용(추정)" value={usd(s.totals.costUsd)} accent />
      </div>

      {s.totals.calls === 0 && (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          아직 기록된 LLM 사용이 없습니다. 등기부 OCR·감액 분석을 실행하면 여기에 집계됩니다.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Table title="기능별" head={["기능", "호출", "토큰", "비용"]}
          rows={s.byFeature.map((f) => [f.feature, num(f.calls), num(f.tokens), usd(f.costUsd)])} />
        <Table title="사용자별" head={["사용자", "호출", "토큰", "비용"]}
          rows={s.byUser.map((u) => [u.user, num(u.calls), num(u.tokens), usd(u.costUsd)])} />
      </div>

      <Table title="일자별 (최근 30일)" head={["날짜", "호출", "토큰", "비용"]}
        rows={s.byDay.map((d) => [d.day, num(d.calls), num(d.tokens), usd(d.costUsd)])} />

      <Table title="최근 사용 (50건)" head={["시각", "기능", "사용자", "모델", "입력", "출력", "비용"]}
        rows={s.recent.map((r) => [
          new Date(r.at).toLocaleString("ko-KR"), r.feature, r.user, r.model,
          num(r.inputTokens), num(r.outputTokens), usd(r.costUsd),
        ])} />
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm">
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
      <div className="mt-0.5 truncate text-2xl font-bold tabular-nums" style={{ color: accent ? "#b45309" : NAVY }}>{value}</div>
    </div>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800">{title}</div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">데이터 없음</div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-400">
                {head.map((h, i) => <th key={i} className={`px-3 py-2 font-medium ${i === 0 ? "" : "text-right tabular-nums"}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r, ri) => (
                <tr key={ri} className="text-gray-700">
                  {r.map((cell, ci) => <td key={ci} className={`px-3 py-1.5 ${ci === 0 ? "" : "text-right tabular-nums"}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
