// CLI 스크립트용 env 로더: .env.local 우선, 그다음 .env (dotenv 기본은 .env만 읽음).
// 반드시 다른 import보다 먼저 import 되어야 함 (env를 읽는 모듈보다 앞서 실행).
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
