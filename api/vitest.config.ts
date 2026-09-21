import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Carrega o .env.test e injeta explicitamente no ambiente dos testes, garantindo
// que eles nunca apontem para o banco de desenvolvimento.
const envDeTeste = config({ path: ".env.test" }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: envDeTeste,
    globalSetup: ["tests/globalSetup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Os arquivos de teste compartilham o mesmo banco; rodar em série evita
    // que a limpeza de um derrube os dados de outro.
    fileParallelism: false,
  },
});
