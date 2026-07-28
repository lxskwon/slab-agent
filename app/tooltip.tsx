"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WIDTH = 220;
const MARGIN = 8; // 화면 가장자리 최소 여백

/**
 * 'ⓘ/?' 아이콘에 마우스를 올리면 설명 말풍선을 보여주는 툴팁.
 * 말풍선은 document.body로 포털 렌더 + position:fixed → 카드의 overflow-hidden/스택에
 * 잘리지 않고, 화면 밖으로 넘치지 않게 좌우 위치를 클램프한다.
 */
export function Info({ text, pos = "top", className = "" }: { text: string; pos?: "top" | "bottom"; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const [coord, setCoord] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!show || !ref.current) { setCoord(null); return; }
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - MARGIN));
    const top = pos === "top" ? r.top : r.bottom;
    setCoord({ top, left });
  }, [show, pos]);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className={`inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-gray-300 align-middle text-[9px] font-bold leading-none text-gray-400 transition hover:border-[#1f3a5f] hover:text-[#1f3a5f] ${className}`}
      >?</span>
      {show && coord && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            top: coord.top,
            left: coord.left,
            width: WIDTH,
            transform: pos === "top" ? "translateY(calc(-100% - 6px))" : "translateY(6px)",
          }}
          className="pointer-events-none z-[9999] rounded-lg bg-gray-900 px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-white shadow-lg"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
