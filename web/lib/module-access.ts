/** Module visibility is independent of the user's administrative role. */
export const moduleOptions = [
  { id: "crm", label: "CRM", defaultEnabled: true },
  { id: "assistencia-tecnica", label: "Assistência Técnica", defaultEnabled: true },
  { id: "suprimentos", label: "Suprimentos", defaultEnabled: true },
  { id: "equipamentos", label: "Equipamentos", defaultEnabled: true },
  { id: "tarefas", label: "Tarefas", defaultEnabled: true },
  { id: "programacao", label: "Programação de OSs", defaultEnabled: false },
  { id: "tecnico", label: "Portal Técnico", defaultEnabled: false },
] as const;
export type ModuleId = typeof moduleOptions[number]["id"];
export const defaultModules: string[] = moduleOptions.filter(m => m.defaultEnabled).map(m => m.id);
export function userModules(value: unknown): string[] {
  return value == null ? [...defaultModules] : Array.isArray(value)
    ? moduleOptions.filter(m => value.includes(m.id)).map(m => m.id) : [];
}
export function validateModules(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(id => !moduleOptions.some(m => m.id === id)) || new Set(value).size !== value.length)
    throw Error("Selecione módulos válidos.");
  return userModules(value);
}
export function hasModule(access: { enabled?: boolean; modules?: unknown } | null, ...ids: string[]) {
  return access?.enabled === true && ids.some(id => userModules(access.modules).includes(id));
}
export const pageModules: Record<string, string[]> = {
  "/historico": ["crm", "assistencia-tecnica"],
  "/orcamentos": ["crm"],
  "/fabricante": ["crm", "assistencia-tecnica", "suprimentos"],
  "/configuracoes": ["crm", "assistencia-tecnica", "suprimentos"],
  "/analise-materiais": ["suprimentos"],
  "/equipamentos": ["equipamentos", "assistencia-tecnica"],
  "/tarefas": ["tarefas"],
  "/programacao": ["programacao"],
  "/tecnico": ["tecnico"],
};
export function canOpenModulePage(modules: string[], path: string) {
  return (pageModules[path] || []).some(id => modules.includes(id));
}
