import Link from "next/link";
import { getFollowupView } from "@/lib/data";
import { fmtInt, fmtDate, matchBadge } from "@/lib/ui/format";
import { RefreshButton } from "../refresh-button";
import { ApplicableCell } from "./applicable-cell";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "전체", label: "전체" },
  { key: "불일치", label: "불일치만" },
  { key: "확인필요", label: "확인필요만" },
];

export default async function FollowupPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter = "전체", q = "" } = await searchParams;
  const view = await getFollowupView();
  const editable = view.source === "db";

  let rows = view.rows;
  if (filter === "불일치") rows = rows.filter((r) => r.matchStatus === "불일치");
  else if (filter === "확인필요") rows = rows.filter((r) => r.matchStatus === "확인필요");
  if (q) rows = rows.filter((r) => r.companyName.includes(q));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">후속투자 리뷰</h1>
        <RefreshButton />
      </div>

      {!editable && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
          라이브 프리뷰 모드입니다(목업 데이터). Y/N 입력·저장은 Supabase 연결 후 가능합니다.
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/followup?filter=${f.key}`}
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
        <form className="ml-auto" action="/followup">
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
              <th className="px-3 py-2 text-right">SLAB 발행주식총수</th>
              <th className="px-3 py-2 text-right">등기부등본 발행주식총수</th>
              <th className="px-3 py-2">일치여부</th>
              <th className="px-3 py-2">발행일</th>
              <th className="px-3 py-2">투자유치여부</th>
              <th className="px-3 py-2">후속투자 해당(Y/N)</th>
              <th className="px-3 py-2">확인자</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const badge = matchBadge(r.matchStatus);
              const lowOcr = r.extractionMethod === "ocr" && (r.ocrConfidence ?? 1) < 0.8;
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{r.companyName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.slabShareCount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtInt(r.registryShareCount)}
                    {lowOcr && (
                      <span
                        className="ml-1 text-xs text-amber-600"
                        title={`OCR 결과 (신뢰도 ${Math.round((r.ocrConfidence ?? 0) * 100)}%) — 재확인 권장`}
                      >
                        ⚠ OCR
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">{fmtDate(r.registryIssueDate)}</td>
                  <td className="px-3 py-2">{r.investmentStatus ?? "—"}</td>
                  <td className="px-3 py-2">
                    <ApplicableCell
                      resultId={r.id}
                      value={r.followupApplicable}
                      matchStatus={r.matchStatus}
                      editable={editable}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {r.reviewedBy ? `${r.reviewedBy}` : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
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
