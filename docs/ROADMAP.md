# Roadmap — do MVP à entrega

> **Duas metas, em momentos diferentes:**
>
> 1. **Fim de outubro/2026 — apresentação ao professor.** O critério é o projeto inteiro
>    funcional: nenhuma tela pode ser mock.
> 2. **Depois — entrega ao Restaurante Sinuelo.** Aí o software passa a ser **usado**, com
>    cliente real deixando feedback. O critério sobe: não basta funcionar, o restaurante
>    precisa conseguir operar sozinho e os dados de cliente precisam de tratamento sério.
>
> O ambiente publicado hoje (Vercel + Render + Neon) é **vitrine da apresentação**, não produção
> com cliente real. Vale ter isso claro ao priorizar: o que é urgente para a meta 1 nem sempre é
> o mesmo que é urgente para a meta 2.

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
contra o banco. Por isso a Fase 1 não é "mais uma tela": é o que separa um protótipo hospedado de
um produto entregável — e é também o que o professor vai olhar, já que as telas de admin estão
na interface prometendo essas funções.

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
- ~~**Retorno ao cliente por e-mail**~~ — **atendido sem provedor (07/10):** quem pede resposta deixa
  nome e e-mail; a equipe responde pelo próprio e-mail, a partir do detalhe da ocorrência. Envio
  automático pelo sistema (provedor, template, falha) segue fora
- ~~**Notificações** para a gestão~~ — **feito**, dentro do sistema. Regra definida pelo Lucas: todo
  feedback novo notifica, de qualquer tipo. Falta o envio por e-mail/push, que depende de provedor

> Vieram do cliente real durante a validação do protótipo. Entregar o sistema sem eles é entregar
> menos do que foi combinado.

---

## ~~Fase 4 — Relatórios históricos~~ — feito

- `GET /api/metrics/relatorio` — agregação por mês com intervalo `de`/`até` explícito, setor
  quebrado por status e nota média comparada ao período anterior
- Exportação **CSV**; **PDF** pela impressão do navegador, com estilo de impressão próprio

---

## Transversal

| Item | Por quê | Quando |
|---|---|---|
| **Typecheck do front no CI** | o `vite build` usa esbuild e só apaga os tipos; erro de tipo passa batido. O front já passa limpo em `strict` — é só adicionar `tsconfig.json` e o script | a qualquer momento, custa pouco |
| **Testes de front** | zero hoje. Já causou bug real: o clique do card sumiu numa reescrita e ninguém percebeu | antes da meta 1 |
| **Cold start do Render** | medido em **24s** no plano gratuito. Se o professor abrir o link antes da apresentação começar, espera isso olhando tela parada | antes da meta 1 |
| ~~**`POST /api/qrcodes` sem autenticação**~~ | **resolvido** junto com o log de auditoria: sem autor não havia o que registrar | — |
| **Senhas `echo123`** | três contas administrativas com senha trivial | antes da meta 2 |
| **LGPD** | a tela de configurações promete retenção de dados; precisa existir de fato antes de coletar e-mail de cliente real | antes da meta 2 |

---

## Riscos

**Escopo x prazo.** São quatro fases em ~4 semanas. As Fases 1 e 2 são factíveis. A Fase 3 depende
de infraestrutura de e-mail, e a exportação em PDF da Fase 4 é trabalhosa. Se algo ficar de fora,
que seja o PDF — não as Fases 1 e 2, que são o que torna o sistema entregável.

**Distribuição do trabalho.** O repositório não recebe commit de outro integrante desde o início
do MVP. Se a Fase 1 depender de mais de uma pessoa, vale combinar a divisão antes de começar,
não no meio.

**Dados de demonstração.** O banco publicado tem 30 feedbacks fabricados (`npm run prisma:seed:demo`),
feitos para a apresentação. Antes de o Sinuelo usar para valer, limpar tudo e definir os usuários
reais — senão o primeiro relatório do restaurante vem contaminado com dado inventado.
