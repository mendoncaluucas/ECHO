# Echo

> Transformamos silêncio em dado acionável.

**Echo** é uma plataforma web de coleta de feedback via **QR Code** para restaurantes de alto fluxo. O cliente avalia a experiência direto da mesa — sem app e sem cadastro — e a gestão recebe as manifestações organizadas, em tempo real e prontas para virar decisão.

Projeto desenvolvido no **PAC** do curso de Engenharia de Software do Centro Universitário Católica de Santa Catarina (Joinville), com estudo de caso no **Restaurante Sinuelo** (Araquari–SC).

---

## O problema

Em restaurantes de alto fluxo, boa parte do feedback dos clientes se dissipa antes de chegar à gestão. Cerca de **96% dos clientes insatisfeitos simplesmente não voltam — e nunca dizem o porquê**. Os canais tradicionais falham:

- **Caixinha de sugestões** — ignorada e raramente lida.
- **Formulário em papel** — some, atrasa e ninguém tabula.
- **Avaliação pública** — chega tarde, exposta e mancha a reputação.
- **Pergunta do garçom** — constrangedora e enviesada.

Resultado: a gestão decide no escuro, sem dado confiável e em tempo hábil de agir.

## A solução

| Recurso | Descrição |
|---|---|
| **QR Code na mesa** | Acesso mobile-first, sem app e sem cadastro. |
| **Avaliação por categoria** | Higiene, Atendimento e Alimento em menos de 2 minutos. |
| **Anônimo e em conformidade** | Anonimato opcional e LGPD desde a concepção. |
| **Feedback instantâneo** | Chega privado e estruturado, antes do cliente ir embora. |

## Perfis de acesso

- **Cliente** — QR Code → formulário por categoria → confirmação.
- **Coordenador** — painel de ocorrências, status e notificações em tempo real.
- **Gerente** — dashboard com KPIs, gráficos por setor e exportação PDF/CSV.
- **Administrador** — usuários, QR Codes por área, auditoria e conformidade LGPD.

## Estrutura do projeto

```
ECHO/
├─ web/        # Protótipo de alta fidelidade (frontend) — React + Vite + TypeScript
└─ (api/)      # Backend — a ser criado no PAC VI (Node.js + PostgreSQL)
```

## Tecnologias

**Protótipo atual (`web/`)**

- **React 18** + **Vite 6** + **TypeScript**
- **Tailwind CSS 4** e componentes **shadcn/ui** (Radix UI)
- **React Router** para navegação e **Recharts** para os indicadores

**Evolução pretendida (PAC VI)**

- **Backend:** Node.js — API REST/serviços
- **Banco de dados:** PostgreSQL
- **Segurança e conformidade:** autenticação por tokens (JWT), controle de acesso por papéis (RBAC), criptografia de dados sensíveis, validação de entradas e políticas de retenção — orientadas pelo **OWASP Top 10 (2021)** e pela **LGPD**.

> O protótipo em `web/` é um **mock de alta fidelidade** já validado com o cliente: funcionalidades como autenticação efetiva, tempo real e leitura de QR Code estão representadas na interface, mas ainda não operam de ponta a ponta. Este repositório inicia a implementação funcional a partir dele.

## Como rodar (protótipo)

```bash
cd web
npm install
npm run dev
```

## Status

🚧 **Em desenvolvimento** — protótipo de alta fidelidade concluído e validado com o Restaurante Sinuelo (junho/2026). Início da implementação funcional no PAC VI.

## Roadmap

- [ ] Configuração do backend (`api/`), versionamento e integração com o `web/`
- [ ] Plano de testes (unitários, integração e aceitação) desde o início
- [ ] Fluxo do cliente: QR Code → formulário de feedback (ponta a ponta)
- [ ] Autenticação e perfis de acesso (JWT + RBAC)
- [ ] Painéis de Coordenador, Gerente e Administrador com dados reais
- [ ] Ajustes mapeados na validação: identidade visual do Sinuelo, avaliação de múltiplas categorias, retorno ao cliente por e-mail, respostas prontas, ampliação de gráficos e múltiplos setores por usuário

## Equipe

- Alisson Gabriel Anderle
- Henrique Cordeiro de Oliveira
- Lucas Rogério Mendonça
- Nicholas Scoz dos Santos
- Victor Henrique Kunz
- Vinicius Steuernagel

---

<p align="center"><em>“Transformamos silêncio em dado acionável, e clientes insatisfeitos em clientes que voltam.”</em></p>
