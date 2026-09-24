// A atribuição de preventivas de clientes é fixa na Divisão Comercial.
export const clientAssignmentMode = "commercial";
export function assignmentLocked(origin: string) {
  return (
    clientAssignmentMode === "commercial" &&
    [
      "Preventiva de Equipamento Locado",
      "Preventiva de Equipamento Emprestado",
    ].includes(origin)
  );
}
export const assignmentLockReason =
  "Indisponível enquanto Preventiva de Equipamento de Cliente estiver definida como “Conforme Divisão Comercial”.";
