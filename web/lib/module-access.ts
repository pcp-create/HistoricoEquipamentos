/** All enabled employees can access every module. Administrative actions remain role-protected. */
export const moduleOptions = [
  { id: "crm", label: "CRM", defaultEnabled: true },
  { id: "assistencia-tecnica", label: "Assistência Técnica", defaultEnabled: true },
  { id: "suprimentos", label: "Suprimentos", defaultEnabled: true },
  { id: "equipamentos", label: "Equipamentos", defaultEnabled: true },
  { id: "tarefas", label: "Tarefas", defaultEnabled: true },
  { id: "programacao", label: "Programação de OSs", defaultEnabled: true },
  { id: "tecnico", label: "Portal Técnico", defaultEnabled: true },
] as const;
export type ModuleId = typeof moduleOptions[number]["id"];
export const defaultModules: string[] = moduleOptions.filter(m => m.defaultEnabled).map(m => m.id);
export function userModules(value: unknown): string[] {
  return value == null ? [...defaultModules] : Array.isArray(value)
    ? moduleOptions.filter(m => value.includes(m.id)).map(m => m.id) : [];
}
export function hasModule(access: { enabled?: boolean; modules?: unknown } | null, ...ids: string[]) {
  return access?.enabled === true && ids.some(id => defaultModules.includes(id));
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
