import Link from "next/link";
import { getWriteoffView } from "@/lib/data";
import { reflectionBadge } from "@/lib/ui/format";
import { RefreshButton } from "../refresh-button";
import { ConfirmCell } from "./confirm-cell";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "전체", label: "전체" },
  { key: "미반영", label: "미반영만" },
  { key: "판단애매", label: "판단애매만" },
];

export default async function WriteoffPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter = "전체", q = "" } = await searchParams;
  const view = await getWriteoffView();
  const editable = view.source === "db";

  let rows = view.rows;
  if (filter === "미반영") rows = rows.filter((r) => r.reflectionStatus === "미반영");
  else if (filter === "판단애매")
    rows = rows.filter((r) => r.reflectionStatus === "판단애매");
  if (q) rows = rows.filter((r) => r.companyName.includes(q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">감액 리뷰</h1>
        <RefreshButton />
      </div>

      {!editable && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          라이브 프리뷰 모드입니다(스프레드시트·SLAB 목업 · Claude 실시간 판단). 확인·저장은 Supabase 연결 후 가능합니다.
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/writeoff?filter=${f.key}`}
              className={`rounded-md px-2.5 py-1 text-xs ring-1 ${
                filter === f.key
                  ? "bg-gray-900 text-white ring-gray-900"
                  : "bg-white text-gray-600 ring-gray-300 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="ml-auto" action="/writeoff">
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q}
            placeholder="기업명 검색"
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs"
          />
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">기업명</th>
              <th className="px-3 py-2">스프레드시트 상태</th>
              <th className="px-3 py-2">SLAB 상태</th>
              <th className="px-3 py-2">반영여부</th>
              <th className="px-3 py-2">LLM 판단 근거</th>
              <th className="px-3 py-2">확인</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const badge = reflectionBadge(r.reflectionStatus);
              return (
                <tr key={r.id} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-2 font-medium">{r.companyName}</td>
                  <td className="px-3 py-2">{r.spreadsheetStatus ?? "—"}</td>
                  <td className="px-3 py-2">{r.slabStatus ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-md text-xs text-gray-600">
                    {r.llmReasoning ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ConfirmCell
                      resultId={r.id}
                      reviewedBy={r.reviewedBy}
                      editable={editable}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                  결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
