# Próximos passos — até a apresentação

> Atualizado em 15/10/2026. Complementa o [ROADMAP](ROADMAP.md) com o estado atual e a ordem
> recomendada. A apresentação ao professor é no fim de outubro, e o critério é **projeto inteiro
> funcional: nenhuma tela pode ser mock**.

## Onde estamos

**Todas as 12 telas ligadas à API — nenhuma mock.** 273 testes na API e 116 no front, CI verde, sistema publicado.

fluxo do cliente · dois logins · painel e detalhe de ocorrências · dashboard do gerente · gerador de QR · gestão de usuários · painel administrativo · registro de ocorrências · configurações (áreas) · log de auditoria · notificações · relatórios

## Migrations em produção

Todas aplicadas até o PR #33; a da retenção (`20261021213601_retencao_lgpd`) vai no PR seguinte.
Quando uma PR trouxer migration nova, **aplicar antes do merge** —
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

**Por e-mail (25/10), ver a seção 7.** Push do navegador segue fora.

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
   entra no log de auditoria. A antiga `JWT_EXPIRES_IN` deixou de ser lida.
   **Manter conectado (07/10):** caixa no login, desmarcada por padrão. Desmarcada, a sessão fica
   num cookie de sessão e fechar o navegador encerra o login (o computador do restaurante é
   compartilhado); marcada, fica no `localStorage` até vencer o tempo acima. Cookie e não
   `sessionStorage` porque este é de uma aba só. As telas leem o token por `tokenDaSessao()`
2. **Retenção LGPD** — **planejada (09/10), ver a seção 6.** Prazo configurável **e** a rotina que
   anonimiza o que passou dele: guardar o prazo sem aplicar não protege ninguém. Não é necessária
   para a apresentação, mas é obrigatória antes da entrega ao Sinuelo

---

## ~~4. Redesenho: moderno, bonito, fluido e usável~~ — feito

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
   - ~~painéis~~ — **feito (09/10):** peças comuns em `components/layout/Pagina.tsx` (cabeçalho,
     cartão, indicador, seletor de período, barra, esqueleto, estado vazio, aviso de erro); nome
     e cor de tipo e status em `rotulos.ts`; cores com significado como tokens no `theme.css`.
     **Painel do gerente** no desenho do protótipo: saudação, período no endereço (`?dias=7`,
     sobrevive ao voltar de uma ocorrência), quatro números, nota por categoria com alerta abaixo
     de 3, "Chegaram agora", por tipo e por área. **Visão geral do administrador:** números que
     levam à tela do assunto, "Precisa de atenção" (área sem QR valendo, área com vários, nenhum
     coordenador) e atividade recente do log, sem os logins
   - ~~ocorrências~~ — **feito (09/10):** a lista virou **fila de trabalho**: abre nas pendentes,
     abas por situação com a contagem de cada uma, filtros de tipo e categoria no endereço
     (`?status=todas&tipo=RECLAMACAO&categoria=Higiene`, sobrevivem ao voltar do detalhe), filtro
     e paginação no servidor (antes filtrava no navegador o que já tinha carregado), selo "Pediu
     resposta" e cada item como link de verdade. Categorias vêm do novo `GET /api/categorias`.
     **Detalhe:** comentário, notas em estrelas, contato e a tratativa em três opções com
     descrição; salvar volta para a tela de origem com um **aviso rápido** ("Ocorrência marcada
     como resolvida", `avisoRapido.ts`, mostrado pelo layout). No celular a tratativa vem antes
     do contato. O item de lista (`ItemDaOcorrencia`) é o mesmo do "Chegaram agora" do painel
   - ~~notificações e registro~~ — **feito (09/10):** **Notificações** com abas Todas/Não lidas
     no endereço, selo "Nova" (no lugar de uma segunda bolinha ao lado da cor do tipo), cada uma
     um link que marca como lida ao abrir, e aviso rápido ao marcar todas. **Registro** com busca,
     tipo, situação, categoria (do banco) e período de/até, tudo no endereço junto com a página;
     tabela de cinco colunas em tela média e larga (tipo e área juntos, notas embaixo do
     comentário), a lista da fila no celular, e o CSV leva o resultado inteiro do filtro
   - ~~relatórios~~ — **feito (09/10):** atalhos de 3, 6 e 12 meses (mesma regra do padrão da
     API) além do período livre, período no endereço (`?de=&ate=`), quatro números, gráfico mês a
     mês com as cores do sistema (nota por categoria ou quantidade por tipo), nota por categoria
     com a variação contra o período anterior e "por área" em barras de resolução. Impressão/PDF e
     CSV mantidos. O cartão comum agora desce a ação do canto para baixo do título quando falta
     espaço (no celular espremia o título)
   - ~~telas do administrador~~ — **feito (09/10):** **Usuários** em lista (iniciais, papel, setor),
     abas Ativos/Inativos/Todos, formulários num diálogo de verdade (foco preso, Esc, foco volta
     ao botão que abriu), o que cada papel pode dito no formulário, e confirmação antes de
     desativar com o foco no "Cancelar". **Configurações** com áreas (ordem natural: "Mesa 2"
     antes de "Mesa 10"), tempo de sessão e o que ainda não existe dito com honestidade. **Log**
     com filtros e página no endereço, tabela em tela média e larga e lista no celular. **QR
     Codes** na mesma moldura das outras telas. Na API, área com o mesmo nome em outra grafia
     ("mesa 12" ao lado de "Mesa 12") passou a ser recusada
   - **Etapa 3 concluída.** **Cuidado com `sr-only` dentro de caixa com rolagem:** sem um
     ancestral `relative`, o texto escondido escapa da caixa e estica a página (aconteceu na
     tabela do Registro)
4. **Acabamento:** título e ícone da aba, contraste e foco visível, revisão de todas as telas no
   celular
   - ~~carregamento rápido do cliente~~ — **feito (09/10):** o site era um arquivo só de 810 KB
     (234 KB comprimidos), e quem escaneava o QR baixava o painel, os gráficos e o log junto. As
     telas da gestão e o menu agora vêm sob demanda (`web/src/app/telasDaGestao.ts`): o cliente
     baixa **um arquivo de 76 KB comprimidos**, e os gráficos (112 KB) só com os Relatórios. A
     equipe não espera: a tela de login baixa em segundo plano o menu e as telas iniciais, e o
     menu, depois de entrar, só o que o papel pode abrir (o coordenador não baixa gráficos nem
     telas do administrador). Depois de um deploy (a Vercel devolve o `index.html` no lugar do
     arquivo sumido), tela que pede um arquivo da versão antiga recarrega a página **uma vez**
     (janela de 10 s contra ciclo); sem internet não recarrega; nos dois casos, a tela de erro
     diz para conferir a conexão. **Tela nova da gestão:** registrar em `telasDaGestao.ts`
   - ~~ícone, contraste, foco e celular~~ — **feito (10/10):** ícone da marca na aba
     (`favicon.svg` e um PNG para o Safari antigo), na tela inicial do iPhone e do Android
     (`manifest.webmanifest`, com `display: browser` de propósito: como app instalável, o Chrome
     ofereceria "Instalar" ao cliente no meio do formulário, e o app abriria no login da equipe).
     Tela de erro e "página não encontrada" no visual novo; dentro do menu, o erro ocupa só o
     conteúdo. **Foco de teclado** visível em tudo (regra única no `theme.css`; o do navegador saía
     com meia cor e menos de 1 px). **Contraste** conferido com o axe-core em todas as telas, nos
     três passos do cliente e no login (zero problemas), e à mão o que ele não mede: estrelas
     vazias (1,5:1 → 3,5:1), estrela cheia com contorno escuro, contorno dos campos (1,25:1 →
     3,5:1, cor `--borda-campo`; a borda dos cartões continua clara) e texto de exemplo nos campos
     (3,2:1 → 4,7:1). Login com região principal e título principal também no celular. **375 px:**
     nenhuma tela transborda; filtros do log um por linha, "Todas" na categoria das ocorrências e
     busca do registro mais curta, que saíam cortados. As abas de situação das ocorrências, que
     rolam de lado no celular, levam para a vista a aba escolhida e a que recebe o foco (antes,
     aberta com `?status=todas`, a aba marcada ficava fora da tela). "Obrigado", "QR Code não
     identificado" e o carregando do cliente ganharam a região principal da página. O nome no
     menu passa a mudar quando o administrador edita a própria conta
   - **Etapa 4 concluída.** Fica para decidir: aceitar as prévias da Vercel no CORS da API (a
     `CORS_ORIGIN` do Render)

## ~~5. Testes do front~~ — feito (16/10)

O front não tinha teste nenhum: só o typecheck e o build seguravam o CI. Agora **116 testes**
(Vitest 4 + Testing Library, navegador simulado, API falsa), no mesmo job do CI. Cobrem o que
quebraria em silêncio: a sessão com e sem "Manter conectado", as três etapas do cliente e o que
vai no envio, os filtros no endereço, o login voltando para a tela onde a sessão caiu, a recarga
depois de deploy e se o menu e as rotas concordam para cada papel. Cada regra importante foi
**sabotada de propósito** (20 sabotagens, 19 acusadas; a outra é o `trim` do e-mail, que o
navegador já faz no campo de e-mail) para confirmar que algum teste acusa. Como escrever
um teste novo: `web/README.md`.

Prazo: ~3 semanas até o fim de outubro. Etapas 0–2 na primeira semana e meia; a 3 é a maior. Se
apertar, a 4 encolhe.

---

## ~~6. Retenção de dados (LGPD)~~ — feito (25/10); falta só validar com o Sinuelo

**O que identifica alguém no Echo:** do cliente, o **nome e o e-mail** de quem pede resposta
(`contatoNome`, `contatoEmail`) e o **comentário**, que é texto livre e pode trazer nome, telefone,
placa. Tipo, notas, área, data e situação não identificam ninguém. Da equipe: nome, e-mail, senha
(hash) e o log de atividades. O log **não** guarda dado de cliente (conferido: os `detalhes` têm área,
status e nomes da equipe).

**Princípio: anonimizar, não apagar o feedback.** Apagar a linha tiraria os números dos painéis e
relatórios. A rotina apaga o que identifica e mantém o que conta; estatística anônima deixa de ser
dado pessoal.

**Regras (decididas pelo Lucas em 09/10; padrões que o administrador pode ajustar):**

| O quê | Some depois de | Contado de |
|---|---|---|
| Nome e e-mail do cliente | **90 dias** | data do feedback |
| Comentário | **12 meses** | data do feedback |
| Notificações | 90 dias | data da notificação |
| Log de atividades | fica (não tem dado de cliente; serve para prestar contas) | — |
| Usuários desativados | ficam (o log aponta para eles) | — |

**Como roda:** o Render gratuito não tem agendador (o cron é pago) e dorme depois de 15 min parado.
A API aplica a retenção **ao ligar e no máximo uma vez por dia** enquanto está acordada, guardando
a última execução na `Configuracao`. Acorda a cada uso (painel ou QR), então roda todo dia com
movimento; o que vencer num dia parado sai no dia seguinte. Idempotente; registra no log só as
contagens (`RETENCAO_APLICADA`), nunca o conteúdo. Nas Configurações: prévia ("12 contatos e 3
comentários vencidos") e "Aplicar agora".

**Pedido do titular (art. 18):** o administrador informa o e-mail e o Echo anonimiza na hora todos os
feedbacks daquele e-mail (sem diferenciar maiúsculas). Log `DADOS_DO_TITULAR_APAGADOS` com a
quantidade, sem guardar o e-mail.

**Transparência:** abaixo do campo de e-mail do formulário, "Guardamos seu nome e e-mail por até 90
dias, só para responder" (prazo vindo da API). Página `/privacidade` curta, com link no formulário e
no login: que dados, para quê, por quanto tempo, como pedir para apagar (o Sinuelo informa o e-mail
de contato). No detalhe da ocorrência, "Contato apagado em … pela política de privacidade" em vez de
um espaço vazio.

**Por dentro:**
- migration: na `Configuracao`, `retencaoContatoDias` (90), `retencaoComentarioDias` (365),
  `retencaoNotificacaoDias` (90) e `ultimaRetencaoEm`; no `Feedback`, `contatoApagadoEm` e
  `comentarioApagadoEm`; ações `RETENCAO_APLICADA` e `DADOS_DO_TITULAR_APAGADOS`
- API: prazos no `GET/PATCH /api/configuracoes` com limites; prévia e aplicar
  (`/api/retencao`, administrador); apagar dados do titular por e-mail; prazos públicos para o
  formulário e a página de privacidade
- testes: fronteira dos prazos (89/90/91 dias), não toca no recente, idempotência, **números dos
  painéis iguais antes e depois de anonimizar**, pedido do titular só atinge aquele e-mail, log sem
  conteúdo

**Ordem, 3 PRs (~1,5 dia):**
1. ~~API + migration + rotina + testes, com os prazos padrão. Sozinho já protege~~ — **feito
   (21/10).** Tudo da API desta seção: rotina (`api/src/retencao.ts`), rodada ao ligar e de hora em
   hora (`server.ts`, no máximo uma por dia, à prova de duas ao mesmo tempo), prévia, aplicar,
   pedido do titular, prazos nas configurações (`PATCH` aceita só os campos enviados) e públicos
   (`GET /api/public/privacidade`). 42 testes, inclusive os números dos painéis iguais antes e
   depois. **Decidido no caminho (21/10):** a rodada automática aparece no log como **"Sistema
   (automático)"** (o `AuditLog.usuarioId` passou a aceitar vazio, com a chave estrangeira ainda
   `RESTRICT`) e só registra quando algo saiu; quem aplica pela tela registra sempre. No front: o log
   mostra o sistema e as ações novas (com filtro "Sistema"); as Configurações deixaram de dizer que a
   retenção não existe; e o que saiu diz que saiu ("Comentário apagado em…", "o contato foi apagado
   em…" no detalhe, e sem o selo "Pediu resposta" quando não há mais a quem responder), em vez de
   "Sem comentário" e "Avaliação anônima", que seriam falsos; o CSV do registro também diz
   "(Comentário apagado em…)" em vez da célula vazia. **Achado na varredura, de antes da
   retenção:** injeção de fórmula no CSV. O comentário vem do cliente, sem login, e
   `=HYPERLINK(...)` virava link clicável no Excel do gerente; agora texto que começa com
   `= + - @` ganha um apóstrofo (OWASP), e número negativo continua número. **Achado na verificação:** o
   `mode: "insensitive"` do Prisma vira `ILIKE` sem escapar curingas, e o pedido do titular para
   `%@%` apagava o contato de todo mundo; agora a comparação é exata (SQL parametrizado), com teste.
   **Deploy:** as colunas novas são lidas em toda requisição autenticada (o `requireAuth` lê a
   configuração), então o código novo não pode rodar sem a migration. O build do Render já aplica a
   migration antes de ligar o código novo, e se ela falhar a versão anterior continua no ar;
   aplicar antes do merge, como de costume, só tira essa dependência (o código antigo convive com
   as colunas novas). Também por isso a **CI na branch** (sobe um banco e roda a migration) é a
   prova de que ela aplica. **Em produção, a primeira rodada** apaga só
   notificações com mais de 90 dias: a demonstração não tem contato de cliente e os comentários têm
   menos de um ano. **No ar em 23/10 (#35):** a primeira rodada foi às 16:08 e não havia nada vencido
   (nem notificação), por isso não deixou registro no log
2. ~~Configurações (prazos, prévia, aplicar, apagar dados de um cliente)~~ — **feito (23/10).** Seção
   "Retenção de dados (LGPD)" nas Configurações (`web/src/app/components/admin/RetencaoDeDados.tsx`):
   os três prazos em seletores (dentro das faixas da API; um valor salvo fora da lista aparece), com
   aviso ao encurtar e salvando só o que mudou; quando rodou pela última vez e o que já passou do
   prazo, com "Apagar agora"; e o pedido de um cliente pelo e-mail. As duas ações apagam sem volta,
   então pedem confirmação com o foco no "Cancelar" (um Enter distraído não apaga nada). O "aviso no
   detalhe" já tinha entrado no PR 1
3. ~~Transparência: texto no formulário e página `/privacidade`~~ — **feito (25/10).** No formulário,
   abaixo do e-mail: "Ficam guardados por 90 dias e depois são apagados", com o prazo configurado
   (vem junto com os dados da mesa, sem um segundo pedido no celular do cliente). Página
   `/privacidade` (`web/src/app/components/customer/Privacidade.tsx`), com link no rodapé do
   formulário e no login: o que guardamos, para quê, por quanto tempo (prazos da API; sem ela, "um
   prazo limitado") e como pedir para apagar (com um atendente ou a gerência, que usam a tela das
   Configurações). O "Voltar" anda no histórico: um link empilharia outra cópia da avaliação, e a
   seta de voltar dela caía de novo na página (achado no teste). **O texto é provisório** até o
   Sinuelo validar e passar um e-mail de contato

**Curingas (#36, 23/10):** o mesmo `ILIKE` sem escape do pedido do titular existia na busca, no
filtro de categoria e no nome repetido de área (`%` trazia tudo, "Mesa_1" era recusada por existir
"Mesa 1"). `semCuringas` (`api/src/consulta.ts`) escapa `\`, `%` e `_`; toda consulta nova com
`mode: "insensitive"` deve passar por ela.

**Antes da entrega:** prazos e texto de privacidade validados pelo Sinuelo (de preferência com quem
cuida da parte jurídica deles). A parte técnica não substitui essa validação.

---

## 7. E-mail pelo Resend (entrega acadêmica)

Decidido pelo Lucas em 25/10: **Resend agora**, para a entrega acadêmica; na entrega ao Sinuelo, o
serviço de e-mail deles. Sem domínio próprio, então o Resend só entrega ao dono da conta, e tudo
vai para o `EMAIL_DESTINO_TESTE` (ver `docs/DEPLOY.md`). Dois PRs:

1. ~~**Aviso à equipe por feedback novo**~~ — **feito (25/10).** Envio em `api/src/email.ts`,
   atrás da interface `ProvedorDeEmail` (Resend por HTTPS, em lote; trocar de provedor é trocar
   essa peça). Sem `RESEND_API_KEY`, desligado. Cada pessoa escolhe na tela de **Notificações**:
   nenhum, **só reclamações (padrão)** ou todos; a escolha entra no log. O e-mail leva tipo, área,
   hora de Brasília, notas e o link "Abrir no Echo", **sem o comentário nem o contato do cliente**
   (numa caixa de e-mail a retenção não alcança). O `POST /public/feedback` não espera o e-mail, e
   falha no envio não desfaz nada. O cartão "Ainda não disponível" das Configurações virou um
   aviso de onde fica a escolha. Migration `avisos_por_email` (coluna com padrão: o código antigo
   convive com ela)
2. **Resposta ao cliente pelo Echo** — a equipe escreve no detalhe da ocorrência e o Echo envia.
   Este manda dado do cliente ao provedor, então a página de privacidade precisa dizer isso

---
## Antes da apresentação

- **Cold start do Render: ~22 segundos.** Abrir o sistema alguns minutos antes, ou assinar o plano
  de US$ 7. Se o professor abrir o link primeiro, é isso que ele vê
- Conferir que os 30 feedbacks de demonstração estão em produção (`npm run prisma:seed:demo`)

## Antes de entregar ao Sinuelo

- Trocar as senhas `echo123` das três contas
- Limpar os dados de demonstração e cadastrar os usuários e áreas reais
- E-mail: trocar o Resend pelo serviço do Sinuelo e tirar o `EMAIL_DESTINO_TESTE` (seção 7). Se o
  serviço deles for SMTP, o Render precisa do plano pago (o gratuito bloqueia SMTP)
- ~~Retenção LGPD de fato (seção 6)~~ — feita: rotina, tela e página de privacidade
- Validar com o Sinuelo os prazos de retenção e o texto da página de privacidade
  (`web/src/app/components/customer/Privacidade.tsx`), de preferência com quem cuida da parte
  jurídica deles, e pegar um e-mail de contato para pedidos de apagar dados (hoje a página manda
  falar com um atendente ou a gerência)
