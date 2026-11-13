import "server-only";
import { AdminInputError } from "../admin-store";
export const contactTypes = [
  "Geral",
  "OrdemCompra",
  "Financeiro",
  "Supervisor",
  "Motorista",
  "Operador",
  "Maquinista",
];
export function contactPayload(b: any) {
  const text = (key: string, max: number) => {
    const v = typeof b[key] === "string" ? b[key].trim() : "";
    if (v.length > max)
      throw new AdminInputError("Campo do contato excede o limite.");
    return v;
  };
  const nome = text("name", 160),
    telefone = text("phone", 40),
    email = text("email", 254),
    tipo = text("contact_type", 40) || "Geral",
    cargoId = Number(b.cargo_id);
  if (!nome || !/^[+()\d\s.-]{8,40}$/.test(telefone))
    throw new AdminInputError("Informe nome e telefone válidos.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AdminInputError("Informe o e-mail do contato.");
  if (
    !contactTypes.includes(tipo) ||
    !Number.isInteger(cargoId) ||
    cargoId < 1 ||
    cargoId > 2147483647
  )
    throw new AdminInputError(
      "Selecione o tipo e informe o ID do cargo cadastrado no M8.",
    );
  const telefoneAdicional = text("additional_phone", 40),
    cpfCnpj = text("document", 20),
    observacao = text("notes", 2000);
  if (telefoneAdicional && !/^[+()\d\s.-]{8,40}$/.test(telefoneAdicional))
    throw new AdminInputError("Telefone adicional inválido.");
  if (cpfCnpj && ![11, 14].includes(cpfCnpj.replace(/\D/g, "").length))
    throw new AdminInputError("Confira o CPF/CNPJ do contato.");
  return {
    nome,
    telefone,
    email,
    tipo,
    cargoId,
    telefoneAdicional: telefoneAdicional || null,
    cpfCnpj: cpfCnpj || null,
    observacao: observacao || null,
  };
}
export async function fetchM8Contacts(
  request: (path: string) => Promise<any>,
  customerId: string,
) {
  const rows: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const data = await request(
      `/v1/configuracoes/cliente/${customerId}/contato?Page=${page}&PageSize=1000`,
    );
    if (
      !Array.isArray(data) ||
      data.some((x) => !Number.isSafeInteger(x.id) || x.id < 1)
    )
      throw Error("Resposta de contatos M8 inválida.");
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
  throw Error("Lista de contatos M8 excedeu o limite de consulta.");
}
