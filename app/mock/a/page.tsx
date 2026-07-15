import { NAVY, FUNDS, ISSUES, TOTALS, fundFlags } from "@/lib/mock/dashboard";
import { MockNav } from "../nav";

function Kpi({ label, value, sub, tone = "navy" }: { label: string; value: string | number; sub?: string; tone?: string }) {
  const tones: Record<string, string> = { navy: "text-[#1f3a5f]", red: "text-red-600", amber: "text-amber-600", green: "text-green-600", gray: "text-gray-700" };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-medium text-gray-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

const kindColor: Record<string, string> = {
  "후속 불일치": "bg-red-100 text-red-700 ring-red-200",
  "감액 미반영": "bg-red-100 text-red-700 ring-red-200",
  "확인 필요": "bg-amber-100 text-amber-700 ring-amber-200",
};

export default function ConceptA() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: NAVY }}>SLAB 데이터 최신화 대시보드</h1>
          <p className="mt-0.5 text-xs text-gray-500">전 펀드 자동 대조 · 마지막 실행 2026-07-14 14:30</p>
        </div>
        <MockNav active="a" />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="펀드" value={TOTALS.funds} sub={`${TOTALS.processedFunds}개 분석 완료`} />
        <Kpi label="전체 기업" value={TOTALS.companies} />
        <Kpi label="🔴 조치 필요" value={TOTALS.red} tone="red" sub="불일치 · 미반영" />
        <Kpi label="🟡 확인 필요" value={TOTALS.yellow} tone="amber" sub="판독대기 · 해외 등" />
        <Kpi label="등기부 처리율" value={`${TOTALS.registryPct}%`} tone="navy" />
      </div>

      {/* 조치 필요 큐 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">⚠ 조치 필요 큐 <span className="text-gray-400">({ISSUES.length})</span></h2>
          <span className="text-[11px] text-gray-400">사람이 확인할 항목만 모았습니다</span>
        </div>
        <ul className="divide-y divide-gray-50">
          {ISSUES.map((i, n) => (
            <li key={n} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-l-2 ${i.severity === "red" ? "border-red-400" : "border-amber-300"}`}>
              <span className="w-14 shrink-0 text-[11px] font-medium text-gray-400">{i.fund}</span>
              <span className="w-28 shrink-0 text-sm font-medium">{i.company}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ring-1 ${kindColor[i.kind]}`}>{i.kind}</span>
              <span className="flex-1 truncate text-xs text-gray-500">{i.detail}</span>
              <button className="shrink-0 rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100">확인 →</button>
            </li>
          ))}
        </ul>
      </div>

      {/* 펀드 카드 */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-800">펀드</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FUNDS.map((f) => {
            const fl = fundFlags(f);
            return (
              <div key={f.slug} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-[#1f3a5f]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: NAVY }}>{f.name}</span>
                  <span className="text-[11px] text-gray-400">{f.companies}곳</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                  {f.processed ? (
                    <>
                      {fl.red > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">🔴 {fl.red}</span>}
                      {fl.yellow > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">🟡 {fl.yellow}</span>}
                      {fl.red === 0 && fl.yellow === 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">✓ 이상 없음</span>}
                    </>
                  ) : (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">미분석</span>
                  )}
                </div>
                <div className="mt-2 text-[11px] text-gray-400">등기부 {f.registryPct}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
