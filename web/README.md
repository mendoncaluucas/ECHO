# Echo — Web

Interface do **Echo**, a plataforma de feedback via QR Code para restaurantes. Todas as telas
conversam com a API (`../api`); nenhuma é mock.

- **Cliente:** entra só pelo QR Code da mesa (`/feedback?t=<token>`), avalia e envia.
- **Equipe:** entra pela raiz (`/`), que é o login único. Cada papel cai no próprio painel e vê no
  menu lateral só as telas que pode abrir.

## Stack

- **React 18** + **Vite 6** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI)
- **React Router** (navegação) e **Recharts** (indicadores)
- Fonte **Manrope**, servida pelo próprio sistema (sem Google Fonts)

## Como rodar

```bash
npm install
npm run dev
```

O Vite sobe o servidor de desenvolvimento e imprime a URL local no terminal. A API precisa estar
rodando; o endereço dela vem de `VITE_API_URL` (padrão `http://localhost:3333/api`).

```bash
npm run typecheck   # checa os tipos; o build do Vite não checa nada
npm run build       # gera o build de produção em dist/
```

O CI roda os dois.

## Estrutura

```
src/
├─ main.tsx
├─ app/
│  ├─ App.tsx                 # rotas: públicas, e as da gestão dentro do layout protegido
│  ├─ navegacao.ts            # menu e permissão de cada tela por papel (uma tabela só)
│  ├─ hooks/                  # contadores do menu (notificações, pendentes)
│  ├─ services/               # chamadas à API, sessão, exportação CSV
│  └─ components/
│     ├─ Entrar.tsx           # login único, na raiz
│     ├─ layout/              # layout da gestão, menu lateral, proteção de rotas
│     ├─ customer/            # jornada do cliente (FeedbackForm, ...)
│     ├─ coordinator/         # painel e detalhe de ocorrências
│     ├─ manager/             # dashboard, relatórios, registro de ocorrências
│     ├─ admin/               # usuários, configurações
│     ├─ shared/              # QR Codes, notificações, log de atividades
│     └─ ui/                  # componentes shadcn/ui
└─ styles/                    # tema (cores e fonte do Echo)
```

## Créditos

Componentes de [shadcn/ui](https://ui.shadcn.com/) (MIT) e imagens do [Unsplash](https://unsplash.com). Ver [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).
