import { execSync } from "node:child_process";
import { config } from "dotenv";

// Roda uma vez antes de toda a suíte: aplica as migrations no banco de teste.
// `migrate deploy` só aplica o que já existe — não gera migration nova nem pede confirmação.
export default function setup() {
  const env = { ...process.env, ...(config({ path: ".env.test" }).parsed ?? {}) };

  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
}
