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
  ]
}
```
**Erros:** `404` se o token não existir ou estiver inativo.

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
| `categoria` | nome da categoria | traz quem **pontuou** aquela categoria |
| `busca` | texto livre | procura no comentário e no nome da área, ignorando maiúsculas |
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
      ]
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
> O `contatoEmail` **não** é devolvido nesta rota (dado pessoal — LGPD).

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
  "contato": { "nome": "Ana Souza", "email": "ana@exemplo.com" }
}
```

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

**Erros:** `400` `VALIDACAO` · `401` · `403` · `409` `CONFLITO` (nome já usado no restaurante).

---

## 9.2. `PATCH /api/areas/:id` — renomear ou ativar/desativar
**Protegido** (`ADMINISTRADOR`). Aceita `nome` e `ativo`, ambos opcionais.

**Resposta `200`:** a área atualizada.

> **Área é desativada, nunca apagada.** Feedbacks e QR Codes já emitidos apontam para ela, e o
> histórico precisa continuar fazendo sentido. Desativar só a retira das opções de novos QR Codes.

**Erros:** `400` `VALIDACAO` · `401` · `403` · `404` `AREA_NAO_ENCONTRADA` · `409` `CONFLITO`.

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
| `usuarioId` | id de um usuário | só o que essa pessoa fez |
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
| `CONFIGURACAO_ALTERADA` | uma configuração do sistema mudou | `campo`, `de`, `para` |

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
> próprio "lida": o coordenador abrir o alerta não apaga o do gerente. Entrega só dentro do sistema;
> e-mail e push do navegador dependem de provedor e ficam para depois.

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

## 21. `GET /api/configuracoes` — configurações do sistema
**Protegido** (`ADMINISTRADOR`). Resposta `200`: `{ "duracaoSessaoHoras": 8 }`.

Enquanto ninguém salvou nada, devolve os padrões.

**Erros:** `401` · `403` `SEM_PERMISSAO`.

---

## 22. `PATCH /api/configuracoes` — alterar configurações
**Protegido** (`ADMINISTRADOR`). Corpo: `{ "duracaoSessaoHoras": 4 }`, inteiro de **1 a 24**.

**Resposta `200`:** as configurações salvas.

> **A duração da sessão vale na hora, nos dois sentidos.** O token sai do login sempre com o teto
> de 24h; o `requireAuth` compara a **idade da sessão** com a duração configurada **agora**, a cada
> requisição. Encurtar derruba as sessões mais velhas que o novo limite, inclusive a de quem salvou;
> alongar estende as que ainda valem. Se a duração ficasse gravada no token, encurtar por segurança
> não teria efeito sobre quem já estava logado.

> Toda mudança entra no log de auditoria (`CONFIGURACAO_ALTERADA`, com `de` e `para`). Salvar o
> mesmo valor não gera registro.

**Erros:** `400` `VALIDACAO` (fora de 1–24 ou não inteiro) · `401` · `403` `SEM_PERMISSAO`.

---

## Convenção de erro adicional
Rotas inexistentes retornam `404` com `{ "erro": "Rota não encontrada", "codigo": "ROTA_NAO_ENCONTRADA" }`. Erros inesperados retornam `500` com `codigo: "ERRO_INTERNO"`.

---

## Fora do escopo deste contrato (MVP 2+)
Respostas prontas na tratativa, retorno ao cliente por e-mail, série histórica **por dia** (o relatório agrega por mês), PDF gerado no servidor (hoje sai pela impressão do navegador), notificação por e-mail ou push do navegador e a **tela administrativa** de QR Codes (listar,
desativar e reimprimir os já emitidos).
