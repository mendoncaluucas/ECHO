# Contrato da API — MVP 1 (v1 · rascunho para revisão)

> Escopo: apenas os endpoints da entrega de **27/08** (cliente envia feedback → grava no banco → gestão vê).
> Esta é uma **primeira versão para a equipe revisar e ajustar** no Bloco 1 (18–20/08), não uma decisão final.

## Convenções

- **Base URL:** `/api` (ex.: `http://localhost:3333/api`)
- **Formato:** JSON em requisição e resposta (`Content-Type: application/json`)
- **Autenticação:** rotas protegidas exigem o header `Authorization: Bearer <token>` (JWT).
  O token é obtido em `POST /auth/login`. A sessão vale pelo **tempo configurado pelo
  administrador** (padrão 8h, de 1h a 24h — ver `PATCH /api/configuracoes`), conferido a cada
  requisição; o token em si sai sempre com o teto de 24h.
- **Datas:** ISO 8601 (ex.: `2026-08-27T14:30:00.000Z`)
- **Erro padrão:**
  ```json
  { "erro": "mensagem legível", "codigo": "VALIDACAO" }
  ```
- **Status usados:** `200` ok · `201` criado · `400` validação · `401` não autenticado · `403` sem permissão · `404` não encontrado
- **Códigos de erro (`codigo`):**

  | `codigo` | Status | Quando acontece |
  |---|---|---|
  | `VALIDACAO` | 400 | Campo obrigatório ausente ou valor inválido |
  | `CREDENCIAIS_INVALIDAS` | 401 | E-mail ou senha incorretos no login |
  | `NAO_AUTENTICADO` | 401 | Header `Authorization` ausente ou fora do formato `Bearer <token>` |
  | `TOKEN_INVALIDO` | 401 | Token adulterado, assinado com outro segredo ou expirado; sessão mais velha que o tempo configurado; usuário desativado |
  | `SEM_PERMISSAO` | 403 | Autenticado, mas o papel não está na lista da rota |
  | `QR_NAO_ENCONTRADO` | 404 | `qrToken` inexistente ou inativo |
  | `AREA_NAO_ENCONTRADA` | 404 | `areaId` inexistente |
  | `OCORRENCIA_NAO_ENCONTRADA` | 404 | Ocorrência inexistente |
  | `USUARIO_NAO_ENCONTRADO` | 404 | Usuário inexistente |
  | `TOKEN_DUPLICADO` / `CONFLITO` | 409 | Token de QR Code já em uso |
  | `ROTA_NAO_ENCONTRADA` | 404 | Rota inexistente |
  | `ERRO_INTERNO` | 500 | Erro inesperado |

---

## 1. `GET /public/venue/:qrToken` — resolver QR Code
**Público.** O celular do cliente abre esta rota a partir do QR; devolve o contexto para montar o formulário.

**Resposta `200`:**
```json
{
  "venue":     { "id": "uuid", "nome": "Restaurante Sinuelo" },
  "area":      { "id": "uuid", "nome": "Mesa 12" },
  "categorias": [
    { "id": "uuid", "nome": "Higiene" },
    { "id": "uuid", "nome": "Atendimento" },
    { "id": "uuid", "nome": "Alimento" }
  ],
  "privacidade": { "contatoDias": 90, "comentarioDias": 365 }
}
```
`privacidade` são os prazos de retenção (seção 23), os mesmos do `GET /public/privacidade`: vêm
aqui para o formulário dizer por quanto tempo o contato fica sem um segundo pedido no celular do
cliente.

**Erros:** `404` se o token não existir ou estiver inativo.

---

## 1.1. `GET /public/privacidade` — prazos de retenção
**Público.** Por quanto tempo o Echo guarda o que identifica o cliente, para a página de
privacidade (aberta sem QR Code) dizer o prazo que vale, e não um texto fixo que ficaria errado ao
mudar o prazo.

**Resposta `200`:** `{ "contatoDias": 90, "comentarioDias": 365 }`. Ver a seção 23.

---

## 2. `POST /public/feedback` — enviar feedback
**Público.** Grava o feedback do cliente.

**Requisição:**
```json
{
  "qrToken": "abc123",
  "tipo": "RECLAMACAO",
  "comentario": "Demora no atendimento.",
  "anonimo": false,
  "contatoNome": "Ana Souza",
  "contatoEmail": "ana@exemplo.com",
  "avaliacoes": [
    { "categoriaId": "uuid", "estrelas": 2 },
    { "categoriaId": "uuid", "estrelas": 4 }
  ]
}
```
- `tipo`: `ELOGIO` | `SUGESTAO` | `RECLAMACAO`
- `anonimo: false` é o cliente pedindo **resposta da equipe**: `contatoEmail` e, se quiser,
  `contatoNome` (até 100 caracteres). Os dois são gravados sem espaços sobrando
- `contatoEmail` aceita só os caracteres de um endereço comum (letras, números e `. _ + -`) e no
  máximo 254 caracteres. Ele vira link `mailto:` na tela da equipe, e com `?`, `&` ou `%` o
  cliente conseguiria pôr cópia ou trocar o assunto da resposta que a equipe envia
- `estrelas`: inteiro de 1 a 5

> **Sem e-mail não há resposta possível**, então `anonimo: false` sem `contatoEmail` é gravado como
> anônimo. De anônimo nada de contato é guardado, nem o que vier no corpo por engano.

**Resposta `201`:**
```json
{ "id": "uuid", "criadoEm": "2026-08-27T14:30:00.000Z" }
```
**Erros:** `400` (dados inválidos) · `404` (qrToken inexistente).

> **Todo feedback aceito notifica a gestão**, de qualquer tipo, para cada usuário ativo. A
> notificação nasce no mesmo comando que grava o feedback. Ver `GET /api/notifications` (seção 17).
>
> **E-mail, para quem escolheu** (seção 20.1): depois de gravar, a API manda o aviso por e-mail
> **sem esperar** o provedor responder. O `201` não depende do e-mail, e uma falha no envio não
> desfaz o feedback nem a notificação: fica no log do servidor, sem destinatário nem conteúdo.

---

## 3. `POST /auth/login` — login da gestão
**Público.** Autentica Coordenador/Gerente/Administrador e devolve o JWT.

**Requisição:**
```json
{ "email": "gerente@sinuelo.com", "senha": "••••••" }
```
**Resposta `200`:**
```json
{
  "token": "jwt...",
  "usuario": { "id": "uuid", "nome": "Valmir Inácio", "papel": "GERENTE" }
}
```
**Erros:** `400` `VALIDACAO` (`email` ou `senha` ausentes) · `401` `CREDENCIAIS_INVALIDAS`.

> A resposta de `401` é **idêntica** para e-mail inexistente e senha errada — de propósito, para não
> revelar quais e-mails têm cadastro. O `senhaHash` nunca sai na resposta.

---

## 4. `GET /occurrences` — feedbacks para a gestão (paginado)
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Lista, somente leitura, os feedbacks recebidos.

> "Ocorrência" = um feedback registrado. O `status` (`PENDENTE` | `EM_ANDAMENTO` | `RESOLVIDO`) nasce
> como `PENDENTE` e é alterado pelo `PATCH /occurrences/:id`. `tratadoPor` e `tratadoEm` ficam `null`
> enquanto ninguém tiver mexido.

**Header:** `Authorization: Bearer <token>`

**Parâmetros de consulta** — todos opcionais:

| Parâmetro | Valores | Observação |
|---|---|---|
| `pagina` | inteiro ≥ 1 | padrão `1` |
| `porPagina` | inteiro de 1 a **100** | padrão `20` |
| `status` | `PENDENTE` · `EM_ANDAMENTO` · `RESOLVIDO` | |
| `tipo` | `ELOGIO` · `SUGESTAO` · `RECLAMACAO` | |
| `categoria` | nome da categoria | traz quem **pontuou** aquela categoria (nome exato, ignorando maiúsculas) |
| `busca` | texto livre | procura no comentário e no nome da área, ignorando maiúsculas. `%`, `_` e a barra invertida são texto, não curingas: buscar `10%` acha "10%", não tudo |
| `de` / `ate` | `YYYY-MM-DD` | `ate` inclui o dia inteiro, não para à meia-noite. Data que não existe no calendário (31/02) responde `400` |

**Resposta `200`:**
```json
{
  "itens": [
    {
      "id": "uuid",
      "tipo": "RECLAMACAO",
      "comentario": "Demora no atendimento.",
      "anonimo": true,
      "criadoEm": "2026-08-27T14:30:00.000Z",
      "status": "PENDENTE",
      "tratadoPor": null,
      "tratadoEm": null,
      "area": { "nome": "Mesa 12" },
      "avaliacoes": [
        { "categoria": "Atendimento", "estrelas": 2 },
        { "categoria": "Alimento", "estrelas": 4 }
      ],
      "respondida": false
    }
  ],
  "total": 30,
  "pagina": 1,
  "porPagina": 20,
  "paginas": 2
}
```

> **O `total` é do filtro aplicado, não da página.** Quem precisa do conjunto inteiro — exportação,
> por exemplo — deve percorrer as páginas até `paginas`, e não aumentar o `porPagina`: ele tem teto
> de 100 justamente para uma requisição não conseguir pedir a base toda.

> Página além do fim devolve `itens: []` com `200`, não erro.

**Erros:** `400` `VALIDACAO` (paginação, status, tipo ou data inválidos) · `401` `NAO_AUTENTICADO` ·
`401` `TOKEN_INVALIDO` · `403` `SEM_PERMISSAO`.

> Ordenado do mais recente para o mais antigo. `area` vem `null` quando o feedback veio de um QR genérico.
> O `contatoEmail` **não** é devolvido nesta rota (dado pessoal — LGPD). `respondida` diz se a equipe
> já respondeu pelo Echo (seção 6.1), sem trazer o texto.

---

## 5. `GET /occurrences/:id` — detalhe da ocorrência
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). O formato de um item da listagem, mais
o `contato`.

**Resposta `200`:**
```json
{
  "id": "uuid",
  "tipo": "RECLAMACAO",
  "comentario": "Demora no atendimento.",
  "anonimo": false,
  "criadoEm": "2026-08-27T14:30:00.000Z",
  "status": "EM_ANDAMENTO",
  "tratadoPor": { "nome": "Coordenadora Sinuelo" },
  "tratadoEm": "2026-09-21T18:00:00.000Z",
  "area": { "nome": "Mesa 12" },
  "avaliacoes": [{ "categoria": "Atendimento", "estrelas": 2 }],
  "contatoApagadoEm": null,
  "comentarioApagadoEm": null,
  "respondida": true,
  "contato": { "nome": "Ana Souza", "email": "ana@exemplo.com" },
  "respostas": [
    {
      "id": "uuid",
      "texto": "Olá, Ana!\n\nPedimos desculpas pela demora.",
      "textoApagadoEm": null,
      "enviadaEm": "2026-10-25T19:10:00.000Z",
      "autor": { "nome": "Coordenadora Sinuelo" }
    }
  ],
  "envioDeEmail": "teste"
}
```

> `respostas`: o que a equipe já respondeu pelo Echo, da mais antiga à mais recente (seção 6.1).
> `envioDeEmail`: `desligado` (sem provedor: a tela oferece só o `mailto:`), `teste` (vai para o
> `EMAIL_DESTINO_TESTE`) ou `ligado`.

> **Retenção (LGPD, seção 23).** Passado o prazo, ou a pedido do cliente, o contato e o comentário
> são apagados e o feedback fica. `contatoApagadoEm` e `comentarioApagadoEm` dizem quando, para a
> tela mostrar "apagado em…" em vez de um espaço vazio; também vêm na listagem. Com o contato
> apagado, `contato` é `null` e `anonimo` continua `false` (o cliente pediu resposta).

> **O único lugar em que o contato do cliente sai.** Quem abre a ocorrência é quem vai responder;
> listagens, notificações e métricas nunca o trazem (LGPD), e há teste travando isso. `contato` é
> `null` para feedback anônimo, e `nome` pode vir `null` (é opcional para o cliente).

**Erros:** `401` (sem token) · `404` `OCORRENCIA_NAO_ENCONTRADA`.

---

## 6. `PATCH /occurrences/:id` — mudar o status
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Registra a tratativa da ocorrência.

**Requisição:**
```json
{ "status": "RESOLVIDO" }
```
- `status`: `PENDENTE` | `EM_ANDAMENTO` | `RESOLVIDO`

**Resposta `200`:** a ocorrência atualizada, no mesmo formato do detalhe.

> `tratadoPor` é preenchido a partir do **token**, nunca do corpo da requisição — enviar `tratadoPorId`
> no body não tem efeito. `tratadoEm` recebe o horário da alteração.

**Erros:** `400` `VALIDACAO` (status fora do enum) · `401` (sem token) · `404` `OCORRENCIA_NAO_ENCONTRADA`.

---

## 6.1. `POST /occurrences/:id/respostas` — responder ao cliente por e-mail
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Corpo: `{ "texto": "Olá, Ana! …" }`,
de 1 a **2000** caracteres (sem os espaços das pontas; `\r\n` vira `\n`).

O e-mail vai para o `contatoEmail` do cliente com o texto como foi escrito, mais a assinatura
("— Fulano, da equipe do Restaurante Sinuelo") e um rodapé dizendo por que a pessoa recebe e o
link da página de privacidade. **Responder para** é o e-mail de quem escreveu: se o cliente
responder, a conversa segue direto com essa pessoa. Em teste (`EMAIL_DESTINO_TESTE`), vai para o
endereço de teste e **sem** o "responder para" (seria um e-mail fictício do seed).

**Resposta `201`:** a resposta gravada, no formato de um item de `respostas` (seção 5).

> **Envia primeiro, grava depois.** Se o provedor recusar, nada é gravado e a resposta é `502`: uma
> resposta registrada como enviada sem ter saído enganaria a equipe. A situação da ocorrência não
> muda sozinha; quem respondeu escolhe na tratativa. Registra `RESPOSTA_ENVIADA` no log, sem o
> texto nem o e-mail.

**Erros:** `400` `VALIDACAO` · `401` · `404` `OCORRENCIA_NAO_ENCONTRADA` · `409` `SEM_CONTATO`
(anônimo, ou o contato já saiu pela retenção) · `502` `EMAIL_NAO_ENVIADO` (o provedor recusou ou
não respondeu) · `503` `EMAIL_DESLIGADO` (a API está sem provedor).

---

## 7. `POST /api/qrcodes` — gerar QR Code
**Protegido** (`ADMINISTRADOR`). Cria um QR Code para uma área e devolve o token, a URL do
formulário e a imagem (PNG em data URL).

> Ficou aberta do MVP até o log de auditoria: sem autenticação não há autor para registrar, e
> qualquer um na internet podia gravar QR Code no banco.

**Requisição:**
```json
{ "areaId": "uuid", "token": "MESA12", "desativarAnteriores": true }
```
- `token` é **opcional** (ex.: `"MESA12"`); se omitido, o servidor gera um token aleatório.
- `desativarAnteriores` é **opcional** (padrão `false`). Com `true`, é o **substituir**: o código novo
  nasce e os ativos da mesma área deixam de valer, na mesma transação. Cada um registra
  `QRCODE_DESATIVADO` com `motivo: "substituido"` no log. Sem ele, o código novo passa a valer **junto**
  com os anteriores, e um QR perdido continua aceitando feedback.

**Resposta `201`:**
```json
{
  "id": "uuid",
  "token": "MESA12",
  "url": "http://localhost:5173/feedback?t=MESA12",
  "imagem": "data:image/png;base64,iVBORw0KGgo..."
}
```
**Erros:** `400` `VALIDACAO` (areaId ausente, `desativarAnteriores` não booleano) · `400` `AREA_INATIVA` (o código nasceria sem
funcionar: os endpoints públicos recusam área desativada) · `401` · `403` `SEM_PERMISSAO` ·
`404` (área não encontrada) · `409` (token já em uso).

---

## 7.1. `GET /api/qrcodes` — listar QR Codes
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Ativos primeiro, depois os mais recentes.

**Resposta `200`:**
```json
{
  "itens": [
    { "id": "uuid", "token": "MESA12", "ativo": true,
      "criadoEm": "2026-08-18T...", "area": { "id": "uuid", "nome": "Mesa 12" },
      "url": "https://echo-ten-pied.vercel.app/feedback?t=MESA12" }
  ]
}
```

- `url` vem pronta: só a API sabe para que endereço o QR aponta (`WEB_BASE_URL`).

> Aberto a toda a gestão, não só ao administrador, mas nunca ao público: a listagem entrega todos
> os tokens de uma vez, e com eles dá para enviar feedback em nome de qualquer área sem passar por
> nenhuma mesa.

**Erros:** `401` · `403` `SEM_PERMISSAO`.

---

## 7.2. `PATCH /api/qrcodes/:id` — desativar ou reativar um QR Code
**Protegido** (`ADMINISTRADOR`). Para o QR perdido, roubado ou estragado: tira só aquele código de
circulação, sem desativar a área inteira. Desativado, o código para de abrir o formulário.

**Requisição:**
```json
{ "ativo": false }
```

**Resposta `200`:** o código no mesmo formato de um item do `GET /api/qrcodes` (com `area` e `url`).

> Registra `QRCODE_DESATIVADO` ou `QRCODE_REATIVADO` no log, só quando a situação muda de fato.

**Erros:** `400` `VALIDACAO` (`ativo` não booleano) · `400` `AREA_INATIVA` (reativar código de área
desativada: constaria como valendo, mas o formulário recusaria) · `401` · `403` `SEM_PERMISSAO` ·
`404` `QR_NAO_ENCONTRADO`.

---

## 8. `GET /api/qrcodes/:token/imagem` — imagem do QR Code
Devolve a imagem do QR. Escaneada, abre o formulário do cliente.

**Parâmetros (query, opcionais):**

| Parâmetro | Valores | Padrão |
|---|---|---|
| `formato` | `png` · `svg` | `png` |
| `tamanho` | inteiro de `200` a `2048` (largura do PNG em pixels; ignorado no SVG) | `400` |

- **SVG** é vetorial: nítido em qualquer tamanho. É o que a tela de apresentação e o cartão de mesa
  impresso usam. **PNG** serve para quem precisa de um arquivo de imagem (o botão "Baixar PNG" pede 1024).
- Correção de erro nível **M** (até 15% do código pode estar danificado) e margem de 2 módulos.

**Resposta `200`:** `Content-Type: image/png` ou `image/svg+xml`.

> **Aberta**: só serve token ativo, e o token já está impresso na mesa.

**Erros:** `400` `VALIDACAO` (`formato` ou `tamanho` inválido) · `404` `QR_NAO_ENCONTRADO` (token
não encontrado ou inativo).

---

## 9. `GET /api/areas` — listar áreas

Lista as áreas cadastradas (mesas, salão etc.), usada pela tela de geração de QR Code para escolher o destino do código.

> **Aberta**, ao contrário do `POST /api/qrcodes`: devolve só nomes de mesa e de salão, que estão
> à vista de qualquer cliente no restaurante. Nenhum token sai por aqui.

**Resposta `200`:**
```json
{
  "itens": [
    { "id": "uuid", "nome": "Mesa 12", "ativo": true, "venue": { "nome": "Restaurante Sinuelo" } }
  ]
}
```
Ativas primeiro, depois por nome. Devolve `{ "itens": [] }` quando não há áreas.

> **Devolve ativas e inativas.** Quem oferece destino para um QR Code novo precisa filtrar pelas
> ativas; a tela de configurações mostra as duas, para permitir reativar.

---

## 9.1. `POST /api/areas` — cadastrar área
**Protegido** (`ADMINISTRADOR`).

```json
{ "nome": "Varanda" }
```
- `venueId` é **opcional** quando há um único restaurante cadastrado — que é o caso do Sinuelo.
  Com mais de um, passa a ser obrigatório.
- O nome é gravado com `trim()`: a constraint `@@unique([venueId, nome])` é por texto exato, então
  sem isso `"Mesa 1"` e `"Mesa 1 "` conviveriam como áreas distintas.

**Resposta `201`:** a área criada, no formato da listagem.

**Erros:** `400` `VALIDACAO` · `401` · `403` · `409` `CONFLITO` (nome já usado no restaurante, sem
diferenciar maiúsculas: com "Mesa 12" cadastrada, "mesa 12" é recusada; "Mesa_12" não, porque `_` e
`%` contam como texto).

---

## 9.2. `PATCH /api/areas/:id` — renomear ou ativar/desativar
**Protegido** (`ADMINISTRADOR`). Aceita `nome` e `ativo`, ambos opcionais.

**Resposta `200`:** a área atualizada.

> **Área é desativada, nunca apagada.** Feedbacks e QR Codes já emitidos apontam para ela, e o
> histórico precisa continuar fazendo sentido. Desativar só a retira das opções de novos QR Codes.

**Erros:** `400` `VALIDACAO` · `401` · `403` · `404` `AREA_NAO_ENCONTRADA` · `409` `CONFLITO` (nome de
outra área do restaurante, sem diferenciar maiúsculas; mudar só a grafia da própria área é permitido).

---

## 9.3. `GET /api/categorias` — listar categorias de avaliação
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Em ordem alfabética, para os filtros
da gestão. O cliente recebe as categorias pelo `GET /api/public/venue/:qrToken`.

**Resposta `200`:**
```json
{ "itens": [ { "id": "uuid", "nome": "Alimento" }, { "id": "uuid", "nome": "Atendimento" } ] }
```

> Os filtros montavam a lista a partir das ocorrências já carregadas, ou a tinham escrita no
> código. Vindo daqui, uma categoria nova no banco aparece sem mexer no front.

**Erros:** `401` · `403` `SEM_PERMISSAO`.

---

## 9.4. `GET /api/respostas-prontas` — modelos de resposta ao cliente
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Modelos que a equipe escolhe ao responder
o cliente (seção 6.1) e ajusta antes de enviar. Ativos primeiro, em ordem de título; os inativos vêm
também (as configurações precisam deles para reativar), e a tela da ocorrência mostra só os ativos.

**Resposta `200`:**
```json
{ "itens": [ { "id": "uuid", "titulo": "Pedido de desculpas", "texto": "Sentimos muito…", "ativo": true, "atualizadoEm": "…" } ] }
```

> A resposta enviada guarda o texto final, sem apontar para o modelo: editar o modelo depois não
> reescreve o que já foi dito ao cliente.

**Erros:** `401` · `403` `SEM_PERMISSAO`.

## 9.5. `POST /api/respostas-prontas` — cadastrar
**Protegido** (`ADMINISTRADOR`). Corpo: `{ "titulo": "…", "texto": "…" }`. `titulo` até **80**
caracteres; `texto` até **1500** (abaixo dos 2000 da resposta, que ainda leva a saudação). Os dois
sem os espaços das pontas; `\r\n` vira `\n`. Resposta `201`: o modelo. Registra
`RESPOSTA_PRONTA_CRIADA`.

**Erros:** `400` `VALIDACAO` · `401` · `403` · `409` `CONFLITO` (título já usado, sem diferenciar
maiúsculas).

## 9.6. `PATCH /api/respostas-prontas/:id` — editar, desativar ou reativar
**Protegido** (`ADMINISTRADOR`). Corpo com `titulo`, `texto` e/ou `ativo`; só o que vier muda.
Resposta `200`: o modelo. Não há apagar: desativado, sai da lista de quem responde.

> No log, editar (`RESPOSTA_PRONTA_EDITADA`) e desativar/reativar são eventos separados, como nos
> usuários. Reenviar os mesmos valores não registra. O texto do modelo não vai para o log.

**Erros:** `400` `VALIDACAO` · `401` · `403` · `404` `RESPOSTA_PRONTA_NAO_ENCONTRADA` · `409`
`CONFLITO`.

---

## 10. `GET /api/metrics` — números do dashboard
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Devolve os agregados do período, já calculados no servidor — o front não faz conta.

**Parâmetro de consulta:**
- `dias` — **opcional**, inteiro de `1` a `365`. Padrão `30`. A janela é **tudo a partir de `agora - dias`**, sem teto.

> **A janela não tem limite superior de propósito.** O `criadoEm` é carimbado pelo banco
> (`DEFAULT CURRENT_TIMESTAMP`) e o `agora` vem do relógio da API — em produção são máquinas
> diferentes (Render e Neon). Com teto, um feedback gravado alguns milissegundos à frente sumiria
> do dashboard até os relógios alinharem. Data futura não existe legitimamente aqui, então o teto
> não protegeria de nada. O `periodo.ate` da resposta segue informando quando a consulta rodou.

**Resposta `200`:**
```json
{
  "periodo": { "dias": 30, "de": "2026-08-22T18:00:00.000Z", "ate": "2026-09-21T18:00:00.000Z" },
  "resumo": {
    "total": 42,
    "resolvidos": 18,
    "percentualResolvido": 43,
    "tempoMedioTratativaHoras": 2.4,
    "variacaoPercentual": 12
  },
  "porStatus": [{ "status": "PENDENTE", "total": 20 }],
  "porTipo": [{ "tipo": "ELOGIO", "total": 15 }],
  "porArea": [{ "area": "Mesa 12", "total": 9 }],
  "porCategoria": [{ "categoria": "Higiene", "total": 31, "mediaEstrelas": 3.4 }]
}
```

Regras que o front pode assumir:

| Campo | Regra |
|---|---|
| `porStatus` / `porTipo` | sempre com **todas** as opções do enum, inclusive zeradas |
| `porArea` / `porCategoria` | só quem teve registro no período; `[]` é resultado válido |
| `porArea` | ordenado por total (maior primeiro); feedback sem área aparece como `"Sem área"` |
| `porCategoria` | ordenado por nome; `mediaEstrelas` de 1 a 5, uma casa decimal |
| `tempoMedioTratativaHoras` | `null` quando ninguém foi tratado ainda — **não** `0` |
| `variacaoPercentual` | `null` quando o período anterior teve zero feedbacks (não há base de comparação) |
| `percentualResolvido` | inteiro de 0 a 100; `0` quando não há feedback no período |

> `tempoMedioTratativaHoras` mede `criadoEm → tratadoEm`, ou seja o tempo até a gestão **agir** na
> ocorrência. Não é tempo de resposta ao cliente: responder ao cliente não existe no MVP 1.
> Como `tratadoEm` é sobrescrito a cada `PATCH`, o que se mede é a **última** ação, não a primeira.
>
> **Cuidado ao ler esse número em período curto.** A média considera os feedbacks *criados* na
> janela que já foram tratados. Numa janela de 7 dias, uma ocorrência que leva 10 dias para ser
> tratada nunca entra na conta — só as rápidas entram, e a média sai otimista. Quanto menor o
> período, mais forte o viés.

> **Decisão de escopo: os números somam todos os restaurantes.** Não há filtro por `venue`, porque
> `User` não tem vínculo com `Venue` no schema. Com um só restaurante cadastrado (caso do Sinuelo)
> o resultado está correto. **Ao cadastrar o segundo restaurante, cada gestor passa a ver o total
> geral** — separar exige migration (`User.venueId`) e ficou para o MVP 2, junto com `GET /occurrences`,
> que tem a mesma característica.

**Erros:** `400` `VALIDACAO` (`dias` fora de 1–365 ou não inteiro) · `401` (sem token) · `403` `SEM_PERMISSAO`.

---

## 10.1. `GET /api/metrics/relatorio` — relatório histórico
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Série mês a mês e resumo por setor num
intervalo de datas explícito. É o que alimenta `/gerente/relatorios`; o `GET /metrics` acima segue
servindo o dashboard, com janela móvel.

**Parâmetros de consulta:**

| Parâmetro | Valores | Observação |
|---|---|---|
| `de` | `YYYY-MM-DD` | padrão: dia 1 do mês de 5 meses atrás (6 meses fechados até hoje) |
| `ate` | `YYYY-MM-DD` | padrão: hoje. Inclui o dia inteiro |

Intervalo de no máximo **24 meses**, para uma requisição não conseguir varrer a base inteira.

**Resposta `200`:**
```json
{
  "periodo": { "de": "2026-05-01", "ate": "2026-10-06" },
  "resumo": { "total": 31, "pendentes": 6, "emAndamento": 2, "resolvidos": 23, "percentualResolvido": 74 },
  "meses": [
    {
      "mes": "2026-08",
      "total": 7,
      "porTipo": { "ELOGIO": 4, "SUGESTAO": 1, "RECLAMACAO": 2 },
      "categorias": [
        { "categoria": "Alimento", "avaliacoes": 7, "mediaEstrelas": 4.4 },
        { "categoria": "Higiene", "avaliacoes": 0, "mediaEstrelas": null }
      ]
    }
  ],
  "porArea": [
    { "area": "Mesa 12", "total": 16, "pendentes": 5, "emAndamento": 1, "resolvidos": 10, "percentualResolvido": 63 }
  ],
  "porCategoria": [
    { "categoria": "Alimento", "avaliacoes": 22, "mediaEstrelas": 4.4, "mediaAnterior": 4.0 }
  ]
}
```

> **Todos os meses do intervalo vêm na série**, inclusive os sem feedback. Mês vazio é informação, e
> pular o ponto faria o gráfico ligar março a maio como se abril não tivesse existido.

> **O mês é o do restaurante** (fuso de Brasília). O feedback das 23h30 do dia 31 é do mês que
> termina, não do seguinte, que é onde ele cairia em UTC.

> **`mediaEstrelas` é `null`, nunca `0`, quando ninguém avaliou.** Zero estrelas seria lido como nota
> péssima. `mediaAnterior` é a média da categoria no período **anterior de mesmo tamanho**, colado
> antes do `de`. Ela é `null` quando não há base de comparação.

**Erros:** `400` `VALIDACAO` (data malformada ou inexistente, intervalo invertido ou maior que
24 meses) · `401` · `403` `SEM_PERMISSAO`.

> **Data inexistente é recusada** em todos os filtros por data (ocorrências, auditoria e este). O
> JavaScript aceitaria `2026-02-31` e rolaria em silêncio para 3 de março, e a resposta viria de um
> período diferente do pedido.

---

## 11. `GET /api/users` — listar a equipe de gestão
**Protegido** (`ADMINISTRADOR`). Lista usuários ativos e inativos, ativos primeiro, depois por nome.

**Resposta `200`:**
```json
{
  "itens": [
    { "id": "uuid", "nome": "Gerente Sinuelo", "email": "gerente@sinuelo.com",
      "papel": "GERENTE", "setor": "Salão", "ativo": true, "criadoEm": "2026-08-18T..." }
  ]
}
```
> `senhaHash` **nunca** sai em nenhuma resposta desta API — há teste travando isso.

**Erros:** `401` · `403` `SEM_PERMISSAO`.

---

## 12. `POST /api/users` — criar usuário
**Protegido** (`ADMINISTRADOR`).

```json
{ "nome": "Nova Coordenadora", "email": "nova@sinuelo.com",
  "senha": "umasenhaboa", "papel": "COORDENADOR", "setor": "Salão" }
```
- `setor` é **opcional**; `senha` tem no mínimo **8 caracteres**
- o e-mail é normalizado (`trim` + minúsculas) antes de gravar

**Resposta `201`:** o usuário criado, no formato da listagem.

**Erros:** `400` `VALIDACAO` · `401` · `403` · `409` `CONFLITO` (e-mail já cadastrado).

---

## 13. `PATCH /api/users/:id` — editar usuário
**Protegido** (`ADMINISTRADOR`). Aceita `nome`, `email`, `papel`, `setor` e `ativo`, todos opcionais.
`setor: null` limpa o campo.

**Resposta `200`:** o usuário atualizado.

> **Usuário é desativado, nunca apagado.** As tratativas já registradas apontam para ele e precisam
> continuar mostrando quem agiu. Usuário inativo não consegue fazer login — e o `POST /auth/login`
> responde a mesma coisa de senha errada, para não revelar que a conta existe e foi desligada.

> **Duas travas contra o administrador se trancar fora:** ele não pode desativar a própria conta
> nem remover o próprio papel de `ADMINISTRADOR`. Não existiria caminho de volta pela interface.

**Erros:** `400` `VALIDACAO` · `401` · `403` · `404` `USUARIO_NAO_ENCONTRADO` · `409` `CONFLITO`.

---

## 14. `PATCH /api/users/:id/senha` — administrador redefine a senha de alguém
**Protegido** (`ADMINISTRADOR`). Corpo: `{ "novaSenha": "..." }`, mínimo 8 caracteres.

Não exige a senha atual de propósito: o caso de uso é justamente quem esqueceu a dela.

**Resposta `204`** (sem corpo). **Erros:** `400` · `401` · `403` · `404`.

---

## 15. `PATCH /api/auth/senha` — trocar a própria senha
**Protegido** (qualquer papel autenticado). Corpo: `{ "senhaAtual": "...", "novaSenha": "..." }`.

Exige a senha atual, por ser a credencial de quem está logado — diferente do endpoint acima,
que é administração de terceiros.

**Resposta `204`** (sem corpo).

**Erros:** `400` `VALIDACAO` · `401` `CREDENCIAIS_INVALIDAS` (senha atual incorreta ou sem token).

---

## 16. `GET /api/audit` — log de auditoria
**Protegido** (`ADMINISTRADOR`). Quem fez o quê, sobre qual registro e quando — do mais recente
ao mais antigo. Somente leitura: nenhuma rota edita ou apaga registro do log.

**Parâmetros de consulta** — todos opcionais:

| Parâmetro | Valores | Observação |
|---|---|---|
| `pagina` / `porPagina` | como no `GET /occurrences` | padrão `1` e `20`, teto de **100** |
| `usuarioId` | id de um usuário, ou `sistema` | só o que essa pessoa fez; `sistema`: só o que o Echo fez sozinho |
| `acao` | uma das ações da tabela abaixo | |
| `de` / `ate` | `YYYY-MM-DD` | `ate` inclui o dia inteiro |

**Resposta `200`:**
```json
{
  "itens": [
    {
      "id": "uuid",
      "acao": "AREA_RENOMEADA",
      "entidade": "Area",
      "entidadeId": "uuid",
      "detalhes": { "de": "Mesa 1", "para": "Mesa 1 - Janela" },
      "criadoEm": "2026-10-05T18:50:00.000Z",
      "usuario": { "id": "uuid", "nome": "Admin Sinuelo" }
    }
  ],
  "total": 1, "pagina": 1, "porPagina": 20, "paginas": 1
}
```

`usuario` é `null` no que o Echo fez sozinho, sem ninguém logado: hoje só a retenção automática.

**O que é registrado, e o que vai em `detalhes`:**

| `acao` | Quando | `detalhes` |
|---|---|---|
| `LOGIN` | login bem-sucedido | — |
| `SENHA_ALTERADA` | o usuário troca a própria senha | — |
| `SENHA_REDEFINIDA` | o administrador redefine a de alguém | `nome` do alvo |
| `USUARIO_CRIADO` | | `nome`, `papel` |
| `USUARIO_EDITADO` | nome, e-mail, papel ou setor mudou | `nome`, `alteracoes: { campo: { de, para } }` |
| `USUARIO_DESATIVADO` / `USUARIO_REATIVADO` | | `nome` |
| `AREA_CRIADA` | | `nome` |
| `AREA_RENOMEADA` | | `de`, `para` |
| `AREA_DESATIVADA` / `AREA_REATIVADA` | | `nome` |
| `QRCODE_GERADO` | | `area`, `token` |
| `QRCODE_DESATIVADO` / `QRCODE_REATIVADO` | pelo `PATCH`, ou ao substituir (só desativado) | `area`, `token`; `motivo: "substituido"` quando veio da substituição |
| `OCORRENCIA_STATUS` | o status mudou | `de`, `para`, `area` |
| `CONFIGURACAO_ALTERADA` | uma configuração do sistema mudou (um registro por campo) | `campo`, `de`, `para` |
| `RETENCAO_APLICADA` | a retenção rodou: pela tela (sempre) ou sozinha (só se algo saiu, com `usuario` `null`) | `contatos`, `comentarios`, `notificacoes` (quantos saíram) e `prazos` da vez |
| `DADOS_DO_TITULAR_APAGADOS` | o administrador atendeu o pedido de um cliente | `feedbacks` (quantos); o e-mail não é guardado |
| `RESPOSTA_ENVIADA` | alguém da equipe respondeu ao cliente pelo Echo | `area`; o texto e o e-mail não são guardados aqui |
| `RESPOSTA_PRONTA_CRIADA` | | `titulo` |
| `RESPOSTA_PRONTA_EDITADA` | o título ou o texto de um modelo mudou | `titulo`, `tituloAnterior` (se renomeou), `textoMudou`; o texto não |
| `RESPOSTA_PRONTA_DESATIVADA` / `RESPOSTA_PRONTA_REATIVADA` | | `titulo` |
| `AVISO_POR_EMAIL_ALTERADO` | alguém mudou os próprios avisos por e-mail (`entidade` `User`, a própria pessoa) | `de`, `para` (`NENHUM` \| `RECLAMACOES` \| `TODOS`) |

> **Gravado na mesma transação da ação.** Ou os dois entram, ou nenhum: um log que às vezes falta
> não serve para auditar.

> **Só o que mudou de fato.** Reenviar o mesmo status, ou um `PATCH` com os mesmos valores, não
> gera registro. Desativar alguém é um evento próprio, separado de editar — é o que alguém vai
> procurar no log.

> **`detalhes` guarda o nome da época.** Renomear a área depois não reescreve o que o log mostra.
> Pelo mesmo motivo `entidadeId` não tem chave estrangeira: o registro sobrevive ao alvo.

> **Tentativa de login falha não entra.** Não tem autor identificável, e gravar o e-mail digitado
> guardaria endereço de quem nem tem conta. Senha, em qualquer forma, nunca vai para o log.

**Erros:** `400` `VALIDACAO` (paginação, `acao` ou data inválidos) · `401` · `403` `SEM_PERMISSAO`.

---

## 17. `GET /api/notifications` — notificações de quem está logado
**Protegido** (qualquer papel). Cada usuário vê só as próprias, das mais recentes às mais antigas.

> **Regra de negócio:** todo feedback novo notifica, de qualquer tipo — elogio, sugestão ou
> reclamação — sem limiar de nota. Cada pessoa da gestão **ativa** recebe a sua notificação, com o
> próprio "lida": o coordenador abrir o alerta não apaga o do gerente. Por e-mail, só o que cada
> pessoa escolheu (seção 20.1); push do navegador fica para depois.

**Parâmetros de consulta:** `pagina` / `porPagina` (como no `GET /occurrences`) e `lida`
(`true` | `false`), todos opcionais.

**Resposta `200`:**
```json
{
  "itens": [
    {
      "id": "uuid",
      "lida": false,
      "criadoEm": "2026-10-05T22:12:48.224Z",
      "feedback": {
        "id": "uuid",
        "tipo": "RECLAMACAO",
        "comentario": "Demora para trazer a conta.",
        "status": "PENDENTE",
        "area": { "nome": "Mesa 12" },
        "avaliacoes": [{ "categoria": "Atendimento", "estrelas": 2 }]
      }
    }
  ],
  "total": 30, "naoLidas": 3, "pagina": 1, "porPagina": 20, "paginas": 2
}
```

> `naoLidas` é sempre o total de não lidas de quem pergunta, **independente** do filtro `lida`.
> A mensagem não é gravada: vem do feedback, então o `status` é o atual — dá para ver de relance se
> alguém já tratou. O `contatoEmail` do cliente **não** sai aqui (LGPD).

**Erros:** `400` `VALIDACAO` · `401`.

---

## 18. `GET /api/notifications/contagem` — número de não lidas
**Protegido** (qualquer papel). Resposta `200`: `{ "naoLidas": 3 }`.

Existe à parte da listagem porque o sino do cabeçalho consulta a cada minuto e não precisa de mais
nada.

---

## 19. `PATCH /api/notifications/:id` — marcar como lida ou não lida
**Protegido** (qualquer papel). Corpo: `{ "lida": true }`.

**Resposta `200`:** a notificação, no formato da listagem.

> A notificação de **outra pessoa** responde `404`, igual à inexistente — não confirmar que um id
> existe para quem não é o dono. Marcar como lida **não** entra no log de auditoria: é rotina
> pessoal, não alteração no sistema.

**Erros:** `400` `VALIDACAO` (`lida` não booleano) · `401` · `404` `NOTIFICACAO_NAO_ENCONTRADA`.

---

## 20. `POST /api/notifications/marcar-todas-lidas`
**Protegido** (qualquer papel). Marca como lidas todas as não lidas **de quem pediu**.

**Resposta `200`:** `{ "atualizadas": 3 }`.

---

## 20.1. `GET /api/notifications/preferencias` — avisos por e-mail de quem está logado
**Protegido** (qualquer papel). **Resposta `200`:**
```json
{ "avisoPorEmail": "RECLAMACOES", "email": "gerente@sinuelo.com", "envioLigado": true, "modoDeTeste": true }
```
- `avisoPorEmail`: `NENHUM` | `RECLAMACOES` (padrão) | `TODOS` — quais feedbacks novos chegam
  também por e-mail, além do sino
- `envioLigado`: `false` quando a API não tem provedor configurado (sem `RESEND_API_KEY`). A tela
  diz isso em vez de oferecer uma escolha que não faz nada
- `modoDeTeste`: `true` com `EMAIL_DESTINO_TESTE`, quando todo e-mail vai para esse endereço (ver
  `docs/DEPLOY.md`). O endereço em si não sai daqui

---

## 20.2. `PATCH /api/notifications/preferencias` — mudar os próprios avisos
**Protegido** (qualquer papel). Corpo: `{ "avisoPorEmail": "TODOS" }`. Muda só a de quem pediu.

**Resposta `200`:** o mesmo do `GET`. Mudar entra no log (`AVISO_POR_EMAIL_ALTERADO`); salvar o
mesmo valor, não.

**Erros:** `400` `VALIDACAO` (valor fora das três opções) · `401`.

> **O que o e-mail leva:** tipo, área, data e hora (de Brasília), as notas e o link da ocorrência.
> **Não leva o comentário nem o contato do cliente** (LGPD): numa caixa de e-mail, a retenção do
> Echo não alcança. Quem foi desativado não recebe.

---

## 21. `GET /api/configuracoes` — configurações do sistema
**Protegido** (`ADMINISTRADOR`). Resposta `200`:
```json
{
  "duracaoSessaoHoras": 8,
  "retencaoContatoDias": 90,
  "retencaoComentarioDias": 365,
  "retencaoNotificacaoDias": 90,
  "ultimaRetencaoEm": "2026-10-21T21:45:46.000Z"
}
```
`ultimaRetencaoEm` é a última vez que a retenção rodou (`null` antes da primeira).

Enquanto ninguém salvou nada, devolve os padrões.

**Erros:** `401` · `403` `SEM_PERMISSAO`.

---

## 22. `PATCH /api/configuracoes` — alterar configurações
**Protegido** (`ADMINISTRADOR`). Corpo: qualquer combinação dos campos abaixo; os que não vierem
ficam como estão. Todos inteiros.

| Campo | Faixa | Padrão |
|---|---|---|
| `duracaoSessaoHoras` | 1 a 24 | 8 |
| `retencaoContatoDias` | 30 a 365 | 90 |
| `retencaoComentarioDias` | 30 a 1825 | 365 |
| `retencaoNotificacaoDias` | 7 a 365 | 90 |

**Resposta `200`:** todas as configurações, como no `GET`.

> **A duração da sessão vale na hora, nos dois sentidos.** O token sai do login sempre com o teto
> de 24h; o `requireAuth` compara a **idade da sessão** com a duração configurada **agora**, a cada
> requisição. Encurtar derruba as sessões mais velhas que o novo limite, inclusive a de quem salvou;
> alongar estende as que ainda valem. Se a duração ficasse gravada no token, encurtar por segurança
> não teria efeito sobre quem já estava logado.

> Toda mudança entra no log de auditoria (`CONFIGURACAO_ALTERADA`, um registro por campo, com
> `de` e `para`). Salvar o mesmo valor não gera registro.

**Erros:** `400` `VALIDACAO` (nenhum campo conhecido, fora da faixa ou não inteiro; nada é salvo)
· `401` · `403` `SEM_PERMISSAO`.

---

## 23. Retenção de dados (LGPD)
**Anonimiza, não apaga o feedback.** Passado o prazo, sai o que identifica o cliente: nome e e-mail
de quem pediu resposta (`retencaoContatoDias`), junto com o **texto das respostas** que a equipe
mandou (dirigidas a ele, costumam trazer o nome; o registro de que houve resposta fica), e o
comentário, texto livre (`retencaoComentarioDias`), além das notificações (`retencaoNotificacaoDias`). Tipo, notas, área,
data e situação ficam: os painéis e relatórios não mudam (há teste travando isso). Os prazos
contam da data do feedback (ou da notificação).

**Roda sozinha:** ao ligar a API e de hora em hora enquanto ela está de pé, no máximo uma vez por
dia (`ultimaRetencaoEm`). O Render gratuito não tem agendador; como a API acorda a cada uso, roda
todo dia com movimento. Duas rodadas ao mesmo tempo não aplicam duas vezes. Idempotente. No log,
só as contagens, nunca o conteúdo apagado.

### 23.1. `GET /api/retencao/previa` — o que sairia agora
**Protegido** (`ADMINISTRADOR`). Não muda nada. Resposta `200`:
`{ "contatos": 12, "comentarios": 3, "notificacoes": 40, "respostas": 2, "ultimaRetencaoEm": "…" | null }`.

### 23.2. `POST /api/retencao/aplicar` — aplicar agora
**Protegido** (`ADMINISTRADOR`). Sem corpo. Resposta `200`: `{ "contatos": 12, "comentarios": 3,
"notificacoes": 40, "respostas": 2 }` (quantos saíram). Sempre registra `RETENCAO_APLICADA` com quem aplicou.

### 23.3. `POST /api/retencao/titular` — pedido do cliente (LGPD, art. 18)
**Protegido** (`ADMINISTRADOR`). Corpo: `{ "email": "ana@exemplo.com" }`. Apaga na hora o
contato, o comentário e o texto das respostas de **todos** os feedbacks daquele e-mail, sem diferenciar maiúsculas e sem
esperar prazo. Resposta `200`: `{ "feedbacks": 2 }` (pode ser `0`). Registra
`DADOS_DO_TITULAR_APAGADOS` só com a quantidade: o e-mail não fica em lugar nenhum.

**Erros:** `400` `VALIDACAO` (e-mail ausente ou sem formato de e-mail) · `401` · `403`
`SEM_PERMISSAO`.

---

## Convenção de erro adicional
Rotas inexistentes retornam `404` com `{ "erro": "Rota não encontrada", "codigo": "ROTA_NAO_ENCONTRADA" }`. Erros inesperados retornam `500` com `codigo: "ERRO_INTERNO"`.

---

## Fora do escopo deste contrato (MVP 2+)
Série histórica **por dia** (o relatório agrega por mês), PDF gerado no servidor (hoje sai pela impressão do navegador), notificação por push do navegador e a **tela administrativa** de QR Codes (listar,
desativar e reimprimir os já emitidos).
