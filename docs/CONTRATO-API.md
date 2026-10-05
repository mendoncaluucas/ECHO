# Contrato da API — MVP 1 (v1 · rascunho para revisão)

> Escopo: apenas os endpoints da entrega de **27/08** (cliente envia feedback → grava no banco → gestão vê).
> Esta é uma **primeira versão para a equipe revisar e ajustar** no Bloco 1 (18–20/08), não uma decisão final.

## Convenções

- **Base URL:** `/api` (ex.: `http://localhost:3333/api`)
- **Formato:** JSON em requisição e resposta (`Content-Type: application/json`)
- **Autenticação:** rotas protegidas exigem o header `Authorization: Bearer <token>` (JWT).
  O token é obtido em `POST /auth/login` e vale 8h por padrão (`JWT_EXPIRES_IN`).
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
  | `TOKEN_INVALIDO` | 401 | Token adulterado, assinado com outro segredo ou expirado |
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
  "anonimo": true,
  "contatoEmail": null,
  "avaliacoes": [
    { "categoriaId": "uuid", "estrelas": 2 },
    { "categoriaId": "uuid", "estrelas": 4 }
  ]
}
```
- `tipo`: `ELOGIO` | `SUGESTAO` | `RECLAMACAO`
- `anonimo`: se `false`, `contatoEmail` pode ser preenchido
- `estrelas`: inteiro de 1 a 5

**Resposta `201`:**
```json
{ "id": "uuid", "criadoEm": "2026-08-27T14:30:00.000Z" }
```
**Erros:** `400` (dados inválidos) · `404` (qrToken inexistente).

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
| `de` / `ate` | `YYYY-MM-DD` | `ate` inclui o dia inteiro, não para à meia-noite |

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
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Mesmo formato de um item da listagem.

**Resposta `200`:**
```json
{
  "id": "uuid",
  "tipo": "RECLAMACAO",
  "comentario": "Demora no atendimento.",
  "anonimo": true,
  "criadoEm": "2026-08-27T14:30:00.000Z",
  "status": "EM_ANDAMENTO",
  "tratadoPor": { "nome": "Coordenadora Sinuelo" },
  "tratadoEm": "2026-09-21T18:00:00.000Z",
  "area": { "nome": "Mesa 12" },
  "avaliacoes": [{ "categoria": "Atendimento", "estrelas": 2 }]
}
```
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
Cria um QR Code para uma área e devolve o token, a URL do formulário e a imagem (PNG em data URL).

> **Setup/administrativo.** O middleware de RBAC já existe (`requireAuth`), mas esta rota segue **aberta**
> por decisão de escopo: fechá-la entra junto com a tela administrativa de QR Codes, no MVP 2.
> Para proteger, basta `requireAuth([Papel.ADMINISTRADOR])` antes do handler.

**Requisição:**
```json
{ "areaId": "uuid", "token": "MESA12" }
```
- `token` é **opcional** (ex.: `"MESA12"`); se omitido, o servidor gera um token aleatório.

**Resposta `201`:**
```json
{
  "id": "uuid",
  "token": "MESA12",
  "url": "http://localhost:5173/feedback?t=MESA12",
  "imagem": "data:image/png;base64,iVBORw0KGgo..."
}
```
**Erros:** `400` (areaId ausente) · `404` (área não encontrada) · `409` (token já em uso).

---

## 7.1. `GET /api/qrcodes` — listar QR Codes
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Ativos primeiro, depois os mais recentes.

**Resposta `200`:**
```json
{
  "itens": [
    { "id": "uuid", "token": "MESA12", "ativo": true,
      "criadoEm": "2026-08-18T...", "area": { "nome": "Mesa 12" } }
  ]
}
```

> **Protegido, ao contrário do `POST` acima.** A listagem entrega todos os tokens de uma vez, e
> com eles dá para enviar feedback em nome de qualquer área sem passar por nenhuma mesa. O `POST`
> segue aberto por decisão de escopo herdada do MVP — fechá-lo entra junto com a tela
> administrativa de QR Codes.

**Erros:** `401` · `403` `SEM_PERMISSAO`.

---

## 8. `GET /api/qrcodes/:token/imagem` — imagem do QR Code
Devolve a imagem **PNG** do QR (para impressão). Escaneada, abre o formulário do cliente.

**Resposta `200`:** `Content-Type: image/png` (binário da imagem).

**Erros:** `404` (token não encontrado ou inativo).

---

## 9. `GET /api/areas` — listar áreas

Lista as áreas cadastradas (mesas, salão etc.), usada pela tela de geração de QR Code para escolher o destino do código.

> Mesma decisão de escopo do `POST /api/qrcodes`: segue aberta no MVP e passa a exigir RBAC quando a tela administrativa for fechada.

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

## Convenção de erro adicional
Rotas inexistentes retornam `404` com `{ "erro": "Rota não encontrada", "codigo": "ROTA_NAO_ENCONTRADA" }`. Erros inesperados retornam `500` com `codigo: "ERRO_INTERNO"`.

---

## Fora do escopo deste contrato (MVP 2+)
Respostas prontas na tratativa, retorno ao cliente por e-mail, série histórica por dia (o `GET /metrics` devolve o total do período, não a curva), exportação PDF/CSV, notificações em tempo real, gestão de usuários e a **tela administrativa** de QR Codes.
