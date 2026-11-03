import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import QRCode from "qrcode";
import { app, lerTrustProxy } from "../src/app.js";
import { prisma } from "../src/prisma.js";
import { zerarLimites } from "../src/limites.js";
import { criarCenarioCliente, QR_TOKEN } from "./helpers.js";

// A imagem do QR é pública e cara de gerar (ocupa o processador da API inteira). Cache
// para não gerar a mesma duas vezes, e limite por IP para clique em série e script.
// Ver docs/PROXIMOS-PASSOS.md, seção 8.

const imagem = (query = "?formato=png&tamanho=400") => `/api/qrcodes/${QR_TOKEN}/imagem${query}`;

// O valor que a API montou ao carregar (sem TRUST_PROXY nos testes), para os casos que
// ligam o proxy devolverem a ela depois.
const trustProxyDaApi = app.get("trust proxy");

beforeEach(async () => {
  await criarCenarioCliente();
});

afterEach(() => {
  vi.restoreAllMocks();
  app.set("trust proxy", trustProxyDaApi);
  delete process.env.TRUST_PROXY;
});

describe("limite por IP na imagem do QR", () => {
  it("60 por minuto passam; o 61º recebe 429, com quanto esperar no corpo e no Retry-After", async () => {
    for (let i = 1; i <= 60; i++) {
      const res = await request(app).get(imagem());
      expect(res.status).toBe(200);
      expect(res.headers["ratelimit-remaining"]).toBe(String(60 - i));
    }

    const res = await request(app).get(imagem());

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      erro: "Muitos downloads seguidos. Espere um minuto e tente de novo.",
      codigo: "MUITAS_REQUISICOES",
    });
    expect(res.body.tenteEmSegundos).toBeGreaterThanOrEqual(1);
    expect(res.body.tenteEmSegundos).toBeLessThanOrEqual(60);
    expect(Number(res.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("pedidos inválidos e de código inexistente também contam (dificulta testar códigos)", async () => {
    for (let i = 0; i < 30; i++) await request(app).get(imagem("?formato=gif"));
    for (let i = 0; i < 30; i++) await request(app).get("/api/qrcodes/NAO-EXISTE/imagem");
    expect((await request(app).get(imagem())).status).toBe(429);
  });

  it("sem TRUST_PROXY, o X-Forwarded-For é ignorado: trocar o cabeçalho não zera a conta", async () => {
    for (let i = 0; i < 60; i++) {
      await request(app).get(imagem()).set("X-Forwarded-For", `10.0.0.${i}`);
    }
    const res = await request(app).get(imagem()).set("X-Forwarded-For", "10.9.9.9");
    expect(res.status).toBe(429);
  });

  it("é por IP: atrás do proxy, cada cliente tem a própria conta", async () => {
    app.set("trust proxy", 1);
    for (let i = 0; i < 60; i++) {
      await request(app).get(imagem()).set("X-Forwarded-For", "203.0.113.10");
    }
    expect((await request(app).get(imagem()).set("X-Forwarded-For", "203.0.113.10")).status).toBe(429);
    expect((await request(app).get(imagem()).set("X-Forwarded-For", "198.51.100.20")).status).toBe(200);
  });

  it("com um proxy só, IP inventado pelo cliente no começo do cabeçalho não zera a conta", async () => {
    app.set("trust proxy", 1);
    // O proxy acrescenta o IP real no fim; o que o cliente mandou fica antes e é ignorado.
    for (let i = 0; i < 60; i++) {
      await request(app).get(imagem()).set("X-Forwarded-For", `10.0.0.${i}, 203.0.113.10`);
    }
    const res = await request(app).get(imagem()).set("X-Forwarded-For", "10.9.9.9, 203.0.113.10");
    expect(res.status).toBe(429);
  });

  it("zera depois da janela", async () => {
    for (let i = 0; i < 60; i++) await request(app).get(imagem());
    expect((await request(app).get(imagem())).status).toBe(429);
    zerarLimites();
    expect((await request(app).get(imagem())).status).toBe(200);
  });

  it("não afeta as outras rotas", async () => {
    for (let i = 0; i < 61; i++) await request(app).get(imagem());
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get(`/api/public/venue/${QR_TOKEN}`)).status).toBe(200);
  });
});

describe("cache da imagem do QR", () => {
  it("a mesma imagem é gerada uma vez; o segundo pedido sai do cache, igual", async () => {
    const gerar = vi.spyOn(QRCode, "toBuffer");

    const primeira = await request(app).get(imagem()).buffer(true);
    const segunda = await request(app).get(imagem()).buffer(true);

    expect(gerar).toHaveBeenCalledTimes(1);
    expect(segunda.status).toBe(200);
    expect(Buffer.compare(primeira.body, segunda.body)).toBe(0);
    expect(segunda.headers["cache-control"]).toBe("private, max-age=300");
  });

  it("pedidos iguais ao mesmo tempo geram a imagem uma vez só", async () => {
    const gerar = vi.spyOn(QRCode, "toBuffer");
    const respostas = await Promise.all(Array.from({ length: 10 }, () => request(app).get(imagem())));
    expect(respostas.every((r) => r.status === 200)).toBe(true);
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("tamanhos diferentes são imagens diferentes; o SVG é um só, qualquer que seja o tamanho pedido", async () => {
    const png = vi.spyOn(QRCode, "toBuffer");
    const svg = vi.spyOn(QRCode, "toString");

    await request(app).get(imagem("?formato=png&tamanho=400"));
    await request(app).get(imagem("?formato=png&tamanho=800"));
    await request(app).get(imagem("?formato=svg"));
    await request(app).get(imagem("?formato=svg&tamanho=900"));

    expect(png).toHaveBeenCalledTimes(2);
    expect(svg).toHaveBeenCalledTimes(1);
  });

  it("QR desativado é recusado mesmo com a imagem no cache", async () => {
    expect((await request(app).get(imagem())).status).toBe(200);
    await prisma.qRCode.update({ where: { token: QR_TOKEN }, data: { ativo: false } });

    const res = await request(app).get(imagem());

    expect(res.status).toBe(404);
    expect(res.body.codigo).toBe("QR_NAO_ENCONTRADO");
  });

  it("falha ao gerar não fica no cache: o próximo pedido tenta de novo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const gerar = vi.spyOn(QRCode, "toBuffer").mockRejectedValueOnce(new Error("falhou"));

    expect((await request(app).get(imagem())).status).toBe(500);
    expect((await request(app).get(imagem())).status).toBe(200);
    expect(gerar).toHaveBeenCalledTimes(2);
  });

  it("tem teto de 200: sai a usada há mais tempo, e usar de novo renova o lugar", async () => {
    // 201 códigos ativos, um SVG de cada: o tamanho não serve para variar a chave (ele é
    // arredondado), então quem enche o cache são códigos diferentes.
    const { id: areaId } = await prisma.area.findFirstOrThrow({ select: { id: true } });
    const tokens = Array.from({ length: 201 }, (_, i) => `CACHE${i}`);
    await prisma.qRCode.createMany({ data: tokens.map((token) => ({ token, areaId })) });
    const gerar = vi.spyOn(QRCode, "toString");
    // O limite por IP é zerado no caminho: aqui o assunto é o cache.
    const pedir = async (token: string) => {
      zerarLimites();
      await request(app).get(`/api/qrcodes/${token}/imagem?formato=svg`);
    };

    // Enche o cache com os 200 primeiros. O CACHE0 é o mais antigo.
    for (const token of tokens.slice(0, 200)) await pedir(token);
    expect(gerar).toHaveBeenCalledTimes(200);

    // Usar o CACHE0 de novo o tira do fim da fila: o mais antigo passa a ser o CACHE1.
    await pedir("CACHE0");
    expect(gerar).toHaveBeenCalledTimes(200);

    // A 201ª imagem empurra para fora o CACHE1, não o CACHE0.
    await pedir("CACHE200");
    await pedir("CACHE0");
    expect(gerar).toHaveBeenCalledTimes(201);
    await pedir("CACHE1");
    expect(gerar).toHaveBeenCalledTimes(202);
  }, 60_000);

  it("o tamanho sobe para o múltiplo de 128 seguinte: variar o número não escapa do cache", async () => {
    const gerar = vi.spyOn(QRCode, "toBuffer");
    const largura = async (tamanho: number) => {
      const res = await request(app)
        .get(imagem(`?formato=png&tamanho=${tamanho}`))
        .buffer(true)
        .parse((resposta, pronto) => {
          const partes: Buffer[] = [];
          resposta.on("data", (parte: Buffer) => partes.push(parte));
          resposta.on("end", () => pronto(null, Buffer.concat(partes)));
        });
      // Largura no cabeçalho IHDR do PNG (bytes 16 a 19).
      return (res.body as Buffer).readUInt32BE(16);
    };

    expect(await largura(200)).toBe(256);
    expect(await largura(400)).toBe(512);
    expect(await largura(450)).toBe(512);
    expect(await largura(512)).toBe(512);
    expect(await largura(900)).toBe(1024);
    expect(await largura(1024)).toBe(1024);
    // 200 → 256, 400/450/512 → 512, 900/1024 → 1024: três imagens geradas.
    expect(gerar).toHaveBeenCalledTimes(3);

    // O pior caso de antes: todos os tamanhos de 200 a 1024 cabem em 7 imagens.
    zerarLimites();
    for (let tamanho = 200; tamanho <= 1024; tamanho += 17) {
      await request(app).get(imagem(`?formato=png&tamanho=${tamanho}`));
    }
    expect(gerar).toHaveBeenCalledTimes(7);
  });

  it("o tamanho máximo agora é 1024", async () => {
    expect((await request(app).get(imagem("?formato=png&tamanho=1024"))).status).toBe(200);
    const acima = await request(app).get(imagem("?formato=png&tamanho=1025"));
    expect(acima.status).toBe(400);
    expect(acima.body.erro).toBe("tamanho deve ser um inteiro de 200 a 1024");
  });
});

describe("TRUST_PROXY", () => {
  it.each([
    [undefined, 0],
    ["", 0],
    ["1", 1],
    [" 3 ", 3],
  ])("%j vira %i", (valor, esperado) => {
    if (valor === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = valor;
    expect(lerTrustProxy()).toBe(esperado);
  });

  it.each(["true", "-1", "1.5", "6", "abc"])(
    "%j não derruba a API: vira 0, com o erro no log (no Render, mudar a variável reinicia o serviço)",
    (valor) => {
      const erroNoLog = vi.spyOn(console, "error").mockImplementation(() => {});
      process.env.TRUST_PROXY = valor;
      expect(lerTrustProxy()).toBe(0);
      expect(erroNoLog).toHaveBeenCalledWith(expect.stringMatching(/^TRUST_PROXY ignorado: deve ser um número de 0 a 5/));
    }
  );
});
