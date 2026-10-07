# Próximos passos — até a apresentação

> Atualizado em 06/10/2026. Complementa o [ROADMAP](ROADMAP.md) com o estado atual e a ordem
> recomendada. A apresentação ao professor é no fim de outubro, e o critério é **projeto inteiro
> funcional: nenhuma tela pode ser mock**.

## Onde estamos

**Todas as 12 telas ligadas à API — nenhuma mock.** 26 endpoints, 231 testes, CI verde, sistema publicado.

fluxo do cliente · dois logins · painel e detalhe de ocorrências · dashboard do gerente · gerador de QR · gestão de usuários · painel administrativo · registro de ocorrências · configurações (áreas) · log de auditoria · notificações · relatórios

## Migrations em produção

Todas aplicadas até o PR #22. Quando uma PR trouxer migration nova, **aplicar antes do merge** —
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
2. **Retenção LGPD** — **adiada para depois do redesenho** (decisão de 06/10). Prazo configurável
   **e** a rotina que apaga ou anonimiza o que passou dele: guardar o prazo sem aplicar não protege
   ninguém. Não é necessária para a apresentação, mas é obrigatória antes da entrega ao Sinuelo. O
   prazo entra como nova coluna da `Configuracao`, com o mesmo padrão de leitura e auditoria

---

## 4. Redesenho: moderno, bonito, fluido e usável (em andamento)

**Por quê:** o sistema funciona, mas não parece um produto. O que motivou: o cartão "Cliente" da tela
inicial levava a um formulário que nunca funciona sem QR. O diagnóstico de 06/10 achou mais:

- dois logins quase iguais, e o administrador sem login próprio (o cartão dele caía no de gerente)
- 14 redirecionamentos para login espalhados pelas telas, cada um com a rota fixa de um papel
- nenhum menu: do registro não se chega aos relatórios, e o "Início" volta para a escolha de papel
- cada papel pinta a tela inteira de uma cor saturada; nenhuma fonte definida (`fonts.css` vazio)
- 46 componentes prontos em `components/ui/` (shadcn) que nenhuma tela usa
- a aba do navegador se chama "Mobile Feedback Platform Design", herança do Figma

**Decisões do Lucas:**

- **Identidade própria do Echo.** Protótipo aprovado:
  https://claude.ai/artifact/RjKcxgHVD6tDxRj5toQuUV — fundo off-white `#F7F7F4`, verde-petróleo
  `#0F6E5A` como cor principal, âmbar `#E8A317` só em estrelas e alertas, fonte Manrope. O papel vira
  um selo, não a cor da tela
- **A tela de escolher papel sai.** A raiz `/` passa a ser o login ("Bem-vindo ao Echo") e cada papel
  cai na própria página. O cliente só entra pelo QR da mesa
- **A demonstração ao professor é ao vivo:** gerar o QR no gerador e apontar a câmera na hora
- **Tem que ser fluido e usável**, não só bonito: resposta imediata a cada clique, nada que pule de
  lugar ao carregar, tudo alcançável pelo teclado e confortável no celular

**Etapas, um PR por item:**

0. ~~**Proteção antes de mexer em tudo**~~ — **feito (07/10):** `tsconfig.json` e `npm run
   typecheck` no front, rodando no CI. O job segue chamado "Front — build" porque a proteção da
   `main` exige o check por esse nome exato
1. ~~**Fundamentos**~~ — **feito (07/10).** A tela de escolher papel, os dois logins por papel e a
   barra antiga (`Navigation`) foram removidos. As telas ainda têm o visual antigo por dentro e
   seguem redirecionando para o login por conta própria no 401 — isso sai na etapa 3, quando cada
   uma for redesenhada
   - identidade: cores, fonte e espaçamentos como tokens no `theme.css`
   - **login único na raiz**; `/gerente/login` e `/coordenador/login` redirecionam para ela; quem já
     está logado e abre a raiz vai direto ao próprio painel
   - **guarda de rota central** (`RotaProtegida` com os papéis permitidos): sem sessão ou sessão
     vencida, volta ao login com "sua sessão expirou"; papel errado vê "acesso restrito". Substitui
     os 14 redirecionamentos e resolve o administrador sem login
   - **layout da gestão** com menu lateral por papel (gaveta no celular): só as telas daquele papel,
     nome e papel embaixo, sino e sair. "Início" leva ao painel de quem está logado
2. **Cliente e demonstração**
   - ~~fluxo do cliente mobile-first~~ — **feito (07/10):** três etapas na mesma tela (notas →
     conte mais → resposta), etapa no endereço para o "voltar" do celular, rascunho que sobrevive a
     recarregar, estrelas acessíveis por teclado e leitor de tela, categorias vindas da API.
     **Retorno ao cliente:** quem pede resposta deixa nome e e-mail, que aparecem só no detalhe
     da ocorrência, com "Responder por e-mail". O nome passou a ser gravado (antes era pedido e
     descartado). Os QR já impressos continuam funcionando
   - ~~gerador de QR pronto para a demonstração~~ — **feito (07/10):** um cartão por área com o
     código atual; **Apresentar** abre o QR em tela cheia (SVG, nítido no projetor) para escanear
     na hora; **Imprimir cartão de mesa** (A6), **Baixar PNG** e **Copiar link**. **Substituir**
     gera um código novo e desativa os anteriores da área na mesma transação; um código perdido
     pode ser **desativado** sozinho e reativado depois, tudo no log de auditoria
3. **Telas da gestão no visual novo**, na ordem do que mais aparece na apresentação: dashboards →
   painel e detalhe de ocorrências → notificações → registro e relatórios → telas do administrador.
   Usando os componentes que já estão no projeto; avisos curtos ("Salvo") no lugar de parágrafos
   soltos, esqueleto no carregamento no lugar do spinner, estados vazios desenhados
4. **Acabamento:** título e ícone da aba, contraste e foco visível, revisão de todas as telas no
   celular

Prazo: ~3 semanas até o fim de outubro. Etapas 0–2 na primeira semana e meia; a 3 é a maior. Se
apertar, a 4 encolhe.

---
## Antes da apresentação

- **Cold start do Render: ~22 segundos.** Abrir o sistema alguns minutos antes, ou assinar o plano
  de US$ 7. Se o professor abrir o link primeiro, é isso que ele vê
- Conferir que os 30 feedbacks de demonstração estão em produção (`npm run prisma:seed:demo`)

## Antes de entregar ao Sinuelo

- Trocar as senhas `echo123` das três contas
- Limpar os dados de demonstração e cadastrar os usuários e áreas reais
- Retenção LGPD de fato: hoje a tela diz que existe e não existe
