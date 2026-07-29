"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const NAVY = "#1f3a5f";
const STORAGE_KEY = "slab-chats-v1"; // 다중 대화 저장 (브라우저 로컬)
const OLD_SINGLE_KEY = "slab-chat-v1"; // 이전 단일 대화 저장 키 (마이그레이션용)
const MAX_CHATS = 50; // 로컬 저장 상한

interface Msg {
  role: "user" | "assistant";
  content: string;
}
interface Chat {
  id: string;
  title: string;
  messages: Msg[];
  updatedAt: number;
}

// ── 유틸 ──
function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
function deriveTitle(msgs: Msg[]): string {
  const first = msgs.find((m) => m.role === "user")?.content?.trim() || "새 대화";
  return first.length > 30 ? first.slice(0, 30) + "…" : first;
}
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
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

const TOOL_LABELS: Record<string, string> = {
  list_funds: "펀드 목록 조회 중…",
  get_dashboard: "전체 현황 조회 중…",
  get_fund_tracker: "펀드 상세 조회 중…",
  get_company_detail: "기업 상세 조회 중…",
};

export default function ChatClient() {
  const [chats, setChats] = useState<Chat[]>([]); // 저장된 모든 대화
  const [activeId, setActiveId] = useState<string | null>(null); // 현재 대화 id (없으면 새 대화 대기)
  const [messages, setMessages] = useState<Msg[]>([]); // 현재 대화 진행 상태
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>(""); // 도구/생각 상태
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // 마운트 시 저장된 대화 로드 (+ 이전 단일 대화 마이그레이션). 자동으로 열지는 않음.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as Chat[];
        if (Array.isArray(arr) && arr.length) {
          setChats(arr);
          return;
        }
      }
      const old = localStorage.getItem(OLD_SINGLE_KEY);
      if (old) {
        const msgs = JSON.parse(old) as Msg[];
        if (Array.isArray(msgs) && msgs.length) {
          const migrated: Chat = { id: genId(), title: deriveTitle(msgs), messages: msgs, updatedAt: Date.now() };
          setChats([migrated]);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([migrated]));
            localStorage.removeItem(OLD_SINGLE_KEY);
          } catch {
            /* 무시 */
          }
        }
      }
    } catch {
      /* 파싱 실패 무시 */
    }
  }, []);

  function persist(next: Chat[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 용량 초과 등 무시 */
    }
  }

  // 턴이 끝나면(스트리밍 완료) 현재 대화를 저장 목록에 반영 (새 대화면 추가, 기존이면 갱신)
  useEffect(() => {
    if (busy || messages.length === 0 || !activeId) return;
    setChats((prev) => {
      const updated: Chat = { id: activeId, title: deriveTitle(messages), messages, updatedAt: Date.now() };
      const has = prev.some((c) => c.id === activeId);
      const next = (has ? prev.map((c) => (c.id === activeId ? updated : c)) : [updated, ...prev])
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_CHATS);
      persist(next);
      return next;
    });
  }, [messages, busy, activeId]);

  // 현재 대화를 떠나 대화 목록(랜딩)으로. 현재 대화는 이미 저장돼 목록에 남아있고, 새 질문을 보내면 새 대화가 시작된다.
  function backToList() {
    setMessages([]);
    setActiveId(null);
    setInput("");
  }
  // 새 대화 시작 — 랜딩으로 이동 후 입력창에 포커스(바로 타이핑 가능). 이전 대화는 목록에 보존됨.
  function newChat() {
    setMessages([]);
    setActiveId(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  function openChat(id: string) {
    const c = chats.find((x) => x.id === id);
    if (!c) return;
    setMessages(c.messages);
    setActiveId(id);
    setInput("");
  }
  function deleteChat(id: string) {
    if (typeof window !== "undefined" && !window.confirm("이 대화를 삭제할까요? 되돌릴 수 없어요.")) return;
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      persist(next);
      return next;
    });
    if (id === activeId) {
      setMessages([]);
      setActiveId(null);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    if (!activeId) setActiveId(genId()); // 새 대화 시작 — 기존 대화는 그대로 보존됨
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

  const activeTitle = messages.length > 0 ? chats.find((c) => c.id === activeId)?.title ?? deriveTitle(messages) : "SLAB 챗봇";

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white" style={{ height: "70vh" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{activeTitle}</span>
        {messages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={backToList}
              disabled={busy}
              className="whitespace-nowrap rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              ← 목록
            </button>
            <button
              onClick={newChat}
              disabled={busy}
              className="whitespace-nowrap rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              + 새 대화
            </button>
            {activeId && (
              <button
                onClick={() => deleteChat(activeId)}
                disabled={busy}
                className="whitespace-nowrap rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-40"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>

      {/* 메시지 / 랜딩 */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-5">
            {/* 지난 대화 목록 (있을 때만) */}
            {chats.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">지난 대화 <span className="font-normal text-gray-400">({chats.length})</span></p>
                <div className="space-y-1.5">
                  {chats.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50"
                    >
                      <button onClick={() => openChat(c.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm text-gray-800">{c.title}</span>
                        <span className="text-xs text-gray-400">{relTime(c.updatedAt)} · {c.messages.length}개 메시지</span>
                      </button>
                      <button
                        onClick={() => deleteChat(c.id)}
                        className="rounded p-1 text-gray-400 hover:text-red-600"
                        title="삭제"
                        aria-label="대화 삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 예시 질문 */}
            <div className="space-y-3">
              <p className="text-sm text-gray-500">{chats.length > 0 ? "새 질문으로 새 대화 시작:" : "예시 질문:"}</p>
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
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* 입력 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-gray-200 p-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={messages.length === 0 ? "새 대화를 시작하세요…" : "펀드나 기업에 대해 물어보세요…"}
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
