import bcrypt from "bcryptjs";
import request from "supertest";
import { Papel } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/prisma.js";

export const SENHA_TESTE = "echo123";

// Custo baixo de propósito: os testes rodam muitos hashes e não precisam do custo de produção.
const SALT_ROUNDS_TESTE = 4;

export const QR_TOKEN = "TESTE1";
export const CATEGORIAS = ["Higiene", "Atendimento", "Alimento"];

// Monta o mínimo para o fluxo do cliente: restaurante, área, QR Code ativo e categorias.
export async function criarCenarioCliente() {
  const venue = await prisma.venue.create({ data: { nome: "Restaurante Teste" } });
  const area = await prisma.area.create({
    data: { nome: "Mesa 1", venueId: venue.id },
  });
  const qrCode = await prisma.qRCode.create({
    data: { token: QR_TOKEN, areaId: area.id },
  });

  const categorias = [];
  for (const nome of CATEGORIAS) {
    categorias.push(await prisma.category.create({ data: { nome } }));
  }

  return { venue, area, qrCode, categorias };
}

export async function criarUsuario(
  papel: Papel,
  email = `${papel.toLowerCase()}@teste.com`
) {
  return prisma.user.create({
    data: {
      nome: `Usuário ${papel}`,
      email,
      senhaHash: await bcrypt.hash(SENHA_TESTE, SALT_ROUNDS_TESTE),
      papel,
    },
  });
}

// Cria o usuário e devolve um token válido, passando pelo endpoint real de login.
export async function autenticar(papel: Papel) {
  const usuario = await criarUsuario(papel);
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: usuario.email, senha: SENHA_TESTE });

  return { usuario, token: res.body.token as string };
}
