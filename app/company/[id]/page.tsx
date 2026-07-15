import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyDetail } from "@/lib/slab/service";
import { NAVY } from "../../tracker-tables";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}주`);

const matchTone: Record<string, string> = {
  일치: "bg-green-100 text-green-700 ring-green-200",
  불일치: "bg-red-100 text-red-700 ring-red-200",
};
const reflectTone: Record<string, string> = {
  "이미 반영됨": "bg-green-100 text-green-700 ring-green-200",
  미반영: "bg-red-100 text-red-700 ring-red-200",
  판단애매: "bg-amber-100 text-amber-700 ring-amber-200",
};

function Pill({ text, tone }: { text: string; tone?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${tone ?? "bg-gray-100 text-gray-600 ring-gray-200"}`}>{text}</span>;
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCompanyDetail(id);
  if (!c) notFound();
  const fu = c.followup;

  return (
    <div className="space-y-4">
      <Link href="/funds" className="text-xs text-gray-400 hover:text-gray-700">← 펀드 현황</Link>

      {/* 헤더 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>{c.name}</h1>
            <p className="mt-1 text-xs text-gray-500">
              {c.nameEn && <span>{c.nameEn} · </span>}
              {c.foreign ? `해외기업 (계약언어: ${c.lang})` : "국내기업"}
              {c.investStatus && <span> · SLAB 상태: {c.investStatus}</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-gray-400">소속 펀드</div>
            <div className="text-lg font-bold tabular-nums" style={{ color: NAVY }}>{c.funds.length}</div>
          </div>
        </div>
      </div>

      {/* 후속투자 — 발행주식총수 3-출처 대조 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">후속투자 · 발행주식총수 대조</h2>
          {fu && fu.match && <Pill text={fu.match} tone={matchTone[fu.match]} />}
        </div>
        {fu ? (
          <div className="grid grid-cols-1 gap-px bg-gray-100 sm:grid-cols-3">
            <Source label="SLAB" value={fmt(fu.slabShares)} />
            <Source
              label={`등기부등본${fu.registryQuarter ? ` · ${fu.registryQuarter}` : ""}`}
              value={fmt(fu.registryShares)}
              extra={fu.registryDate ?? undefined}
              link={fu.registryUrl ?? undefined}
            />
            <Source label="분기보고" value={fmt(fu.reportShares)} />
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-sm text-gray-400">후속투자 데이터가 없습니다.</div>
        )}
        {fu?.note && <div className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">비고 · {fu.note}</div>}
      </div>

      {/* 소속 펀드 + 감액 상태 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">소속 펀드 <span className="font-normal text-gray-400">({c.funds.length})</span></h2>
        </div>
        <ul className="divide-y divide-gray-50">
          {c.funds.map((f) => (
            <li key={f.slug} className="flex items-center gap-3 px-4 py-2.5">
              <Link href={`/fund/${f.slug}`} className="w-32 shrink-0 text-sm font-medium hover:text-[#1f3a5f]" style={{ color: NAVY }}>{f.name}</Link>
              <span className="text-xs text-gray-500">SLAB: {f.slabStatus || "미기재"}</span>
              {f.reflected && <Pill text={f.reflected} tone={reflectTone[f.reflected]} />}
              {f.writeoffUploaded && f.note && <span className="flex-1 truncate text-[11px] text-gray-400">{f.note}</span>}
              {!f.writeoffUploaded && <span className="text-[11px] text-gray-300">감액 DB 미업로드</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Source({ label, value, extra, link }: { label: string; value: string; extra?: string; link?: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: NAVY }}>{value}</div>
      {extra && <div className="text-[11px] text-gray-400">{extra}</div>}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-[#1f3a5f] underline">PDF 열기 ↗</a>
      )}
    </div>
  );
}
