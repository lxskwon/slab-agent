"use client";

/**
 * 작은 'ⓘ/?' 아이콘 위에 마우스를 올리면 설명 말풍선을 보여주는 툴팁.
 * pos로 말풍선 방향(top/bottom) 지정. pointer-events-none이라 클릭 방해 없음.
 */
export function Info({ text, pos = "top", className = "" }: { text: string; pos?: "top" | "bottom"; className?: string }) {
  const place = pos === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";
  return (
    <span className={`group relative inline-flex align-middle ${className}`}>
      <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-300 text-[9px] font-bold leading-none text-gray-400 transition group-hover:border-[#1f3a5f] group-hover:text-[#1f3a5f]">?</span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 w-52 -translate-x-1/2 whitespace-normal break-words rounded-lg bg-gray-900 px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 ${place}`}
      >
        {text}
      </span>
    </span>
  );
}
