import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { usarProvedorDeEmail, type Email } from "../src/email.js";
import { avisarEquipePorEmail, esperarAvisosPendentes, TETO_DE_AVISOS_POR_HORA } from "../src/avisos.js";
import { descreverEspera, zerarLimites } from "../src/limites.js";
import { autenticar, criarCenarioCliente, criarUsuario, QR_TOKEN, SENHA_TESTE } from "./helpers.js";

// Limites do login, das rotas públicas e dos e-mails. Ver docs/PROXIMOS-PASSOS.md, seção 8.
// O da imagem do QR tem o arquivo dele (qrcodes-limite.test.ts).

type Cenario = Awaited<ReturnType<typeof criarCenarioCliente>>;

const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });
const trustProxyDaApi = app.get("trust proxy");

// Atrás de um proxy, como no Render: cada pedido diz de que IP veio.
const deIp = (ip: string) => ({ "X-Forwarded-For": ip });

function entrar(email: string, senha: string, ip?: string) {
  const pedido = request(app).post("/api/auth/login");
  if (ip) pedido.set(deIp(ip));
  return pedido.send({ email, senha });
}

function provedorFalso() {
  const enviados: Email[] = [];
  const enviar = vi.fn(async (emails: Email[]) => void enviados.push(...emails));
  usarProvedorDeEmail({ nome: "Falso", enviar });
  return { enviados, enviar };
}

afterEach(() => {
  vi.restoreAllMocks();
  app.set("trust proxy", trustProxyDaApi);
});

describe("quanto esperar, por extenso", () => {
  it.each([
    [1, "1 segundo"],
    [40, "40 segundos"],
    [59, "59 segundos"],
    [60, "1 minuto"],
    [61, "2 minutos"],
    [900, "15 minutos"],
    [3600, "60 minutos"],
  ])("%i s → %s", (segundos, texto) => {
    expect(descreverEspera(segundos)).toBe(texto);
  });
});

describe("login: 10 tentativas por IP a cada 15 minutos", () => {
  beforeEach(async () => {
    await criarUsuario(Papel.GERENTE, "gerente@teste.com");
  });

  it("certas e erradas contam; a 11ª recebe 429 dizendo quanto esperar, sem nem conferir a senha", async () => {
    // E-mails diferentes, para o limite por e-mail (5 falhas) não chegar antes.
    for (let i = 0; i < 5; i++) expect((await entrar(`ninguem${i}@teste.com`, "errada")).status).toBe(401);
    for (let i = 0; i < 5; i++) expect((await entrar("gerente@teste.com", SENHA_TESTE)).status).toBe(200);

    const res = await entrar("gerente@teste.com", SENHA_TESTE);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      erro: "Muitas tentativas de entrar. Tente de novo em 15 minutos.",
      codigo: "MUITAS_REQUISICOES",
    });
    expect(res.body.tenteEmSegundos).toBeGreaterThan(14 * 60);
    expect(res.body.tenteEmSegundos).toBeLessThanOrEqual(15 * 60);
    expect(res.body.token).toBeUndefined();
  });

  it("é por IP: outro cliente, atrás do mesmo proxy, continua entrando", async () => {
    app.set("trust proxy", 1);
    for (let i = 0; i < 10; i++) await entrar(`ninguem${i % 4}@teste.com`, "errada", "203.0.113.10");
    expect((await entrar("gerente@teste.com", SENHA_TESTE, "203.0.113.10")).status).toBe(429);
    expect((await entrar("gerente@teste.com", SENHA_TESTE, "198.51.100.20")).status).toBe(200);
  });

  it("não afeta o resto da API", async () => {
    for (let i = 0; i < 11; i++) await entrar(`ninguem${i % 4}@teste.com`, "errada");
    expect((await request(app).get("/api/health")).status).toBe(200);
  });
});

describe("login: 5 senhas erradas por e-mail a cada 15 minutos", () => {
  beforeEach(async () => {
    app.set("trust proxy", 1);
    await criarUsuario(Papel.ADMINISTRADOR, "admin@teste.com");
    await criarUsuario(Papel.GERENTE, "gerente@teste.com");
  });

  it("vale de qualquer IP: trocar de rede não ganha mais tentativas, e nem a senha certa entra", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await entrar("admin@teste.com", "errada", `10.0.0.${i}`)).status).toBe(401);
    }

    const certa = await entrar("admin@teste.com", SENHA_TESTE, "10.0.0.99");

    expect(certa.status).toBe(429);
    expect(certa.body.erro).toBe("Muitas tentativas de entrar. Tente de novo em 15 minutos.");
    expect(certa.body.token).toBeUndefined();
  });

  it("maiúsculas e espaços não fazem outro e-mail", async () => {
    const variantes = ["admin@teste.com", "ADMIN@teste.com", " admin@teste.com", "Admin@Teste.com ", "admin@TESTE.COM"];
    for (const [i, email] of variantes.entries()) await entrar(email, "errada", `10.0.0.${i}`);
    expect((await entrar("admin@teste.com", SENHA_TESTE, "10.0.0.99")).status).toBe(429);
  });

  it("entrar com a senha certa não gasta tentativa", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await entrar("admin@teste.com", SENHA_TESTE, `10.0.1.${i}`)).status).toBe(200);
    }
    for (let i = 0; i < 4; i++) await entrar("admin@teste.com", "errada", `10.0.2.${i}`);
    expect((await entrar("admin@teste.com", SENHA_TESTE, "10.0.3.1")).status).toBe(200);
  });

  it("errar a senha de uma conta não tranca a outra", async () => {
    for (let i = 0; i < 6; i++) await entrar("admin@teste.com", "errada", `10.0.0.${i}`);
    expect((await entrar("gerente@teste.com", SENHA_TESTE, "10.0.0.99")).status).toBe(200);
  });

  it("e-mail inexistente também conta (a resposta não pode dizer quem tem cadastro)", async () => {
    for (let i = 0; i < 5; i++) await entrar("ninguem@teste.com", "errada", `10.0.0.${i}`);
    const res = await entrar("ninguem@teste.com", "errada", "10.0.0.99");
    expect(res.status).toBe(429);
    expect(res.body.erro).toBe("Muitas tentativas de entrar. Tente de novo em 15 minutos.");
  });

  it("pedido sem e-mail não entra na conta de ninguém", async () => {
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post("/api/auth/login").set(deIp(`10.0.0.${i}`)).send({ senha: "x" });
      expect(res.status).toBe(400);
    }
    expect((await entrar("admin@teste.com", SENHA_TESTE, "10.0.0.99")).status).toBe(200);
  });

  it("passada a janela, volta a entrar", async () => {
    for (let i = 0; i < 5; i++) await entrar("admin@teste.com", "errada", `10.0.0.${i}`);
    expect((await entrar("admin@teste.com", SENHA_TESTE, "10.0.0.99")).status).toBe(429);
    zerarLimites();
    expect((await entrar("admin@teste.com", SENHA_TESTE, "10.0.0.99")).status).toBe(200);
  });
});

describe("rotas públicas", () => {
  let cenario: Cenario;
  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  const feedback = (cenario: Cenario) => ({
    qrToken: QR_TOKEN,
    tipo: "ELOGIO",
    avaliacoes: [{ categoriaId: cenario.categorias[0].id, estrelas: 5 }],
  });

  it("feedback: 20 a cada 10 minutos por IP; o 21º recebe 429 e não grava nada", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await request(app).post("/api/public/feedback").send(feedback(cenario))).status).toBe(201);
    }

    const res = await request(app).post("/api/public/feedback").send(feedback(cenario));

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      erro: "Muitas avaliações enviadas desta rede em pouco tempo. Tente de novo em 10 minutos.",
      codigo: "MUITAS_REQUISICOES",
    });
    expect(await prisma.feedback.count()).toBe(20);
    await esperarAvisosPendentes();
  });

  it("feedback: é por IP, outra rede continua enviando", async () => {
    app.set("trust proxy", 1);
    for (let i = 0; i < 20; i++) {
      await request(app).post("/api/public/feedback").set(deIp("203.0.113.10")).send(feedback(cenario));
    }
    const mesma = await request(app).post("/api/public/feedback").set(deIp("203.0.113.10")).send(feedback(cenario));
    const outra = await request(app).post("/api/public/feedback").set(deIp("198.51.100.20")).send(feedback(cenario));
    expect(mesma.status).toBe(429);
    expect(outra.status).toBe(201);
    await esperarAvisosPendentes();
  });

  it("formulário: 60 aberturas por minuto por IP, contando código inexistente", async () => {
    for (let i = 0; i < 30; i++) expect((await request(app).get(`/api/public/venue/${QR_TOKEN}`)).status).toBe(200);
    for (let i = 0; i < 30; i++) expect((await request(app).get(`/api/public/venue/CHUTE${i}`)).status).toBe(404);

    const res = await request(app).get(`/api/public/venue/${QR_TOKEN}`);

    expect(res.status).toBe(429);
    expect(res.body.erro).toBe("Muitos acessos seguidos desta rede. Tente de novo em 1 minuto.");
  });

  it("formulário e feedback contam separados: abrir muito não impede enviar", async () => {
    for (let i = 0; i < 61; i++) await request(app).get(`/api/public/venue/${QR_TOKEN}`);
    expect((await request(app).post("/api/public/feedback").send(feedback(cenario))).status).toBe(201);
    await esperarAvisosPendentes();
  });
});

describe("resposta ao cliente: 20 por hora por pessoa", () => {
  let cenario: Cenario;
  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  async function feedbackComContato() {
    return prisma.feedback.create({
      data: {
        venueId: cenario.venue.id,
        areaId: cenario.area.id,
        tipo: "RECLAMACAO",
        anonimo: false,
        contatoNome: "Mariana",
        contatoEmail: "mariana@cliente.com",
      },
    });
  }

  const responder = (id: string, token: string, texto: unknown = "Olá, Mariana!") =>
    request(app).post(`/api/occurrences/${id}/respostas`).set(comToken(token)).send({ texto });

  it("a 21ª resposta da mesma pessoa recebe 429 e não sai", async () => {
    const { enviar } = provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const { id } = await feedbackComContato();

    for (let i = 0; i < 20; i++) expect((await responder(id, token)).status).toBe(201);
    const res = await responder(id, token);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      erro: "Você enviou muitas respostas na última hora. Tente de novo em 60 minutos.",
      codigo: "MUITAS_REQUISICOES",
    });
    expect(enviar).toHaveBeenCalledTimes(20);
    expect(await prisma.resposta.count()).toBe(20);
  });

  it("é por pessoa: outra pessoa da equipe continua respondendo, mesmo do mesmo IP", async () => {
    provedorFalso();
    const gerente = await autenticar(Papel.GERENTE);
    const coordenador = await autenticar(Papel.COORDENADOR);
    const { id } = await feedbackComContato();

    for (let i = 0; i < 20; i++) await responder(id, gerente.token);

    expect((await responder(id, gerente.token)).status).toBe(429);
    expect((await responder(id, coordenador.token)).status).toBe(201);
  });

  it("o que não saiu não gasta: texto vazio, sem contato, inexistente, falha do provedor e envio desligado", async () => {
    const enviar = vi.fn().mockRejectedValueOnce(new Error("Resend respondeu 500")).mockResolvedValue(undefined);
    usarProvedorDeEmail({ nome: "Falso", enviar });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { token } = await autenticar(Papel.GERENTE);
    const { id } = await feedbackComContato();
    const anonimo = await prisma.feedback.create({
      data: { venueId: cenario.venue.id, areaId: cenario.area.id, tipo: "RECLAMACAO", anonimo: true },
    });

    for (let i = 0; i < 10; i++) expect((await responder(id, token, "")).status).toBe(400);
    for (let i = 0; i < 10; i++) expect((await responder(anonimo.id, token)).status).toBe(409);
    for (let i = 0; i < 5; i++) expect((await responder("nao-existe", token)).status).toBe(404);
    expect((await responder(id, token)).status).toBe(502);
    usarProvedorDeEmail(null);
    for (let i = 0; i < 5; i++) expect((await responder(id, token)).status).toBe(503);
    usarProvedorDeEmail({ nome: "Falso", enviar });

    // Nada disso contou: as 20 ainda estão todas disponíveis.
    for (let i = 0; i < 20; i++) expect((await responder(id, token)).status).toBe(201);
    expect((await responder(id, token)).status).toBe(429);
  });

  it("cortar a conexão no meio do envio não devolve a vez: o e-mail saiu, então conta", async () => {
    // Provedor lento: o cliente desiste antes da resposta, mas o e-mail sai mesmo assim.
    let enviados = 0;
    usarProvedorDeEmail({
      nome: "Lento",
      enviar: async () => {
        await new Promise((pronto) => setTimeout(pronto, 150));
        enviados++;
      },
    });
    const { token } = await autenticar(Papel.GERENTE);
    const { id } = await feedbackComContato();

    for (let i = 0; i < 25; i++) {
      await responder(id, token)
        .timeout(30)
        .catch(() => {});
    }
    // Espera os envios que ficaram em andamento e mais um pouco, para pegar algum a mais.
    await vi.waitFor(() => expect(enviados).toBe(20), { timeout: 5000 });
    await new Promise((pronto) => setTimeout(pronto, 400));

    expect(enviados).toBe(20);
    expect((await responder(id, token)).status).toBe(429);
  });

  it("sem login, o 401 vem antes do limite e não conta para ninguém", async () => {
    provedorFalso();
    const { token } = await autenticar(Papel.GERENTE);
    const { id } = await feedbackComContato();

    for (let i = 0; i < 25; i++) {
      const res = await request(app).post(`/api/occurrences/${id}/respostas`).send({ texto: "Oi" });
      expect(res.status).toBe(401);
    }
    expect((await responder(id, token)).status).toBe(201);
  });
});

describe(`teto de ${TETO_DE_AVISOS_POR_HORA} e-mails de aviso por hora`, () => {
  let cenario: Cenario;
  beforeEach(async () => {
    cenario = await criarCenarioCliente();
  });

  const novoFeedback = () =>
    prisma.feedback.create({
      data: { venueId: cenario.venue.id, areaId: cenario.area.id, tipo: "RECLAMACAO", anonimo: true },
    });

  async function querTudo(email: string) {
    const usuario = await criarUsuario(Papel.GERENTE, email);
    await prisma.user.update({ where: { id: usuario.id }, data: { avisoPorEmail: "TODOS" } });
  }

  it("passado o teto, o aviso não sai por e-mail, e o log diz uma vez só", async () => {
    const { enviados } = provedorFalso();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await querTudo("ana@teste.com");
    const { id } = await novoFeedback();

    for (let i = 0; i < 30; i++) expect(await avisarEquipePorEmail(id)).toBe(1);
    expect(await avisarEquipePorEmail(id)).toBe(0);
    expect(await avisarEquipePorEmail(id)).toBe(0);

    expect(enviados).toHaveLength(30);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith(
      "Avisos por e-mail pausados: 30 na última hora. O sino continua avisando."
    );
  });

  it("conta destinatários, não feedbacks; e sai para todos ou para ninguém", async () => {
    const { enviados } = provedorFalso();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await querTudo("ana@teste.com");
    const { id } = await novoFeedback();
    for (let i = 0; i < 28; i++) await avisarEquipePorEmail(id);

    // Sobram 2 lugares, e agora são 3 pessoas: ninguém recebe, nem as duas primeiras.
    await querTudo("bruno@teste.com");
    await querTudo("carla@teste.com");
    expect(await avisarEquipePorEmail(id)).toBe(0);
    expect(enviados).toHaveLength(28);

    // Com 2 pessoas, cabe: saem os dois, e o teto fecha em 30.
    await prisma.user.updateMany({ where: { email: "carla@teste.com" }, data: { avisoPorEmail: "NENHUM" } });
    expect(await avisarEquipePorEmail(id)).toBe(2);
    expect(await avisarEquipePorEmail(id)).toBe(0);
    expect(enviados).toHaveLength(30);
  });

  it("muitos feedbacks ao mesmo tempo não passam do teto", async () => {
    const { enviados } = provedorFalso();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await querTudo("ana@teste.com");
    const { id } = await novoFeedback();

    const saidas = await Promise.all(Array.from({ length: 40 }, () => avisarEquipePorEmail(id)));

    expect(saidas.filter((n) => n === 1)).toHaveLength(30);
    expect(enviados).toHaveLength(30);
  });

  it("uma hora depois do primeiro, abre lugar de novo", async () => {
    const { enviados } = provedorFalso();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await querTudo("ana@teste.com");
    const { id } = await novoFeedback();
    const inicio = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(inicio);
    await avisarEquipePorEmail(id);
    vi.spyOn(Date, "now").mockReturnValue(inicio + 30 * 60 * 1000);
    for (let i = 0; i < 29; i++) await avisarEquipePorEmail(id);
    expect(await avisarEquipePorEmail(id)).toBe(0);

    // Uma hora depois do primeiro: só ele saiu da conta, abre um lugar.
    vi.spyOn(Date, "now").mockReturnValue(inicio + 60 * 60 * 1000);
    expect(await avisarEquipePorEmail(id)).toBe(1);
    expect(await avisarEquipePorEmail(id)).toBe(0);
    expect(enviados).toHaveLength(31);
  });

  it("falha do provedor gasta o lugar (ele pode ter mandado parte)", async () => {
    usarProvedorDeEmail({ nome: "Falso", enviar: vi.fn().mockRejectedValue(new Error("Resend respondeu 500")) });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await querTudo("ana@teste.com");
    const { id } = await novoFeedback();

    for (let i = 0; i < 30; i++) await expect(avisarEquipePorEmail(id)).rejects.toThrow();
    const { enviados } = provedorFalso();
    expect(await avisarEquipePorEmail(id)).toBe(0);
    expect(enviados).toHaveLength(0);
  });

  it("com o teto cheio, o feedback do cliente é gravado e o sino avisa igual", async () => {
    const { enviados } = provedorFalso();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await querTudo("ana@teste.com");
    const { id } = await novoFeedback();
    for (let i = 0; i < 30; i++) await avisarEquipePorEmail(id);

    const res = await request(app).post("/api/public/feedback").send({
      qrToken: QR_TOKEN,
      tipo: "RECLAMACAO",
      avaliacoes: [{ categoriaId: cenario.categorias[0].id, estrelas: 1 }],
    });
    await esperarAvisosPendentes();

    expect(res.status).toBe(201);
    expect(await prisma.notification.count({ where: { feedbackId: res.body.id } })).toBe(1);
    expect(enviados).toHaveLength(30);
  });
});
