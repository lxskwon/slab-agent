import { NAVY } from "./tracker-tables";

// 서버 렌더(콜드 재계산) 대기 중 즉시 표시되는 스켈레톤 — 빈 화면 대기 대신 형태를 먼저 보여줌.
export default function Loading() {
  const box = "animate-pulse rounded-xl bg-gray-100";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>SLAB 데이터 최신화 대시보드</h1>
        <p className="mt-1 text-sm text-gray-400">불러오는 중…</p>
      </div>
      {/* 검색 + 필터 자리 */}
      <div className={`h-9 w-full max-w-md ${box}`} />
      <div className="flex gap-3">
        <div className={`h-9 w-40 ${box}`} />
        <div className={`ml-auto h-9 w-40 ${box}`} />
      </div>
      {/* KPI 4칸 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`h-20 ${box}`} />)}
      </div>
      {/* 큐 2열 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`h-72 ${box}`} />
        <div className={`h-72 ${box}`} />
      </div>
    </div>
  );
}
