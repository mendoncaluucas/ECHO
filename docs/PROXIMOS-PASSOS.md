# Próximos passos — até a apresentação

> Atualizado em 06/10/2026. Complementa o [ROADMAP](ROADMAP.md) com o estado atual e a ordem
> recomendada. A apresentação ao professor é no fim de outubro, e o critério é **projeto inteiro
> funcional: nenhuma tela pode ser mock**.

## Onde estamos

**Todas as 12 telas ligadas à API — nenhuma mock.** 26 endpoints, 231 testes, CI verde, sistema publicado.

fluxo do cliente · dois logins · painel e detalhe de ocorrências · dashboard do gerente · gerador de QR · gestão de usuários · painel administrativo · registro de ocorrências · configurações (áreas) · log de auditoria · notificações · relatórios

## Migrations em produção

Todas aplicadas até o PR #21. Quando uma PR trouxer migration nova, **aplicar antes do merge** —
migration que só adiciona coluna com valor padrão não quebra o código antigo, e o contrário derruba
a API até alguém rodar:

```powershell
cd "C:\Users\Lucas\OneDrive - Católica SC\Documentos\PAC-ECHO\ECHO\api"
$cole = Read-Host "Cole a connection string do Neon e tecle Enter"
$env:DATABASE_URL = $cole -replace '&channel_binding=require',''
$env:DIRECT_URL = $env:DATABASE_URL
npm run deploy:migrate
```

O comando **pergunta** a string em vez de esperar que ela seja editada dentro dele: marcador no
meio do comando já foi colado literalmente duas vezes e derrubou a migration com `P1013`.

---

## ~~1. Log de auditoria~~ — feito

Modelo `AuditLog`, 13 ações instrumentadas na mesma transação da escrita, `GET /api/audit` e a tela
`/audit-log`. De quebra: `POST /api/qrcodes` fechado ao administrador e os filtros por data passaram
a usar o fuso de Brasília.

> **Regra para o que vier depois:** toda rota nova em que a gestão **altera** algo registra no log,
> com `registrarAuditoria(tx, ...)` dentro da transação. Nas notificações, mudar a configuração
> entra no log; marcar uma notificação como lida não (é rotina pessoal, não ação sobre o sistema).

## ~~2. Notificações~~ — feito

Todo feedback novo, de qualquer tipo, notifica cada pessoa da gestão ativa — cada uma com o próprio
"lida". Tela `/notificacoes` com dados reais (abrir marca como lida e leva à ocorrência), sino do
cabeçalho com contador que consulta a cada minuto com a aba visível. `seed-demo` gera notificações,
com as dos últimos 3 dias não lidas.

A entrega por **e-mail ou push do navegador** segue fora: depende de provedor. A seção de
preferências das configurações agora diz isso, em vez de dizer que notificação não existe.

**Depois do merge:** rodar o `seed-demo` em produção, senão o sino aparece zerado na apresentação.

## ~~3. Relatórios históricos~~ — feito

`GET /api/metrics/relatorio`: série mês a mês (no fuso do restaurante, com os meses vazios), setor
quebrado por status e nota média por categoria comparada ao período anterior. Tela
`/gerente/relatorios` com período livre, gráfico de nota média ou de quantidade, **CSV** e
**PDF pela impressão do navegador** (a página tem estilo de impressão próprio). O código de CSV virou
módulo comum (`web/src/app/services/csv.ts`), usado também pelo registro de ocorrências.

---

## Depois das telas: o que ainda está "Em desenvolvimento"

Nenhuma tela é mock. Das duas seções das configurações marcadas com o que faltava:

1. ~~**Tempo de sessão**~~ — **feito.** O administrador escolhe de 1h a 24h (padrão 8h), e vale na
   hora para as sessões abertas: o token sai com teto de 24h e o `requireAuth` confere a idade da
   sessão contra a configuração a cada requisição. Fica na tabela `Configuracao` (linha única) e
   entra no log de auditoria. A antiga `JWT_EXPIRES_IN` deixou de ser lida
2. **Retenção LGPD** — prazo configurável **e** a rotina que apaga ou anonimiza o que passou dele.
   Guardar o prazo sem aplicar não protege ninguém. É o mais importante para a entrega ao Sinuelo.
   O prazo entra como nova coluna da `Configuracao`, com o mesmo padrão de leitura e auditoria

Outros ganhos de qualidade, sem tela nova: typecheck do front no CI (já passa limpo em `strict`) e
os primeiros testes de front.

---
## Antes da apresentação

- **Cold start do Render: ~22 segundos.** Abrir o sistema alguns minutos antes, ou assinar o plano
  de US$ 7. Se o professor abrir o link primeiro, é isso que ele vê
- Conferir que os 30 feedbacks de demonstração estão em produção (`npm run prisma:seed:demo`)

## Antes de entregar ao Sinuelo

- Trocar as senhas `echo123` das três contas
- Limpar os dados de demonstração e cadastrar os usuários e áreas reais
- Retenção LGPD de fato: hoje a tela diz que existe e não existe
