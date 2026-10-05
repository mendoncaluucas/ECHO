# Próximos passos — até a apresentação

> Atualizado em 05/10/2026. Complementa o [ROADMAP](ROADMAP.md) com o estado atual e a ordem
> recomendada. A apresentação ao professor é no fim de outubro, e o critério é **projeto inteiro
> funcional: nenhuma tela pode ser mock**.

## Onde estamos

**10 telas ligadas à API**, 2 ainda mock. 19 endpoints, 175 testes, CI verde, sistema publicado.

| Ligadas | Mock |
|---|---|
| fluxo do cliente · dois logins · painel e detalhe de ocorrências · dashboard do gerente · gerador de QR · gestão de usuários · painel administrativo · registro de ocorrências · configurações (áreas) · log de auditoria | **relatórios** · **notificações** |

## Migrations em produção

Todas aplicadas até o PR #18. Quando uma PR trouxer migration nova, **aplicar antes do merge** —
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

## 2. Notificações

**Regra definida pelo Lucas:** dispara **a cada feedback novo**, de qualquer tipo — elogio, sugestão
ou reclamação. Sem limiar de nota, sem prazo de ociosidade.

- Modelo `Notification`, criada no mesmo fluxo do `POST /public/feedback`
- `GET /api/notifications` e marcar como lida
- Ligar `/notificacoes` e o sino do cabeçalho, que hoje é decorativo
- **Entrega por e-mail/push fica fora**: exige provedor e infraestrutura. A notificação é dentro do
  sistema. Isso destrava a seção "Preferências de Notificação" das configurações, hoje marcada
  como em desenvolvimento

## 3. Relatórios históricos

**O maior risco do prazo.** É a única tela que precisa de agregação nova.

- `GET /api/metrics/series`: agregação por mês, com intervalo `de`/`ate` explícito (o `/metrics`
  atual devolve o total de uma janela móvel, não a curva)
- `porArea` quebrado por status
- Exportação: **CSV primeiro**. O código de CSV do registro de ocorrências já serve de base —
  ponto e vírgula, BOM, aspas escapadas
- **PDF só se sobrar tempo.** Se algo ficar de fora, que seja ele: é trabalhoso e entrega pouco

---

## Antes da apresentação

- **Cold start do Render: ~22 segundos.** Abrir o sistema alguns minutos antes, ou assinar o plano
  de US$ 7. Se o professor abrir o link primeiro, é isso que ele vê
- Conferir que os 30 feedbacks de demonstração estão em produção (`npm run prisma:seed:demo`)

## Antes de entregar ao Sinuelo

- Trocar as senhas `echo123` das três contas
- Limpar os dados de demonstração e cadastrar os usuários e áreas reais
- Retenção LGPD de fato: hoje a tela diz que existe e não existe
