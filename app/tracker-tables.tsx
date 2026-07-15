import Link from "next/link";
import type { FollowupRow, WriteoffRow, Flag } from "@/lib/tracker/mock-data";

export const NAVY = "#1f3a5f";

function CompanyName({ name, id }: { name: string; id?: string }) {
  if (!id) return <>{name}</>;
  return <Link href={`/company/${id}`} className="hover:text-[#1f3a5f] hover:underline">{name}</Link>;
}

function rowBg(flag: Flag): string {
  if (flag === "red") return "bg-red-50";
  if (flag === "yellow") return "bg-amber-50";
  return "";
}

function Td({
  children,
  className = "",
  right = false,
}: {
  children?: React.ReactNode;
  className?: string;
  right?: boolean;
}) {
  return (
    <td
      className={`border border-gray-300 px-2 py-1 align-middle ${right ? "text-left tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

function Th({ children, w }: { children: React.ReactNode; w?: string }) {
  return (
    <th
      className="border border-[#16304d] px-2 py-1.5 text-center text-[11px] font-semibold leading-tight text-white"
      style={{ backgroundColor: NAVY, width: w }}
    >
      {children}
    </th>
  );
}

function shares(n: number | null): string {
  return n == null ? "" : `${n.toLocaleString("ko-KR")}주`;
}

export function FollowupTable({ rows }: { rows: FollowupRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <Th w="40px">NO</Th>
            <Th w="170px">회사명</Th>
            <Th w="90px">분기(대상)</Th>
            <Th w="130px">투자유치여부<br />(자가보고)</Th>
            <Th w="110px">등기부등본<br />확인일</Th>
            <Th w="120px">등기상<br />발행주식총수</Th>
            <Th w="120px">SLAB상<br />발행주식총수</Th>
            <Th w="66px">일치여부</Th>
            <Th w="92px">후속투자<br />해당여부</Th>
            <Th>비고</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.no} className={rowBg(r.flag)}>
              <Td right>{r.no}</Td>
              <Td className="font-medium whitespace-nowrap"><CompanyName name={r.company} id={r.companyId} /></Td>
              <Td className="whitespace-nowrap">{r.quarter}</Td>
              <Td>{r.investStatus}</Td>
              <Td className="whitespace-nowrap">{r.registryDate ?? ""}</Td>
              <Td right>{shares(r.registryShares)}</Td>
              <Td right>{shares(r.slabShares)}</Td>
              <Td
                className={
                  r.match === "불일치"
                    ? "text-center font-bold text-red-600"
                    : "text-center text-gray-700"
                }
              >
                {r.match}
              </Td>
              <Td className="text-center">{r.followupApplicable}</Td>
              <Td className="text-[11px] leading-snug text-gray-600">{r.note}</Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="border border-gray-300 px-3 py-6 text-center text-gray-400">
                해당 펀드에 표시할 기업이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function WriteoffTable({ rows }: { rows: WriteoffRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <Th w="40px">NO</Th>
            <Th w="180px">회사명</Th>
            <Th w="140px">스프레드시트 상태</Th>
            <Th w="110px">SLAB 반영여부</Th>
            <Th>비고</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.no} className={rowBg(r.flag)}>
              <Td right>{r.no}</Td>
              <Td className="font-medium whitespace-nowrap"><CompanyName name={r.company} id={r.companyId} /></Td>
              <Td className="whitespace-nowrap">{r.sheetStatus}</Td>
              <Td
                className={
                  r.reflected === "미반영"
                    ? "font-bold text-red-600"
                    : r.reflected === "판단애매"
                      ? "font-bold text-amber-600"
                      : "text-gray-700"
                }
              >
                {r.reflected}
              </Td>
              <Td className="text-[11px] leading-snug text-gray-600">{r.note}</Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="border border-gray-300 px-3 py-6 text-center text-gray-400">
                해당 펀드에 표시할 기업이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
