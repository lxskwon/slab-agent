import Link from "next/link";

const TABS = [
  { slug: "a", label: "A 종합+큐" },
  { slug: "b", label: "B 펀드 그리드" },
  { slug: "c", label: "C 트리아지" },
];

export function MockNav({ active }: { active: string }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <Link href="/mock" className="mr-2 text-gray-400 hover:text-gray-700">← 컨셉 목록</Link>
      {TABS.map((t) => (
        <Link
          key={t.slug}
          href={`/mock/${t.slug}`}
          className={`rounded-md px-2.5 py-1 ring-1 ${active === t.slug ? "bg-[#1f3a5f] text-white ring-[#1f3a5f]" : "bg-white text-gray-600 ring-gray-300 hover:bg-gray-50"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
