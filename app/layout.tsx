import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import "./globals.css";
import LogoutButton from "./logout-button";

export const metadata: Metadata = {
  title: "SLAB 데이터 최신화 에이전트",
  description: "후속투자 · 감액 체크리스트 생성",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = await cookies();
  const raw = c.get("slab_name")?.value ?? "";
  let name = "";
  try { name = decodeURIComponent(raw); } catch { name = raw; }
  const loggedIn = !!c.get("slab_auth")?.value;

  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-[1400px] items-center px-6 py-3">
              <Link href="/" className="text-sm font-semibold">
                SLAB 에이전트
              </Link>
              {loggedIn && <LogoutButton name={name} />}
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
