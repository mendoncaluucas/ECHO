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
npm test            # testes (Vitest + Testing Library), sem API nem banco
npm run build       # gera o build de produção em dist/
```

O CI roda os três.

## Testes

Rodam num navegador simulado (jsdom), com a API falsa de `src/test/apiFalsa.ts`: cada teste diz o
que a API responde e confere o que a tela mandou. Nenhum teste fala com a rede: um pedido feito
sem a API falsa ligada faz o teste falhar dizendo qual foi, e uma rota que o teste não previu
responde 404 "Rota não simulada". Quem testa a API de verdade é a suíte do backend.

| Arquivo | O que garante |
|---|---|
| `services/sessao.test.ts` | "Manter conectado": cookie que some ao fechar o navegador ou localStorage, uma sessão só, cookies bloqueados acusados no login |
| `services/api.test.ts` | sem conexão vira mensagem legível; só 401 de sessão desloga (senha errada não) |
| `customer/FeedbackForm.test.tsx` | as três etapas do cliente, o que vai no envio, e-mail inválido, rascunho, QR inválido, falhas |
| `coordinator/OccurrencesPanel.test.tsx` | filtros no endereço: valem ao abrir, vão para a API, não empilham histórico |
| `App.test.tsx` | menu e rotas concordam para cada papel; login e volta para a tela onde a sessão caiu |
| `telasDaGestao.test.ts` | recarga depois de deploy: uma vez, sem ciclo, nunca sem internet |
| `shared/ErrorBoundary.test.tsx`, `rotulos.test.ts` | tela de erro certa para cada caso; "há quanto tempo" pelo calendário |

Teste novo: `*.test.ts(x)` ao lado do arquivo testado. Chame `apiFalsa()` **antes** de abrir a
tela e `entrarComo(papel)` para ter sessão. `npm run test:watch` roda de novo a cada mudança.

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
