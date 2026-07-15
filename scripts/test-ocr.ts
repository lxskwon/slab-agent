import "dotenv/config";
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const path = process.argv[2];
  const buf = await readFile(path);
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            shareCountTotal: { type: ["integer", "null"] },
            issueDate: { type: ["string", "null"] },
            confidence: { type: "number" },
            reasoning: { type: "string" },
            allShareEntriesSeen: {
              type: "array",
              items: { type: "string" },
              description: "본 문서에서 본 모든 '발행주식의 총수' 항목 (취소선 여부 포함)",
            },
          },
          required: ["shareCountTotal", "issueDate", "confidence", "reasoning", "allShareEntriesSeen"],
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
          {
            type: "text",
            text: "등기부등본에서 발행주식의 총수(취소선 없는 현재값), 발행일/열람일을 추출하고, 본 모든 발행주식의 총수 항목을 취소선 여부와 함께 나열해줘.",
          },
        ],
      },
    ],
  });
  const t = res.content.find((b) => b.type === "text");
  if (t && t.type === "text") console.log(JSON.stringify(JSON.parse(t.text), null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
