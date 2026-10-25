import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { provedorResend, usarProvedorDeEmail, type Email } from "../src/email.js";
import { montarResposta } from "../src/respostas.js";
import { aplicarRetencao, apagarDadosDoTitular, previaDaRetencao } from "../src/retencao.js";
import { autenticar, criarCenarioCliente } from "./helpers.js";

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });
const DIA = 24 * 60 * 60 * 1000;

function provedorFalso() {
  const enviados: Email[] = [];
  usarProvedorDeEmail({ nome: "Falso", enviar: async (emails) => void enviados.push(...emails) });
  return enviados;
}

// Feedback de quem pediu resposta, gravado direto: o fluxo do cliente já tem os testes dele.
function feedbackComContato(cenario: Cenario, dados: Record<string, unknown> = {}) {
  return prisma.feedback.create({
    data: {
      venueId: cenario.venue.id,
      areaId: cenario.area.id,
      tipo: "RECLAMACAO",
      comentario: "Demorou muito.",
      anonimo: false,
      contatoNome: "Mariana",
      contatoEmail: "mariana@cliente.com",
      ...dados,
    },
  });
}

function responder(id: string, token: string, texto: unknown) {
  return request(app).post(`/api/occurrences/${id}/respostas`).set(comToken(token)).send({ texto });
}

afterEach(() => {
  delete process.env.EMAIL_DESTINO_TESTE;
  vi.restoreAllMocks();
});

describe("responder ao cliente pelo Echo", () => {
  let cenario: Cenario;
  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  it("envia ao e-mail do cliente, com resposta para quem escreveu, e guarda o que foi dito", async () => {
    const enviados = provedorFalso();
    const { usuario, token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);

    const res = await responder(feedback.id, token, "Olá, Mariana!\n\nPedimos desculpas pela demora.");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      texto: "Olá, Mariana!\n\nPedimos desculpas pela demora.",
      textoApagadoEm: null,
      autor: { nome: usuario.nome },
    });

    expect(enviados).toHaveLength(1);
    const [email] = enviados;
    expect(email.para).toBe("mariana@cliente.com");
    expect(email.responderPara).toBe(usuario.email);
    expect(email.assunto).toBe("Resposta do Restaurante Teste sobre a sua avaliação");
    expect(email.texto).toContain("Pedimos desculpas pela demora.");
    expect(email.texto).toContain(`— ${usuario.nome}, da equipe do Restaurante Teste`);
    expect(email.texto).toContain("http://localhost:5173/privacidade");

    expect(await prisma.resposta.count({ where: { feedbackId: feedback.id, autorId: usuario.id } })).toBe(1);
  });

  it("vai para o log sem o texto nem o e-mail do cliente", async () => {
    provedorFalso();
    const { usuario, token } = await autenticar(Papel.COORDENADOR);
    const feedback = await feedbackComContato(cenario);

    await responder(feedback.id, token, "Olá, Mariana!");

    const registro = await prisma.auditLog.findFirstOrThrow({ where: { acao: "RESPOSTA_ENVIADA" } });
    expect(registro).toMatchObject({
      usuarioId: usuario.id,
      entidade: "Feedback",
      entidadeId: feedback.id,
      detalhes: { area: "Mesa 1" },
    });
    expect(JSON.stringify(registro.detalhes)).not.toMatch(/Mariana|cliente\.com/);
  });

  it("o detalhe traz as respostas em ordem e se o envio está ligado; a lista, só se foi respondida", async () => {
    provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const respondida = await feedbackComContato(cenario);
    const semResposta = await feedbackComContato(cenario, { criadoEm: new Date(Date.now() - DIA) });

    await responder(respondida.id, token, "Primeira");
    await responder(respondida.id, token, "Segunda");

    const detalhe = await request(app).get(`/api/occurrences/${respondida.id}`).set(comToken(token));
    expect(detalhe.body.envioDeEmail).toBe("ligado");
    expect(detalhe.body.respondida).toBe(true);
    expect(detalhe.body.respostas.map((r: { texto: string }) => r.texto)).toEqual(["Primeira", "Segunda"]);
    expect(detalhe.body).not.toHaveProperty("_count");

    const lista = await request(app).get("/api/occurrences").set(comToken(token));
    const porId = Object.fromEntries(lista.body.itens.map((i: { id: string; respondida: boolean }) => [i.id, i]));
    expect(porId[respondida.id].respondida).toBe(true);
    expect(porId[semResposta.id].respondida).toBe(false);
    // A lista não traz o texto das respostas, nem o contato.
    expect(porId[respondida.id]).not.toHaveProperty("respostas");
    expect(porId[respondida.id]).not.toHaveProperty("contato");
  });

  it("estado do envio no detalhe: desligado e em teste", async () => {
    const { token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);

    usarProvedorDeEmail(null);
    const desligado = await request(app).get(`/api/occurrences/${feedback.id}`).set(comToken(token));
    expect(desligado.body.envioDeEmail).toBe("desligado");

    provedorFalso();
    process.env.EMAIL_DESTINO_TESTE = "lucas@exemplo.com";
    const teste = await request(app).get(`/api/occurrences/${feedback.id}`).set(comToken(token));
    expect(teste.body.envioDeEmail).toBe("teste");
  });

  it("quebra de linha do Windows (\\r\\n) vira \\n, e espaço nas pontas sai", async () => {
    const enviados = provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);

    const res = await responder(feedback.id, token, "  Olá!\r\n\r\nObrigado.  ");

    expect(res.body.texto).toBe("Olá!\n\nObrigado.");
    expect(enviados[0].texto.startsWith("Olá!\n\nObrigado.")).toBe(true);
  });

  it.each([
    ["vazio", ""],
    ["só espaços", "   \n  "],
    ["número", 42],
    ["sem o campo", undefined],
    ["longo demais", "x".repeat(2001)],
  ])("texto inválido (%s): 400, e nada sai", async (_nome, texto) => {
    const enviados = provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);

    const res = await responder(feedback.id, token, texto);

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("VALIDACAO");
    expect(enviados).toHaveLength(0);
  });

  it("2000 caracteres é o limite, e passa", async () => {
    provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);
    expect((await responder(feedback.id, token, "x".repeat(2000))).status).toBe(201);
  });

  it("anônimo, ou com o contato já apagado pela retenção: 409, e nada sai", async () => {
    const enviados = provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const anonimo = await feedbackComContato(cenario, { anonimo: true, contatoNome: null, contatoEmail: null });
    const apagado = await feedbackComContato(cenario, {
      contatoNome: null,
      contatoEmail: null,
      contatoApagadoEm: new Date(),
    });

    for (const feedback of [anonimo, apagado]) {
      const res = await responder(feedback.id, token, "Olá!");
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe("SEM_CONTATO");
    }
    expect(enviados).toHaveLength(0);
    expect(await prisma.resposta.count()).toBe(0);
  });

  it("com o envio desligado: 503, e nada é gravado", async () => {
    usarProvedorDeEmail(null);
    const { token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);

    const res = await responder(feedback.id, token, "Olá!");

    expect(res.status).toBe(503);
    expect(res.body.codigo).toBe("EMAIL_DESLIGADO");
    expect(await prisma.resposta.count()).toBe(0);
  });

  it("provedor recusou: 502, nada gravado nem no log, e o erro do servidor sem texto nem e-mail", async () => {
    usarProvedorDeEmail({ nome: "Quebrado", enviar: () => Promise.reject(new Error("Resend respondeu 500")) });
    const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);

    const res = await responder(feedback.id, token, "Olá, Mariana!");

    expect(res.status).toBe(502);
    expect(res.body.codigo).toBe("EMAIL_NAO_ENVIADO");
    expect(await prisma.resposta.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { acao: "RESPOSTA_ENVIADA" } })).toBe(0);
    expect(erroNoLog).toHaveBeenCalledWith("Resposta ao cliente não enviada:", "Resend respondeu 500");
  });

  it("ocorrência inexistente: 404; sem login: 401", async () => {
    provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const inexistente = await responder("00000000-0000-0000-0000-000000000000", token, "Olá!");
    expect(inexistente.status).toBe(404);

    const feedback = await feedbackComContato(cenario);
    const semLogin = await request(app).post(`/api/occurrences/${feedback.id}/respostas`).send({ texto: "Olá!" });
    expect(semLogin.status).toBe(401);
  });

  it("em teste: vai para o endereço de teste, sem o 'responder para' (seria um e-mail fictício)", async () => {
    const enviados = provedorFalso();
    process.env.EMAIL_DESTINO_TESTE = "lucas@exemplo.com";
    const { usuario, token } = await autenticar(Papel.GERENTE);
    const feedback = await feedbackComContato(cenario);

    await responder(feedback.id, token, "Olá!");

    expect(enviados[0].para).toBe("lucas@exemplo.com");
    expect(enviados[0].responderPara).toBeUndefined();
    expect(enviados[0].texto).toContain(
      `em produção, este e-mail iria para mariana@cliente.com. Quem respondesse falaria com ${usuario.email}.`
    );
  });
});

describe("texto do e-mail de resposta", () => {
  const base = {
    para: "ana@cliente.com",
    autor: { nome: "Gerente Sinuelo", email: "gerente@sinuelo.com" },
    restaurante: "Restaurante Sinuelo",
    // 02:30 em UTC ainda é dia 24 em Brasília.
    avaliadoEm: new Date("2026-10-25T02:30:00Z"),
  };

  it("parágrafos e quebras de linha viram HTML, com o texto escapado", () => {
    const email = montarResposta({ ...base, texto: 'Olá, <b>Ana</b> & "cia"!\n\nLinha 1\nLinha 2' });
    expect(email.html).toContain("Olá, &lt;b&gt;Ana&lt;/b&gt; &amp; &quot;cia&quot;!</p>");
    expect(email.html).toContain("Linha 1<br>Linha 2</p>");
    expect(email.html).not.toContain("<b>Ana");
  });

  it("o rodapé diz por que a pessoa recebe, com a data da avaliação no fuso do restaurante", () => {
    const email = montarResposta({ ...base, texto: "Oi" });
    expect(email.texto).toContain(
      "Você recebe este e-mail porque pediu uma resposta ao avaliar o Restaurante Sinuelo em 24/10/2026."
    );
  });

  it("o Resend recebe o 'responder para' como reply_to", async () => {
    const buscar = vi.fn(async () => new Response("{}", { status: 200 }));
    await provedorResend("re_x", "Echo <a@b.dev>", buscar as unknown as typeof fetch).enviar([
      montarResposta({ ...base, texto: "Oi" }),
    ]);
    const corpo = JSON.parse((buscar.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(corpo[0].reply_to).toEqual(["gerente@sinuelo.com"]);
    expect(corpo[0].to).toEqual(["ana@cliente.com"]);
  });
});

describe("retenção das respostas (LGPD)", () => {
  let cenario: Cenario;
  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  async function respostaEm(diasAtras: number, email = "mariana@cliente.com") {
    const { usuario } = await autenticar(Papel.GERENTE, `g${diasAtras}${email.length}@teste.com`);
    const feedback = await feedbackComContato(cenario, {
      contatoEmail: email,
      criadoEm: new Date(Date.now() - diasAtras * DIA),
    });
    return prisma.resposta.create({ data: { feedbackId: feedback.id, autorId: usuario.id, texto: "Olá, Mariana!" } });
  }

  it("o texto sai junto com o contato (90 dias da avaliação); o registro de que houve resposta fica", async () => {
    const vencida = await respostaEm(91);
    const recente = await respostaEm(10);

    expect(await previaDaRetencao()).toMatchObject({ respostas: 1 });
    const resultado = await aplicarRetencao({ usuarioId: null });

    expect(resultado.respostas).toBe(1);
    const depois = await prisma.resposta.findUniqueOrThrow({ where: { id: vencida.id } });
    expect(depois.texto).toBeNull();
    expect(depois.textoApagadoEm).not.toBeNull();
    expect((await prisma.resposta.findUniqueOrThrow({ where: { id: recente.id } })).texto).toBe("Olá, Mariana!");

    // Idempotente: a segunda rodada não conta de novo.
    expect((await aplicarRetencao({ usuarioId: null })).respostas).toBe(0);
  });

  it("pedido do cliente: apaga o texto das respostas dele, e só dele", async () => {
    const dele = await respostaEm(5, "Mariana@Cliente.com");
    const deOutro = await respostaEm(5, "outra@cliente.com");
    const { usuario } = await autenticar(Papel.ADMINISTRADOR);

    await apagarDadosDoTitular({ email: "mariana@cliente.com", usuarioId: usuario.id });

    expect((await prisma.resposta.findUniqueOrThrow({ where: { id: dele.id } })).texto).toBeNull();
    expect((await prisma.resposta.findUniqueOrThrow({ where: { id: deOutro.id } })).texto).toBe("Olá, Mariana!");
  });

  it("o detalhe mostra a resposta apagada como apagada, com quem respondeu", async () => {
    const vencida = await respostaEm(91);
    await aplicarRetencao({ usuarioId: null });
    const { token } = await autenticar(Papel.COORDENADOR);

    const res = await request(app).get(`/api/occurrences/${vencida.feedbackId}`).set(comToken(token));

    expect(res.body.respostas).toHaveLength(1);
    expect(res.body.respostas[0]).toMatchObject({ texto: null, autor: { nome: "Usuário GERENTE" } });
    expect(res.body.respostas[0].textoApagadoEm).not.toBeNull();
  });
});
