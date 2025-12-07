import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL 환경 변수가 설정되지 않았습니다.");
}

const sql = neon(process.env.DATABASE_URL);

export default sql;

