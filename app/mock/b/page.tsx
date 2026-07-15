import { NAVY, FUNDS, fundFlags, type MockFund } from "@/lib/mock/dashboard";
import { MockNav } from "../nav";

function Bar({ label, seg }: { label: string; seg: { v: number; c: string }[] }) {
  const total = seg.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-gray-400">
        <span>{label}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
        {seg.map((x, i) => (
          <div key={i} className={x.c} style={{ width: `${(x.v / total) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function FundCard({ f }: { f: MockFund }) {
  const fl = fundFlags(f);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold" style={{ color: NAVY }}>{f.name}</span>
        {f.processed ? (
          <div className="flex gap-1 text-[11px]">
            {fl.red > 0 && <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">🔴 {fl.red}</span>}
            {fl.yellow > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">🟡 {fl.yellow}</span>}
            {fl.red === 0 && fl.yellow === 0 && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">✓</span>}
          </div>
        ) : (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">미분석</span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-gray-400">{f.companies}개 기업</div>

      <div className="mt-3 space-y-2.5">
        <Bar label={`후속투자 · 일치 ${f.followup.match} / 불일치 ${f.followup.mismatch}`} seg={[
          { v: f.followup.match, c: "bg-green-400" },
          { v: f.followup.mismatch, c: "bg-red-400" },
          { v: f.followup.pending, c: "bg-gray-200" },
        ]} />
        <Bar label={`감액 · 반영 ${f.writeoff.reflected} / 미반영 ${f.writeoff.notReflected}`} seg={[
          { v: f.writeoff.reflected, c: "bg-green-400" },
          { v: f.writeoff.notReflected, c: "bg-red-400" },
          { v: f.writeoff.pending, c: "bg-gray-200" },
        ]} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1">
          <Bar label={`등기부 처리 ${f.registryPct}%`} seg={[{ v: f.registryPct, c: "bg-[#1f3a5f]" }, { v: 100 - f.registryPct, c: "bg-gray-200" }]} />
        </div>
      </div>
    </div>
  );
}

export default function ConceptB() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: NAVY }}>펀드 현황</h1>
          <p className="mt-0.5 text-xs text-gray-500">펀드별 후속투자·감액 진행률과 등기부 커버리지</p>
        </div>
        <MockNav active="b" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FUNDS.map((f) => <FundCard key={f.slug} f={f} />)}
      </div>
    </div>
  );
}
