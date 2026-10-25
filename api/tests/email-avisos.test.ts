import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import {
  enviarEmails,
  provedorResend,
  resumoDoEmail,
  usarProvedorDeEmail,
  type Email,
  type ProvedorDeEmail,
} from "../src/email.js";
import { esperarAvisosPendentes, montarAviso } from "../src/avisos.js";
import { autenticar, criarCenarioCliente, criarUsuario, QR_TOKEN } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

// Provedor que guarda o que receberia, em vez de mandar.
function provedorFalso() {
  const enviados: Email[] = [];
  const provedor: ProvedorDeEmail = {
    nome: "Falso",
    enviar: vi.fn(async (emails: Email[]) => {
      enviados.push(...emails);
    }),
  };
  usarProvedorDeEmail(provedor);
  return { provedor, enviados };
}

const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });

async function enviarFeedback(cenario: Cenario, dados: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/public/feedback")
    .send({
      qrToken: QR_TOKEN,
      tipo: "RECLAMACAO",
      avaliacoes: [{ categoriaId: cenario.categorias[0].id, estrelas: 2 }],
      ...dados,
    });
  expect(res.status).toBe(201);
  await esperarAvisosPendentes();
  return res.body as { id: string };
}

afterEach(() => {
  delete process.env.EMAIL_DESTINO_TESTE;
  delete process.env.EMAIL_REMETENTE;
  delete process.env.RESEND_API_KEY;
  vi.restoreAllMocks();
});

describe("envio de e-mail", () => {
  const email: Email = { para: "ana@exemplo.com", assunto: "Oi", texto: "Corpo", html: "<p>Corpo</p>" };

  it("desligado (sem provedor): não envia nada e devolve 0", async () => {
    usarProvedorDeEmail(null);
    expect(await enviarEmails([email])).toBe(0);
  });

  it("com o endereço de teste, todo e-mail vai para ele, dizendo para quem iria", async () => {
    const { enviados } = provedorFalso();
    process.env.EMAIL_DESTINO_TESTE = "lucas@exemplo.com";

    expect(await enviarEmails([email])).toBe(1);

    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe("lucas@exemplo.com");
    expect(enviados[0].assunto).toBe("[Teste · para ana@exemplo.com] Oi");
    expect(enviados[0].texto).toBe("Teste do Echo: em produção, este e-mail iria para ana@exemplo.com.\n\nCorpo");
    expect(enviados[0].html).toContain("<p>Corpo</p>");
  });

  it("Resend: manda em lote para a API, com a chave e o remetente", async () => {
    const buscar = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "1" }] }), { status: 200 }));
    const resend = provedorResend("re_chave", "Echo <avisos@echo.dev>", buscar as unknown as typeof fetch);

    await resend.enviar([email]);

    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, opcoes] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/batch");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.headers).toMatchObject({ Authorization: "Bearer re_chave" });
    expect(JSON.parse(opcoes.body as string)).toEqual([
      { from: "Echo <avisos@echo.dev>", to: ["ana@exemplo.com"], subject: "Oi", text: "Corpo", html: "<p>Corpo</p>" },
    ]);
  });

  it("Resend: mais de 100 e-mails saem em lotes de até 100 (limite da API)", async () => {
    const buscar = vi.fn(async () => new Response("{}", { status: 200 }));
    const resend = provedorResend("re_chave", "Echo <a@b.dev>", buscar as unknown as typeof fetch);

    await resend.enviar(Array.from({ length: 150 }, (_, i) => ({ ...email, para: `p${i}@exemplo.com` })));

    const tamanhos = buscar.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).length);
    expect(tamanhos).toEqual([100, 50]);
  });

  it("Resend: recusa vira erro com o status e a mensagem, sem destinatário nem conteúdo", async () => {
    const buscar = vi.fn(
      async () =>
        new Response(JSON.stringify({ statusCode: 403, message: "You can only send testing emails to your own email address" }), {
          status: 403,
        })
    );
    const resend = provedorResend("re_chave", "Echo <a@b.dev>", buscar as unknown as typeof fetch);

    const erro = await resend.enviar([email]).catch((e: Error) => e);

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe("Resend respondeu 403: You can only send testing emails to your own email address");
    expect((erro as Error).message).not.toContain("ana@exemplo.com");
  });

  it("o resumo do log diz o que está ligado, sem mostrar a chave nem o endereço de teste", () => {
    usarProvedorDeEmail(null);
    expect(resumoDoEmail()).toBe("E-mail desligado (sem RESEND_API_KEY).");

    usarProvedorDeEmail(provedorResend("re_segredo", "Echo <onboarding@resend.dev>"));
    expect(resumoDoEmail()).toMatch(/sem domínio verificado/);

    process.env.EMAIL_DESTINO_TESTE = "lucas@exemplo.com";
    const resumo = resumoDoEmail();
    expect(resumo).toMatch(/em teste/);
    expect(resumo).not.toContain("re_segredo");
    expect(resumo).not.toContain("lucas@exemplo.com");
  });
});

describe("aviso à equipe por feedback novo", () => {
  let cenario: Cenario;

  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("reclamação: vai para quem quer só reclamações (o padrão) e para quem quer tudo", async () => {
    const { enviados } = provedorFalso();
    await criarUsuario(Papel.GERENTE, "gerente@teste.com");
    const coordenador = await criarUsuario(Papel.COORDENADOR, "coord@teste.com");
    await prisma.user.update({ where: { id: coordenador.id }, data: { avisoPorEmail: "TODOS" } });
    const admin = await criarUsuario(Papel.ADMINISTRADOR, "admin@teste.com");
    await prisma.user.update({ where: { id: admin.id }, data: { avisoPorEmail: "NENHUM" } });

    await enviarFeedback(cenario, { tipo: "RECLAMACAO" });

    expect(enviados.map((e) => e.para).sort()).toEqual(["coord@teste.com", "gerente@teste.com"]);
  });

  it("elogio e sugestão: só para quem quer tudo", async () => {
    const { enviados } = provedorFalso();
    await criarUsuario(Papel.GERENTE, "gerente@teste.com");
    const coordenador = await criarUsuario(Papel.COORDENADOR, "coord@teste.com");
    await prisma.user.update({ where: { id: coordenador.id }, data: { avisoPorEmail: "TODOS" } });

    await enviarFeedback(cenario, { tipo: "ELOGIO" });
    await enviarFeedback(cenario, { tipo: "SUGESTAO" });

    expect(enviados.map((e) => e.para)).toEqual(["coord@teste.com", "coord@teste.com"]);
  });

  it("quem foi desativado não recebe", async () => {
    const { enviados } = provedorFalso();
    const gerente = await criarUsuario(Papel.GERENTE);
    await prisma.user.update({ where: { id: gerente.id }, data: { ativo: false } });

    await enviarFeedback(cenario);

    expect(enviados).toHaveLength(0);
  });

  it("leva tipo, área, notas e o link da ocorrência; não leva comentário nem contato do cliente", async () => {
    const { enviados } = provedorFalso();
    await criarUsuario(Papel.GERENTE);

    const { id } = await enviarFeedback(cenario, {
      comentario: "Demorou muito, falem com o Carlos 47 99999-0000",
      anonimo: false,
      contatoNome: "Mariana Souza",
      contatoEmail: "mariana@cliente.com",
    });

    expect(enviados).toHaveLength(1);
    const [aviso] = enviados;
    expect(aviso.assunto).toBe("Reclamação nova · Mesa 1");
    expect(aviso.texto).toContain("Chegou uma reclamação: Mesa 1,");
    expect(aviso.texto).toContain("Notas: Higiene 2 de 5.");
    expect(aviso.texto).toContain(`http://localhost:5173/coordenador/ocorrencia/${id}`);
    for (const corpo of [aviso.texto, aviso.html, aviso.assunto]) {
      expect(corpo).not.toContain("Carlos");
      expect(corpo).not.toContain("Mariana");
      expect(corpo).not.toContain("mariana@cliente.com");
    }
  });

  it("o cliente não espera o e-mail: a resposta sai antes de o provedor terminar", async () => {
    let liberar!: () => void;
    const segurado = new Promise<void>((resolver) => (liberar = resolver));
    usarProvedorDeEmail({ nome: "Lento", enviar: () => segurado });
    await criarUsuario(Papel.GERENTE);

    const res = await request(app)
      .post("/api/public/feedback")
      .send({ qrToken: QR_TOKEN, tipo: "RECLAMACAO", avaliacoes: [{ categoriaId: cenario.categorias[0].id, estrelas: 1 }] });

    expect(res.status).toBe(201);
    liberar();
    await esperarAvisosPendentes();
  });

  it("falha no provedor não desfaz o feedback nem a notificação, e vai para o log sem conteúdo", async () => {
    usarProvedorDeEmail({ nome: "Quebrado", enviar: async () => Promise.reject(new Error("Resend respondeu 500")) });
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const gerente = await criarUsuario(Papel.GERENTE);

    const { id } = await enviarFeedback(cenario);

    expect(await prisma.feedback.count({ where: { id } })).toBe(1);
    expect(await prisma.notification.count({ where: { feedbackId: id, usuarioId: gerente.id } })).toBe(1);
    expect(erroNoLog).toHaveBeenCalledWith("Aviso por e-mail não enviado:", "Resend respondeu 500");
  });

  it("com o envio desligado, o feedback segue normal e nada é enviado", async () => {
    usarProvedorDeEmail(null);
    await criarUsuario(Papel.GERENTE);
    const { id } = await enviarFeedback(cenario);
    expect(await prisma.notification.count({ where: { feedbackId: id } })).toBe(1);
  });
});

describe("texto do aviso", () => {
  const base = {
    id: "f1",
    tipo: "ELOGIO" as const,
    // 17:32 em UTC é 14:32 em Brasília.
    criadoEm: new Date("2026-10-25T17:32:00Z"),
    area: { nome: "Salão" },
    avaliacoes: [
      { estrelas: 5, category: { nome: "Alimento" } },
      { estrelas: 4, category: { nome: "Atendimento" } },
    ],
  };

  it("hora no fuso do restaurante, concordância do tipo e as notas em ordem", () => {
    const aviso = montarAviso(base);
    expect(aviso.assunto).toBe("Elogio novo · Salão");
    expect(aviso.texto).toContain("Chegou um elogio: Salão, 25/10/2026 às 14:32.");
    expect(aviso.texto).toContain("Notas: Alimento 5 de 5, Atendimento 4 de 5.");
  });

  it("nome de área com HTML ou quebra de linha não vira marcação nem quebra o assunto", () => {
    const aviso = montarAviso({ ...base, area: { nome: '<b>Mesa\n"7"</b> & cia' } });
    expect(aviso.assunto).toBe('Elogio novo · <b>Mesa "7"</b> & cia');
    expect(aviso.html).toContain("&lt;b&gt;Mesa &quot;7&quot;&lt;/b&gt; &amp; cia");
    expect(aviso.html).not.toContain("<b>Mesa");
  });

  it("WEB_BASE_URL com barra no fim não dobra a barra do link", () => {
    const antes = process.env.WEB_BASE_URL;
    process.env.WEB_BASE_URL = "https://echo.exemplo.com/";
    try {
      expect(montarAviso(base).texto).toContain("https://echo.exemplo.com/coordenador/ocorrencia/f1");
    } finally {
      process.env.WEB_BASE_URL = antes;
    }
  });
});

describe("preferência de aviso por e-mail", () => {
  it("cada um vê a própria; o padrão é só reclamações, e diz se o envio está ligado", async () => {
    const { token } = await autenticar(Papel.COORDENADOR);

    const desligado = await request(app).get("/api/notifications/preferencias").set(comToken(token));
    expect(desligado.status).toBe(200);
    expect(desligado.body).toEqual({
      avisoPorEmail: "RECLAMACOES",
      email: "coordenador@teste.com",
      envioLigado: false,
      modoDeTeste: false,
    });

    provedorFalso();
    process.env.EMAIL_DESTINO_TESTE = "lucas@exemplo.com";
    const ligado = await request(app).get("/api/notifications/preferencias").set(comToken(token));
    expect(ligado.body).toMatchObject({ envioLigado: true, modoDeTeste: true });
  });

  it("muda só a de quem está logado e registra no log, de onde para onde", async () => {
    const { usuario, token } = await autenticar(Papel.GERENTE);
    const outro = await criarUsuario(Papel.COORDENADOR);

    const res = await request(app)
      .patch("/api/notifications/preferencias")
      .set(comToken(token))
      .send({ avisoPorEmail: "TODOS" });

    expect(res.status).toBe(200);
    expect(res.body.avisoPorEmail).toBe("TODOS");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: outro.id } })).avisoPorEmail).toBe("RECLAMACOES");

    const log = await prisma.auditLog.findMany({ where: { acao: "AVISO_POR_EMAIL_ALTERADO" } });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      usuarioId: usuario.id,
      entidade: "User",
      entidadeId: usuario.id,
      detalhes: { de: "RECLAMACOES", para: "TODOS" },
    });
  });

  it("salvar o mesmo valor não vai para o log", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    await request(app).patch("/api/notifications/preferencias").set(comToken(token)).send({ avisoPorEmail: "RECLAMACOES" });
    expect(await prisma.auditLog.count({ where: { acao: "AVISO_POR_EMAIL_ALTERADO" } })).toBe(0);
  });

  it.each([undefined, "", "todos", 3, null])("valor inválido (%s) é recusado", async (valor) => {
    const { token } = await autenticar(Papel.GERENTE);
    const res = await request(app).patch("/api/notifications/preferencias").set(comToken(token)).send({ avisoPorEmail: valor });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
  });

  it("sem login, 401", async () => {
    const get = await request(app).get("/api/notifications/preferencias");
    const patch = await request(app).patch("/api/notifications/preferencias").send({ avisoPorEmail: "TODOS" });
    expect(get.status).toBe(401);
    expect(patch.status).toBe(401);
  });
});
