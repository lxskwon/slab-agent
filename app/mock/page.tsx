import Link from "next/link";
import { NAVY } from "@/lib/mock/dashboard";

const CONCEPTS = [
  { slug: "a", title: "A · 종합 대시보드 + 리뷰 큐", desc: "상단 KPI + 전 펀드 통합 '조치 필요 큐' + 펀드 카드. 멘토용 요약 + 실무용 액션 리스트 겸용." },
  { slug: "b", title: "B · 펀드 헬스 그리드", desc: "펀드별 카드에 후속/감액 진행률 막대, 등기 커버리지, 플래그 수. 펀드 간 비교·진행도." },
  { slug: "c", title: "C · 트리아지 보드", desc: "긴급도별 칸반(조치필요/확인필요/완료). '무엇부터 볼지'가 가장 직관적." },
];

export default function MockIndex() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: NAVY }}>대시보드 컨셉 미리보기</h1>
        <p className="mt-0.5 text-sm text-gray-500">세 방향을 실제 화면으로 만들어봤어요. 눌러보고 마음에 드는 걸 골라주세요 (데이터는 예시).</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {CONCEPTS.map((c) => (
          <Link key={c.slug} href={`/mock/${c.slug}`} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-[#1f3a5f] hover:shadow-sm">
            <div className="text-sm font-semibold" style={{ color: NAVY }}>{c.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-500">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
