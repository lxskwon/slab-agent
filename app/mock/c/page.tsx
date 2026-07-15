import { NAVY, ISSUES, TOTALS } from "@/lib/mock/dashboard";
import { MockNav } from "../nav";

function Card({ fund, company, kind, detail }: { fund: string; company: string; kind: string; detail: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{company}</span>
        <span className="text-[10px] text-gray-400">{fund}</span>
      </div>
      <div className="mt-1 text-[11px] font-medium text-gray-600">{kind}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-gray-500">{detail}</div>
    </div>
  );
}

function Column({ title, tint, count, children }: { title: string; tint: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="flex-1 rounded-xl bg-gray-50 p-3">
      <div className={`mb-2 flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold ${tint}`}>
        <span>{title}</span>
        <span className="tabular-nums">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function ConceptC() {
  const red = ISSUES.filter((i) => i.severity === "red");
  const yellow = ISSUES.filter((i) => i.severity === "yellow");
  const done = TOTALS.companies - red.length - yellow.length;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: NAVY }}>리뷰 보드</h1>
          <p className="mt-0.5 text-xs text-gray-500">긴급도별로 정리 — 왼쪽부터 처리하세요</p>
        </div>
        <MockNav active="c" />
      </div>
      <div className="flex gap-3">
        <Column title="🔴 조치 필요" tint="bg-red-100 text-red-800" count={red.length}>
          {red.map((i, n) => <Card key={n} {...i} />)}
        </Column>
        <Column title="🟡 확인 필요" tint="bg-amber-100 text-amber-800" count={yellow.length}>
          {yellow.map((i, n) => <Card key={n} {...i} />)}
        </Column>
        <Column title="✅ 이상 없음" tint="bg-green-100 text-green-800" count={done}>
          <div className="rounded-lg border border-dashed border-gray-200 bg-white/50 p-3 text-center text-[11px] text-gray-400">
            {done}개 기업 자동 대조 완료<br />(검토 불필요)
          </div>
        </Column>
      </div>
    </div>
  );
}
