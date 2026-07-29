"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const NAVY = "#1f3a5f";
const STORAGE_KEY = "slab-chat-v1"; // 새로고침 후에도 대화 유지 (브라우저 로컬 저장)

interface Msg {
  role: "user" | "assistant";
  content: string;
}

// 답변 마크다운 렌더링 (표/굵게/목록). Tailwind 기본 스타일이 없어 요소별로 지정.
const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold" style={{ color: NAVY }}>{children}</strong>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="mb-1.5 mt-2 text-base font-bold first:mt-0" style={{ color: NAVY }}>{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-2 text-sm font-bold first:mt-0" style={{ color: NAVY }}>{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: NAVY }}>
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
  th: ({ children }) => <th className="border border-gray-300 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1 align-top">{children}</td>,
};

function Answer({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
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
  const [savedSession, setSavedSession] = useState<Msg[] | null>(null); // 새로고침 전 이전 대화(복원 후보)
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // 마운트 시: 저장된 이전 대화가 있으면 복원 후보로 제시 (자동 로드하지 않고 선택하게)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Msg[];
      if (Array.isArray(parsed) && parsed.length > 0) setSavedSession(parsed);
    } catch {
      /* 파싱 실패 무시 */
    }
  }, []);

  // 대화가 진행되면(스트리밍 끝난 상태) 자동 저장
  useEffect(() => {
    if (busy || messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* 용량 초과 등 무시 */
    }
  }, [messages, busy]);

  function startNew() {
    // 새 대화: 화면만 비워 새로 시작. 저장된 대화는 유지되며 다음 메시지 전송 시 덮어써진다. 완전 삭제는 deleteConversation.
    setMessages([]);
    setInput("");
    setSavedSession(null);
  }
  function deleteConversation() {
    if (typeof window !== "undefined" && !window.confirm("이 대화를 삭제할까요? 되돌릴 수 없어요.")) return;
    setMessages([]);
    setInput("");
    setSavedSession(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 무시 */
    }
  }
  function continueSession() {
    if (savedSession) setMessages(savedSession);
    setSavedSession(null);
  }
  const savedUserMsgs = savedSession?.filter((m) => m.role === "user") ?? [];
  const lastQuestion = savedUserMsgs.length ? savedUserMsgs[savedUserMsgs.length - 1].content : "";

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setSavedSession(null); // 새 질문을 보내면 복원 안내는 닫음(새 대화 시작으로 간주)
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
      {/* 헤더 (진행 중 표시 + 새 대화) */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <span className="text-xs text-gray-400">{messages.length > 0 ? "대화 진행 중 · 자동 저장됨" : "SLAB 챗봇"}</span>
        {messages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={startNew}
              disabled={busy}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              + 새 대화
            </button>
            <button
              onClick={deleteConversation}
              disabled={busy}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-40"
            >
              대화 삭제
            </button>
          </div>
        )}
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* 이전 대화 복원 안내 */}
        {messages.length === 0 && savedSession && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-800">
              이전 대화가 있어요 <span className="font-normal text-gray-400">· {savedSession.length}개 메시지</span>
            </p>
            {lastQuestion && <p className="mt-1 truncate text-xs text-gray-500">마지막 질문: {lastQuestion}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={continueSession}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: NAVY }}
              >
                이어서 하기
              </button>
              <button
                onClick={startNew}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                새 대화
              </button>
              <button
                onClick={deleteConversation}
                className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                대화 삭제
              </button>
            </div>
          </div>
        )}

        {/* 예시 질문 (이전 대화 없을 때만) */}
        {messages.length === 0 && !savedSession && (
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
                  : "max-w-[85%] rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900"
              }
              style={m.role === "user" ? { backgroundColor: NAVY } : undefined}
            >
              {m.role === "user" ? (
                m.content
              ) : m.content ? (
                <Answer text={m.content} />
              ) : busy && i === messages.length - 1 ? (
                <span className="text-gray-400">{status || "…"}</span>
              ) : (
                ""
              )}
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
