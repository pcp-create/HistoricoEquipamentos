export const automaticFields: Record<string, string> = {
  status_lancamento_nome: "Status do lançamento",
  tipo_nome: "Tipo",
  situacao_nome: "Situação",
  tipo_atendimento_nome: "Tipo de atendimento",
};
export function validateAutomaticRules(raw: any) {
  const value = raw ?? { enabled: false, rules: [] };
  if (
    typeof value.enabled !== "boolean" ||
    !Array.isArray(value.rules) ||
    value.rules.length > 30
  )
    throw Error("Regras automáticas inválidas.");
  const rules = value.rules.map((r: any) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      typeof r.name !== "string" ||
      !r.name.trim() ||
      r.name.length > 120 ||
      !Array.isArray(r.conditions) ||
      !r.conditions.length ||
      r.conditions.length > 20
    )
      throw Error("Informe o nome e pelo menos uma condição por regra.");
    return {
      id: r.id,
      name: r.name.trim(),
      conditions: r.conditions.map((c: any, i: number) => {
        if (
          !c ||
          !Object.hasOwn(automaticFields, c.field) ||
          !["eq", "neq"].includes(c.operator) ||
          typeof c.value !== "string" ||
          !c.value.trim() ||
          c.value.length > 500 ||
          (i > 0 && !["and", "or"].includes(c.connector))
        )
          throw Error("Preencha campo, comparação, valor e ligação E/OU.");
        return {
          field: c.field,
          operator: c.operator,
          value: c.value,
          connector: i === 0 ? "and" : c.connector,
        };
      }),
    };
  });
  if (new Set(rules.map((r: any) => r.id)).size !== rules.length)
    throw Error("Regras duplicadas.");
  if (value.enabled && !rules.length)
    throw Error("Adicione uma regra antes de ativar a entrada automática.");
  return { enabled: value.enabled, rules };
}
