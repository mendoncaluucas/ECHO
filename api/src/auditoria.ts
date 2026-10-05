import type { AcaoAuditoria, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

// Registro no log de auditoria. Ver docs/MODELO-DADOS.md
//
// Recebe o cliente da transação de quem chama: a ação e o registro dela gravam
// juntos ou não gravam. Log gravado à parte deixaria passar ação sem rastro quando
// a segunda escrita falhasse — e um log de auditoria que às vezes falta não serve
// para auditar.

type Cliente = Prisma.TransactionClient | typeof prisma;

export type EntidadeAuditada = "User" | "Area" | "QRCode" | "Feedback";

export interface RegistroDeAuditoria {
  acao: AcaoAuditoria;
  usuarioId: string;
  entidade: EntidadeAuditada;
  entidadeId: string;
  detalhes?: Prisma.InputJsonObject;
}

export function registrarAuditoria(cliente: Cliente, registro: RegistroDeAuditoria) {
  return cliente.auditLog.create({ data: registro });
}
