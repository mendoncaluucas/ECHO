# Contrato da API — MVP 1 (v1 · rascunho para revisão)

> Escopo: apenas os endpoints da entrega de **27/08** (cliente envia feedback → grava no banco → gestão vê).
> Esta é uma **primeira versão para a equipe revisar e ajustar** no Bloco 1 (18–20/08), não uma decisão final.

## Convenções

- **Base URL:** `/api` (ex.: `http://localhost:3333/api`)
- **Formato:** JSON em requisição e resposta (`Content-Type: application/json`)
- **Autenticação:** rotas protegidas exigem o header `Authorization: Bearer <token>` (JWT)
- **Datas:** ISO 8601 (ex.: `2026-08-27T14:30:00.000Z`)
- **Erro padrão:**
  ```json
  { "erro": "mensagem legível", "codigo": "VALIDACAO" }
  ```
- **Status usados:** `200` ok · `201` criado · `400` validação · `401` não autenticado · `403` sem permissão · `404` não encontrado

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
**Erros:** `401` (credenciais inválidas).

---

## 4. `GET /occurrences` — feedbacks para a gestão
**Protegido** (`COORDENADOR`, `GERENTE`, `ADMINISTRADOR`). Lista, somente leitura, os feedbacks recebidos.

> No MVP 1, "ocorrência" = um feedback registrado. Status e tratativa entram no MVP 2.

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
      "area": { "nome": "Mesa 12" },
      "avaliacoes": [
        { "categoria": "Atendimento", "estrelas": 2 },
        { "categoria": "Alimento", "estrelas": 4 }
      ]
    }
  ]
}
```
**Erros:** `401` (sem token) · `403` (papel sem permissão).

---

## 5. `POST /api/qrcodes` — gerar QR Code
Cria um QR Code para uma área e devolve o token, a URL do formulário e a imagem (PNG em data URL).

> **Setup/administrativo.** No MVP está aberto; deve passar a exigir autenticação (RBAC) quando o middleware estiver pronto.

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

## 6. `GET /api/qrcodes/:token/imagem` — imagem do QR Code
Devolve a imagem **PNG** do QR (para impressão). Escaneada, abre o formulário do cliente.

**Resposta `200`:** `Content-Type: image/png` (binário da imagem).

**Erros:** `404` (token não encontrado ou inativo).

---

## Convenção de erro adicional
Rotas inexistentes retornam `404` com `{ "erro": "Rota não encontrada", "codigo": "ROTA_NAO_ENCONTRADA" }`. Erros inesperados retornam `500` com `codigo: "ERRO_INTERNO"`.

---

## Fora do escopo deste contrato (MVP 2+)
Tratativa de ocorrências (status, respostas prontas), dashboards/indicadores, exportação PDF/CSV, notificações em tempo real, gestão de usuários e a **tela administrativa** de QR Codes.
