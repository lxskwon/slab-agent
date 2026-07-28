"use client";

import { useEffect, useRef, useState } from "react";

const NAVY = "#1f3a5f";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "지금 확인해야 할 조치 필요 항목 알려줘",
  "SKF4에서 후속투자 불일치인 기업은?",
  "감액 미반영인 기업이 왜 미반영이야?",
  "등기부등본 아직 못 읽은 기업은 몇 개야?",
];

// SSE 도구명 → 사용자용 라벨
const TOOL_LABELS: Record<string, string> = {
  list_funds: "펀드 목록 조회 중…",
  get_dashboard: "전체 현황 조회 중…",
  get_fund_tracker: "펀드 상세 조회 중…",
  get_company_detail: "기업 상세 조회 중…",
};

export default function ChatClient() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>(""); // 도구/생각 상태
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    setStatus("생각 중…");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`요청 실패 (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistant = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim()) as
            | { type: "text"; text: string }
            | { type: "tool"; tool: string }
            | { type: "error"; message: string }
            | { type: "done" };

          if (ev.type === "text") {
            assistant += ev.text;
            setStatus("");
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { role: "assistant", content: assistant };
              return next;
            });
          } else if (ev.type === "tool") {
            setStatus(TOOL_LABELS[ev.tool] ?? "데이터 조회 중…");
          } else if (ev.type === "error") {
            assistant += `\n\n⚠️ 오류: ${ev.message}`;
            setMessages((m) => {
              const next = [...m];
              next[next.length - 1] = { role: "assistant", content: assistant };
              return next;
            });
          }
        }
      }
      if (!assistant) {
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", content: "(응답이 비었습니다)" };
          return next;
        });
      }
    } catch (e) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", content: `⚠️ ${(e as Error).message}` };
        return next;
      });
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white" style={{ height: "70vh" }}>
      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">예시 질문:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm text-white"
                  : "max-w-[85%] whitespace-pre-wrap rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900"
              }
              style={m.role === "user" ? { backgroundColor: NAVY } : undefined}
            >
              {m.content || (busy && i === messages.length - 1 ? <span className="text-gray-400">{status || "…"}</span> : "")}
            </div>
          </div>
        ))}

        {busy && status && messages[messages.length - 1]?.content && (
          <div className="flex justify-start">
            <div className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">{status}</div>
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-gray-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="펀드나 기업에 대해 물어보세요…"
          disabled={busy}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: NAVY }}
        >
          전송
        </button>
      </form>
    </div>
  );
}
