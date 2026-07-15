import { Redis } from "@upstash/redis";

/**
 * 스토리지 백엔드 감지.
 * - 로컬/컨테이너(디스크 쓰기 가능): CLOUD=false → 파일시스템 사용 (기존 동작 유지)
 * - Vercel(읽기전용 FS): Upstash Redis 환경변수가 있으면 CLOUD=true → Redis/Blob 사용
 * Upstash 통합은 KV_REST_API_* 또는 UPSTASH_REDIS_REST_* 둘 중 하나로 주입됨 → 둘 다 지원.
 */

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const CLOUD = Boolean(REDIS_URL && REDIS_TOKEN);
export const BLOB_ENABLED = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

let _redis: Redis | null = null;
export function redis(): Redis {
  if (!_redis) _redis = new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! });
  return _redis;
}
