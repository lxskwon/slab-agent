import "server-only";
import OpenAI from "openai";
import { CHAT_TOOLS, dispatchTool } from "./tools";
import { SYSTEM_PROMPT } from "./system-prompt";
import { logLlmUsage } from "@/lib/llm/usage";

/**
 * 챗봇 답변 루프 — 이 파일이 재사용 가능한 핵심 로직이다.
 *
 * 수동 tool-use 루프: GPT 호출 → 도구 요청이 있으면 dispatchTool로 실행 →
 * 결과를 다시 넣고 반복 → 도구 요청이 없으면 종료. 최종 답변 텍스트를 스트리밍한다.
 *
 * 이식 노트: 멘토 챗봇으로 옮길 때 이 루프는 그대로 쓰고, tools.ts의 dispatchTool만
 * 멘토 데이터 소스로 갈아끼우면 된다. 모델·프롬프트·루프는 불변.
 */

const MODEL = "gpt-4.1-mini";
const MAX_ITERATIONS = 8;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** 스트림 이벤트: 도구 실행 상태 또는 답변 텍스트 델타. */
export type ChatEvent =
  | { type: "tool"; tool: string }
  | { type: "text"; text: string };

export async function* runChat(history: ChatMessage[], user?: string): AsyncGenerator<ChatEvent> {
  const client = new OpenAI({ maxRetries: 2 });
  const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let totalIn = 0;
  let totalOut = 0;
  let prevTurnHadText = false; // 직전 턴이 텍스트를 냈는지 (도구 호출을 사이에 둔 답변이 붙는 것 방지)

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const stream = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 8000,
        stream: true,
        stream_options: { include_usage: true },
        tools: CHAT_TOOLS,
        messages: msgs,
      });

      let turnHadText = false;
      let assistantText = ""; // 히스토리에 되돌려 넣을 이번 턴 답변 텍스트
      // 스트리밍되는 tool_call 조각을 index별로 누적 (id·name·arguments가 나눠서 옴)
      const toolAcc: Record<number, { id: string; name: string; args: string }> = {};
      let finishReason: string | null = null;
      // 직전 턴(예: 도구 호출 전 안내)과 이번 턴 답변 사이에 문단 구분 삽입 — 텍스트가 실제로 나올 때만.
      let needSeparator = i > 0 && prevTurnHadText;

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          if (!turnHadText && needSeparator) {
            yield { type: "text", text: "\n\n" };
            needSeparator = false;
          }
          turnHadText = true;
          assistantText += delta.content;
          yield { type: "text", text: delta.content };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const cur = (toolAcc[tc.index] ??= { id: "", name: "", args: "" });
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
          }
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        // include_usage: 마지막 청크에 usage가 담겨 옴 (choices는 비어 있음)
        if (chunk.usage) {
          totalIn += chunk.usage.prompt_tokens ?? 0;
          totalOut += chunk.usage.completion_tokens ?? 0;
        }
      }

      const calls = Object.values(toolAcc);
      if (finishReason !== "tool_calls" && calls.length === 0) break;

      // 도구 요청 처리: assistant 메시지(텍스트 + tool_calls)를 그대로 되돌려 넣고,
      // 각 tool_call에 대한 결과를 role:"tool" 메시지로 이어 넣는다.
      msgs.push({
        role: "assistant",
        content: assistantText || null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.args || "{}" },
        })),
      });
      for (const c of calls) {
        yield { type: "tool", tool: c.name };
        let out: unknown;
        try {
          const parsed = c.args ? JSON.parse(c.args) : {};
          out = await dispatchTool(c.name, parsed);
        } catch (e) {
          out = { error: (e as Error).message };
        }
        msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
      }
      prevTurnHadText = turnHadText;
    }
  } finally {
    // 사용량은 성공/실패와 무관하게 기록 (관리자 대시보드 집계용).
    await logLlmUsage({ feature: "챗봇", model: MODEL, user, inputTokens: totalIn, outputTokens: totalOut });
  }
}
