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

## Variáveis de ambiente

Todas estão no `.env.example` com valores prontos para desenvolvimento.

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DATABASE_URL` | sim | Conexão que a aplicação usa nas consultas |
| `DIRECT_URL` | sim | Conexão usada **só pelas migrations** (ver abaixo) |
| `JWT_SECRET` | sim | Assina os tokens. A API **não sobe** sem ela |
| `PORT` | não | Porta da API (padrão `3333`) |
| `DB_PORT` | não | Porta do Postgres no host, lida pelo `docker-compose` (padrão `5432`) |
| `JWT_EXPIRES_IN` | não | Validade do token (padrão `8h`) |
| `WEB_BASE_URL` | não | Para onde o QR Code aponta (padrão `http://localhost:5173`) |
| `CORS_ORIGIN` | não | Origens permitidas, separadas por vírgula. Vazio libera todas |

### Por que existem duas URLs de banco

Em desenvolvimento `DATABASE_URL` e `DIRECT_URL` apontam para o **mesmo** Postgres local — é só copiar
uma na outra. A separação existe por causa de produção: provedores como Neon e Supabase colocam um
*pooler* na frente do banco, e o `prisma migrate deploy` usa *advisory locks* do Postgres, que não
sobrevivem à passagem pelo pooler. Então a aplicação conecta pelo pooler (`DATABASE_URL`) e as
migrations conectam direto (`DIRECT_URL`).

> **Já tinha um `.env` antes desta mudança?** Adicione a linha abaixo, com a mesma porta que você
> já usa na `DATABASE_URL`. O Prisma falha se a variável for referenciada e não existir:
>
> ```
> Error code: P1012
> error: Environment variable not found: DIRECT_URL.
> ```
>
> ```
> DIRECT_URL="postgresql://echo:echo@localhost:5432/echo?schema=public"
> ```

## Scripts
| Script | O que faz |
|---|---|
| `npm run dev` | Sobe a API com hot-reload (tsx) |
| `npm run build` / `start` | Gera o Prisma Client, compila para `dist/` e roda em produção |
| `npm test` | Roda a suíte (exige `npm run db:test:up` antes) |
| `npm run typecheck` | Checa os tipos sem gerar arquivos |
| `npm run db:up` / `db:down` | Sobe / derruba o Postgres via Docker |
| `npm run db:test:up` / `db:test:down` | Sobe / derruba o Postgres **de teste** (efêmero, porta 5435) |
| `npm run prisma:migrate` | Cria e aplica migration em desenvolvimento (interativo) |
| `npm run deploy:migrate` | Só **aplica** as migrations já existentes — usado no deploy |
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
│  └─ routes/             # public, auth, occurrences, qrcodes, areas e metrics
├─ tests/                 # suíte Vitest + Supertest (banco de teste isolado)
├─ docker-compose.yml     # Postgres local (dev e teste)
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
> Publicar em produção: [`../docs/DEPLOY.md`](../docs/DEPLOY.md).
