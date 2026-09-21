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

## 4. `GET /occurrences` — feedbacks para a gestão
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Lista, somente leitura, os feedbacks recebidos.

> "Ocorrência" = um feedback registrado. O `status` (`PENDENTE` | `EM_ANDAMENTO` | `RESOLVIDO`) nasce
> como `PENDENTE` e é alterado pelo `PATCH /occurrences/:id`. `tratadoPor` e `tratadoEm` ficam `null`
> enquanto ninguém tiver mexido.

**Header:** `Authorization: Bearer <token>`

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
  ]
}
```
**Erros:** `401` `NAO_AUTENTICADO` (sem token) · `401` `TOKEN_INVALIDO` (token inválido ou expirado) ·
`403` `SEM_PERMISSAO` (papel fora da lista).

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
    { "id": "uuid", "nome": "Mesa 12", "venue": { "nome": "Restaurante Sinuelo" } }
  ]
}
```
Ordenada por nome. Devolve `{ "itens": [] }` quando não há áreas.

---

## Convenção de erro adicional
Rotas inexistentes retornam `404` com `{ "erro": "Rota não encontrada", "codigo": "ROTA_NAO_ENCONTRADA" }`. Erros inesperados retornam `500` com `codigo: "ERRO_INTERNO"`.

---

## Fora do escopo deste contrato (MVP 2+)
Respostas prontas na tratativa, retorno ao cliente por e-mail, dashboards/indicadores, exportação PDF/CSV, notificações em tempo real, gestão de usuários e a **tela administrativa** de QR Codes.
