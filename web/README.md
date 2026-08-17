# Echo — Web (protótipo)

Protótipo de alta fidelidade do **Echo**, a plataforma de feedback via QR Code para restaurantes. Interface construída a partir do design no Figma Make.

> **Mock de design:** as telas e a navegação estão completas, mas funcionalidades como autenticação efetiva, comunicação em tempo real e leitura de QR Code ainda não operam de ponta a ponta. A integração com o backend será feita no PAC VI.

## Stack

- **React 18** + **Vite 6** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI)
- **React Router** (navegação) e **Recharts** (indicadores)

## Como rodar

```bash
npm install
npm run dev
```

O Vite sobe o servidor de desenvolvimento e imprime a URL local no terminal.

```bash
npm run build   # gera o build de produção em dist/
```

## Estrutura

```
src/
├─ main.tsx
├─ app/
│  ├─ App.tsx                 # rotas (React Router)
│  └─ components/
│     ├─ customer/            # jornada do cliente (Welcome, FeedbackForm, ...)
│     ├─ coordinator/         # painel de ocorrências
│     ├─ manager/             # dashboard, relatórios, registro de ocorrências
│     ├─ admin/               # gestão de usuários, configurações
│     ├─ shared/              # QR Generator, notificações, log de auditoria
│     └─ ui/                  # componentes shadcn/ui
└─ styles/
```

## Créditos

Componentes de [shadcn/ui](https://ui.shadcn.com/) (MIT) e imagens do [Unsplash](https://unsplash.com). Ver [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md).
