# Echo — API (backend)

Backend do Echo: Node.js + TypeScript + Express + Prisma + PostgreSQL.

## Pré-requisitos
- Node.js 20+
- Docker (para subir o Postgres local)

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Criar o .env a partir do exemplo (e preencher o JWT_SECRET)
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env

# 3. Subir o Postgres (Docker)
npm run db:up

# 4. Criar as tabelas no banco (a partir do schema Prisma)
npm run prisma:migrate

# 5. Popular o banco com dados de desenvolvimento
npm run prisma:seed

# 6. Subir a API em modo desenvolvimento
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
| `npm run prisma:seed` | Popula o banco com os dados de desenvolvimento (idempotente) |
| `npm run prisma:studio` | Abre o Prisma Studio (visualizar dados) |

## Estrutura
```
api/
├─ prisma/
│  ├─ schema.prisma       # modelo de dados
│  └─ seed.ts             # dados de desenvolvimento (usuários, áreas, categorias, QR)
├─ src/
│  ├─ server.ts           # ponto de entrada (Express)
│  ├─ prisma.ts           # client do Prisma
│  ├─ jwt.ts              # assina e verifica o token da gestão
│  ├─ middlewares/        # asyncHandler, errorHandler e requireAuth (RBAC)
│  └─ routes/             # public, auth, occurrences e qrcodes
├─ docker-compose.yml     # Postgres local
└─ .env.example           # variáveis de ambiente
```

## Autenticação

Rotas da gestão exigem `Authorization: Bearer <token>`. O token sai do `POST /api/auth/login`
e vale 8h (configurável em `JWT_EXPIRES_IN`). O papel do usuário vai dentro do token e é
conferido pelo `requireAuth` a cada requisição.

Usuários criados pelo seed — **apenas para desenvolvimento**, senha `echo123` nos três:

| E-mail | Papel |
|---|---|
| `coordenador@sinuelo.com` | `COORDENADOR` |
| `gerente@sinuelo.com` | `GERENTE` |
| `admin@sinuelo.com` | `ADMINISTRADOR` |

O seed também cria o QR Code de token `MESA12`, usado para testar o fluxo do cliente.

```bash
# Login → token
curl -X POST http://localhost:3333/api/auth/login   -H "Content-Type: application/json"   -d '{"email":"gerente@sinuelo.com","senha":"echo123"}'

# Listar os feedbacks com o token
curl http://localhost:3333/api/occurrences -H "Authorization: Bearer <token>"
```

> Contrato dos endpoints do MVP: [`../docs/CONTRATO-API.md`](../docs/CONTRATO-API.md).
