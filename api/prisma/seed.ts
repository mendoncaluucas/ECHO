// Seed de desenvolvimento: usuários da gestão + dados mínimos para o fluxo do cliente.
// Roda com `npm run prisma:seed`. É idempotente — pode ser executado quantas vezes precisar.

import bcrypt from "bcryptjs";
import { Papel } from "@prisma/client";
import { prisma } from "../src/prisma.js";

const SENHA_PADRAO = "echo123";
const SALT_ROUNDS = 10;
const VENUE_NOME = "Restaurante Sinuelo";
const QR_TOKEN_DEMO = "MESA12";

const USUARIOS = [
  { nome: "Coordenadora Sinuelo", email: "coordenador@sinuelo.com", papel: Papel.COORDENADOR },
  { nome: "Gerente Sinuelo", email: "gerente@sinuelo.com", papel: Papel.GERENTE },
  { nome: "Administrador Echo", email: "admin@sinuelo.com", papel: Papel.ADMINISTRADOR },
];

const CATEGORIAS = ["Higiene", "Atendimento", "Alimento"];

// Respostas prontas para começar. O restaurante ajusta nas Configurações; rodar o seed
// de novo não desfaz o que ele editou (o upsert só cria o que falta).
const RESPOSTAS_PRONTAS = [
  {
    titulo: "Pedido de desculpas",
    texto:
      "Sentimos muito pela experiência. Já conversamos com a equipe sobre o que aconteceu " +
      "para não se repetir, e esperamos receber você de novo em breve.",
  },
  {
    titulo: "Agradecimento por elogio",
    texto:
      "Muito obrigado pelo elogio! Repassamos para toda a equipe, que ficou muito feliz. " +
      "Volte sempre.",
  },
  {
    titulo: "Sugestão anotada",
    texto:
      "Obrigado pela sugestão. Ela foi anotada e vai ser avaliada pela gerência. " +
      "Opiniões como a sua ajudam a melhorar a casa.",
  },
];
const AREAS = ["Mesa 12", "Salão"];

async function main() {
  // Todos os usuários de desenvolvimento compartilham a mesma senha.
  const senhaHash = await bcrypt.hash(SENHA_PADRAO, SALT_ROUNDS);

  // E-mail é único — o upsert evita duplicar a cada execução.
  for (const usuario of USUARIOS) {
    await prisma.user.upsert({
      where: { email: usuario.email },
      update: { nome: usuario.nome, papel: usuario.papel },
      create: { ...usuario, senhaHash },
    });
  }

  for (const nome of CATEGORIAS) {
    await prisma.category.upsert({ where: { nome }, update: {}, create: { nome } });
  }

  // Venue não tem campo único por nome — procura antes de criar.
  const venue =
    (await prisma.venue.findFirst({ where: { nome: VENUE_NOME } })) ??
    (await prisma.venue.create({ data: { nome: VENUE_NOME } }));

  // Area é única por (venueId, nome), então o upsert resolve sem procurar antes.
  for (const nome of AREAS) {
    await prisma.area.upsert({
      where: { venueId_nome: { venueId: venue.id, nome } },
      update: {},
      create: { nome, venueId: venue.id },
    });
  }

  // QR Code de demonstração apontando para a primeira área.
  const areaDoQr = await prisma.area.findFirstOrThrow({
    where: { nome: AREAS[0], venueId: venue.id },
  });
  await prisma.qRCode.upsert({
    where: { token: QR_TOKEN_DEMO },
    update: { areaId: areaDoQr.id, ativo: true },
    create: { token: QR_TOKEN_DEMO, areaId: areaDoQr.id },
  });

  for (const modelo of RESPOSTAS_PRONTAS) {
    await prisma.respostaPronta.upsert({ where: { titulo: modelo.titulo }, update: {}, create: modelo });
  }

  console.log(
    `Seed concluído: ${USUARIOS.length} usuários (senha "${SENHA_PADRAO}"), ` +
      `${CATEGORIAS.length} categorias, ${AREAS.length} áreas, o QR "${QR_TOKEN_DEMO}" ` +
      `e ${RESPOSTAS_PRONTAS.length} respostas prontas.`
  );
}

main()
  .catch((erro) => {
    console.error("Falha no seed:", erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
