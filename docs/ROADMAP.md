# Roadmap — do MVP à entrega

> **Objetivo:** entregar o Echo funcionando ao Restaurante Sinuelo no fim de outubro/2026.
> Não é entrega acadêmica: o software vai ser **usado**. Isso muda o critério de pronto —
> "a tela abre" não basta, o cliente precisa conseguir operar sozinho.

## Onde estamos (01/10/2026)

No ar e funcionando: fluxo do cliente (QR → feedback), login da gestão, painel e detalhe
de ocorrências com tratativa, gerador de QR Code e dashboard do gerente.

10 endpoints, 70 testes, CI verde, deploy em Vercel + Render + Neon.

**Ainda mock:** relatórios históricos · registro de ocorrências · painel admin (usuários e
configurações) · notificações · log de auditoria.

---

## O bloqueio que não é óbvio

**O Sinuelo não conseguiria operar o sistema hoje.** Áreas e usuários existem apenas porque o
`seed` os criou. Não há endpoint para:

- cadastrar uma mesa nova, renomear ou desativar uma existente
- criar a conta de um funcionário novo, ou revogar a de quem saiu
- **trocar qualquer senha** — as três contas usam `echo123`, e não há tela para mudar isso

Enquanto isso não existir, toda mudança de cadastro depende de alguém da equipe rodar script
contra o banco de produção. Por isso a Fase 1 não é "mais uma tela": é o que separa um protótipo
hospedado de um produto entregável.

---

## Fase 1 — Tornar o sistema configurável pelo cliente
*Sem isso, não há entrega.*

**Backend**
- `User` ganha `ativo` (boolean) e `setor` (opcional) — migration
- CRUD de usuários restrito a `ADMINISTRADOR`: listar, criar, editar papel/setor, ativar/desativar
- Troca de senha: pelo próprio usuário e reset pelo administrador
- CRUD de áreas: criar, renomear, desativar (com `trim()` no nome — a constraint `@@unique([venueId, nome])` é por texto exato)
- Desativar em vez de apagar, nos dois casos: feedback e tratativa apontam para esses registros

**Frontend**
- `/admin/usuarios` ligado à API (hoje `mockUsers`)
- Seção de áreas em `/admin/configuracoes`
- Tela de troca de senha

**Fecha:** duas telas mock, a senha `echo123` e a dependência de script para cadastro.

---

## Fase 2 — Operação do dia a dia

- **Paginação em `GET /occurrences`** — hoje devolve tudo; com uso real isso cresce sem limite
- **`/gerente/registro`** ligado à API: tabela com data, categoria, setor, descrição, status e filtros
- **Log de auditoria** — modelo `AuditLog` e instrumentação de login, mudança de status, criação e
  desativação de usuário, geração de QR

> A auditoria deve entrar **junto com** a Fase 1, não depois. Instrumentar enquanto o código é
> escrito custa pouco; voltar em tudo depois custa caro — e os eventos da Fase 1 (quem criou
> usuário, quem trocou senha) são justamente os que mais importam num log.

---

## Fase 3 — O que o Sinuelo pediu na validação

- **Respostas prontas** na tratativa — modelo próprio, CRUD e seleção na tela de detalhe
- **Retorno ao cliente por e-mail** — exige provedor de envio, template e tratamento de falha
- **Notificações** para a gestão, com regra de negócio a definir (ocorrência parada há X horas?
  reclamação com nota 1?)

> Vieram do cliente real durante a validação do protótipo. Entregar o sistema sem eles é entregar
> menos do que foi combinado.

---

## Fase 4 — Relatórios históricos

- `GET /metrics/series` — agregação por mês, com intervalo `de`/`até` explícito (o `/metrics`
  atual devolve o total de uma janela móvel, não a curva)
- `porArea` quebrado por status
- Exportação **CSV** primeiro; **PDF** se houver tempo

---

## Transversal

| Item | Por quê |
|---|---|
| **Typecheck do front no CI** | o `vite build` usa esbuild e só apaga os tipos; erro de tipo passa batido. O front já passa limpo em `strict` — é só adicionar `tsconfig.json` e o script |
| **Testes de front** | zero hoje. Já causou bug real: o clique do card sumiu numa reescrita e ninguém percebeu |
| **Plano pago do Render** | cold start medido em **24s**. Para um QR na mesa de restaurante, é inviável — o cliente desiste |
| **LGPD** | a tela de configurações promete retenção de dados; precisa existir de fato antes de coletar e-mail de cliente real |

---

## Riscos

**Escopo x prazo.** São quatro fases em ~4 semanas. As Fases 1 e 2 são factíveis. A Fase 3 depende
de infraestrutura de e-mail, e a exportação em PDF da Fase 4 é trabalhosa. Se algo ficar de fora,
que seja o PDF — não as Fases 1 e 2, que são o que torna o sistema entregável.

**Distribuição do trabalho.** O repositório não recebe commit de outro integrante desde o início
do MVP. Se a Fase 1 depender de mais de uma pessoa, vale combinar a divisão antes de começar,
não no meio.

**Dados de produção.** O banco tem dados de demonstração (`npm run prisma:seed:demo`). Antes de o
Sinuelo usar para valer, limpar e definir quem são os usuários reais.
