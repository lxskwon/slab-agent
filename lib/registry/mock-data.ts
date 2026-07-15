import type { RegistryExtract } from "@/lib/types";

/**
 * 등기부등본 목업 fallback.
 * 실제로는 data/registry-samples/의 PDF에서 파싱하므로 보통 여기까지 오지 않는다.
 * (해당 기업의 PDF가 폴더에 없을 때만 fallback으로 사용됨)
 */
export const MOCK_REGISTRY: Record<string, RegistryExtract> = {};
