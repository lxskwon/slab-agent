import { runChat, type ChatMessage } from "@/lib/chatbot/agent";
import { authUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // 도구 조회 + 생각 시간 여유

/** 챗봇 스트리밍 엔드포인트. body: { messages: ChatMessage[] } → SSE(ChatEvent). */
export async function POST(req: Request) {
  let messages: ChatMessage[];
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return new Response("잘못된 요청", { status: 400 });
  }
  if (messages.length === 0) return new Response("메시지가 없습니다", { status: 400 });

  const user = authUser(req);
  const enc = new TextEncoder();
  const send = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runChat(messages, user)) {
          controller.enqueue(send(ev));
        }
      } catch (e) {
        controller.enqueue(send({ type: "error", message: (e as Error).message }));
      } finally {
        controller.enqueue(send({ type: "done" }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
