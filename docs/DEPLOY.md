# Deploy — Vercel · Render · Neon

Front na **Vercel**, API no **Render**, Postgres no **Neon**. Todos em plano gratuito.

> **A ordem importa.** O front precisa da URL da API para ser construído, e a API precisa da URL
> do front para gerar os QR Codes. Seguir na sequência abaixo evita rebuild duplicado.

---

## 1. Neon (banco)

Criar o projeto e guardar **as duas** connection strings que o Neon oferece:

| String | Onde é usada |
|---|---|
| **Pooled** (tem `-pooler` no host) | `DATABASE_URL` — as consultas da aplicação |
| **Direct** (sem `-pooler`) | `DIRECT_URL` — só as migrations |

São duas porque o `prisma migrate deploy` usa *advisory locks* do Postgres, que não sobrevivem
à passagem pelo pooler. O `schema.prisma` já está preparado para as duas.

---

## 2. Render (API)

**New → Web Service**, apontando para o repositório.

| Campo | Valor |
|---|---|
| Root Directory | `api` |
| Build Command | `npm ci && npm run build && npm run deploy:migrate` |
| Start Command | `npm start` |

O `build` roda `prisma generate` antes do `tsc`, e o `deploy:migrate` aplica as migrations —
por isso as migrations entram no **build**, não no start: no plano gratuito a instância hiberna, e
colocá-las no start faria rodar a cada despertar.

### Variáveis de ambiente

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string **pooled** do Neon |
| `DIRECT_URL` | string **direct** do Neon |
| `JWT_SECRET` | **gerar um novo**, nunca reaproveitar o de desenvolvimento |
| `WEB_BASE_URL` | a URL da Vercel, sem barra no final |
| `CORS_ORIGIN` | a mesma URL da Vercel |

Gerar o segredo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> `PORT` não precisa ser configurada: o Render injeta a dele e o `server.ts` já lê `process.env.PORT`.

> **`WEB_BASE_URL` é a variável mais perigosa deste deploy.** Se faltar, ela cai no padrão
> `http://localhost:5173` e **todo QR Code gerado em produção aponta para localhost**. QR Code é
> impresso e colado na mesa — um QR errado não se conserta com redeploy, se conserta reimprimindo.

### Primeiro acesso

O banco sobe vazio. Para criar restaurante, áreas, categorias e usuários, rodar o seed uma vez
apontando para o Neon (`npx prisma db seed` com a `DATABASE_URL` de produção no ambiente).

> **Troque as senhas depois.** O seed cria três usuários com a senha `echo123`, o que serve para
> desenvolvimento mas não para um sistema acessível publicamente que coleta e-mail de cliente.

---

## 3. Vercel (front)

**New Project**, importando o repositório.

| Campo | Valor |
|---|---|
| Root Directory | **`web`** |
| Framework Preset | Vite (detectado após ajustar o Root Directory) |
| Build / Output / Install | deixar no padrão |

### Variável de ambiente

| Variável | Valor |
|---|---|
| `VITE_API_URL` | `https://<sua-api>.onrender.com/api` — com `/api` no final |

> O Vite **assa** as variáveis `VITE_*` durante o build. Salvar a variável não reconstrói o site:
> é preciso **disparar um redeploy** depois de adicioná-la. Sem isso o bundle continua apontando
> para `localhost:3333` e o login parece quebrado sem motivo aparente.

### Deployment Protection

Projeto novo na Vercel vem com **Vercel Authentication** ligada, o que redireciona todo visitante
para a tela de login da Vercel. Precisa ser **desligada em Production** (Settings → Deployment
Protection), senão o cliente escaneia o QR da mesa e cai num login que não é dele.

Os *previews* podem continuar protegidos sem prejuízo.

---

## Conferir depois de subir

1. `GET https://<api>.onrender.com/api/health` responde `{"status":"ok"}`
2. A home da Vercel abre
3. `/feedback?t=MESA12` abre o formulário **e carrega as categorias** (isso prova que o front alcança a API)
4. Login da gestão funciona
5. Gerar um QR em `/qr-generator` e conferir que a URL exibida aponta para o domínio da Vercel — **não** para localhost
6. Endereço inexistente mostra "Página não encontrada", não tela em branco

---

## Limitação conhecida: hibernação

O plano gratuito do Render hiberna a instância após um período sem acesso, e o primeiro
acesso seguinte leva dezenas de segundos. Para este produto isso pesa mais que o normal: o cliente
está sentado à mesa com o celular na mão. Dá para mitigar mantendo a instância acordada com um
ping periódico, ao custo de consumir a cota mensal gratuita — decisão a tomar antes de usar em
atendimento real.
