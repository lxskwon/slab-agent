import { slabEnabled } from "@/lib/slab/service";
import ChatClient from "./chat-client";

export const dynamic = "force-dynamic";

const NAVY = "#1f3a5f";

export default function ChatPage() {
  if (!slabEnabled()) {
    return <div className="text-sm text-gray-600">SLAB API 미설정 — 챗봇을 사용할 수 없습니다.</div>;
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: NAVY }}>
          SLAB 챗봇
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          펀드·기업 데이터를 물어보세요. 답변은 실제 SLAB 조회 결과에 근거합니다. (읽기 전용)
        </p>
      </div>
      <ChatClient />
    </div>
  );
}
