# Echo — API (backend)

Backend do Echo: Node.js + TypeScript + Express + Prisma + PostgreSQL.

## Pré-requisitos
- Node.js 20+
- Docker (para subir o Postgres local)

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Criar o .env a partir do exemplo
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env

# 3. Subir o Postgres (Docker)
npm run db:up

# 4. Criar as tabelas no banco (a partir do schema Prisma)
npm run prisma:migrate

# 5. Subir a API em modo desenvolvimento
npm run dev
```

A API sobe em `http://localhost:3333`. Teste rápido: `GET http://localhost:3333/api/health`.

## Scripts
| Script | O que faz |
|---|---|
| `npm run dev` | Sobe a API com hot-reload (tsx) |
| `npm run build` / `start` | Compila para `dist/` e roda em produção |
| `npm run db:up` / `db:down` | Sobe / derruba o Postgres via Docker |
| `npm run prisma:migrate` | Aplica as migrations (cria/atualiza tabelas) |
| `npm run prisma:studio` | Abre o Prisma Studio (visualizar dados) |

## Estrutura
```
api/
├─ prisma/schema.prisma   # modelo de dados
├─ src/
│  ├─ server.ts           # ponto de entrada (Express)
│  └─ prisma.ts           # client do Prisma
├─ docker-compose.yml     # Postgres local
└─ .env.example           # variáveis de ambiente
```

> Contrato dos endpoints do MVP: [`../docs/CONTRATO-API.md`](../docs/CONTRATO-API.md).
