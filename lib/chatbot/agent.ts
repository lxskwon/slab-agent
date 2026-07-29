import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS, dispatchTool } from "./tools";
import { SYSTEM_PROMPT } from "./system-prompt";
import { logLlmUsage } from "@/lib/llm/usage";

/**
 * 챗봇 답변 루프 — 이 파일이 재사용 가능한 핵심 로직이다.
 *
 * 수동 tool-use 루프: Claude 호출 → 도구 요청이 있으면 dispatchTool로 실행 →
 * 결과를 다시 넣고 반복 → 도구 요청이 없으면 종료. 최종 답변 텍스트를 스트리밍한다.
 *
 * 이식 노트: 멘토 챗봇으로 옮길 때 이 루프는 그대로 쓰고, tools.ts의 dispatchTool만
 * 멘토 데이터 소스로 갈아끼우면 된다. 모델·프롬프트·루프는 불변.
 */

const MODEL = "claude-opus-4-8";
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
  const client = new Anthropic({ maxRetries: 2 });
  const msgs: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  let totalIn = 0;
  let totalOut = 0;
  let prevTurnHadText = false; // 직전 턴이 텍스트를 냈는지 (도구 호출을 사이에 둔 답변이 붙는 것 방지)

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        tools: CHAT_TOOLS,
        messages: msgs,
      });

      let turnHadText = false;
      // 직전 턴(예: 도구 호출 전 안내)과 이번 턴 답변 사이에 문단 구분 삽입 — 텍스트가 실제로 나올 때만.
      let needSeparator = i > 0 && prevTurnHadText;
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          if (!turnHadText && needSeparator) {
            yield { type: "text", text: "\n\n" };
            needSeparator = false;
          }
          turnHadText = true;
          yield { type: "text", text: ev.delta.text };
        }
      }

      const final = await stream.finalMessage();
      totalIn += final.usage.input_tokens ?? 0;
      totalOut += final.usage.output_tokens ?? 0;

      if (final.stop_reason !== "tool_use") break;

      // 도구 요청 처리: assistant content(생각 블록 포함)를 그대로 되돌려 넣고,
      // 각 tool_use에 대한 tool_result를 한 user 메시지로 모아 넣는다.
      msgs.push({ role: "assistant", content: final.content });
      const toolUses = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        yield { type: "tool", tool: tu.name };
        let out: unknown;
        try {
          out = await dispatchTool(tu.name, tu.input);
        } catch (e) {
          out = { error: (e as Error).message };
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      msgs.push({ role: "user", content: results });
      prevTurnHadText = turnHadText;
    }
  } finally {
    // 사용량은 성공/실패와 무관하게 기록 (관리자 대시보드 집계용).
    await logLlmUsage({ feature: "챗봇", model: MODEL, user, inputTokens: totalIn, outputTokens: totalOut });
  }
}
