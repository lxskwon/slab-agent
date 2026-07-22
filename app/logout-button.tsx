"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({ name }: { name: string }) {
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };
  return (
    <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
      {name && <span><span className="font-medium text-gray-700">{name}</span>님</span>}
      <button onClick={logout} className="rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50">
        로그아웃
      </button>
    </div>
  );
}
