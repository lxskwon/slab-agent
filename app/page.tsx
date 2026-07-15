import { getDashboard, slabEnabled } from "@/lib/slab/service";
import { NAVY } from "./tracker-tables";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!slabEnabled()) {
    return <div className="text-sm text-gray-600">SLAB API 미설정 (.env.local 확인)</div>;
  }
  let dash;
  try {
    dash = await getDashboard();
  } catch (e) {
    return <div className="text-sm text-red-600">SLAB 연결 오류: {(e as Error).message}</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>SLAB 데이터 최신화 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">전 펀드 자동 대조 · 사람은 아래 큐만 확인하면 됩니다</p>
      </div>
      <DashboardClient dash={dash} />
    </div>
  );
}
