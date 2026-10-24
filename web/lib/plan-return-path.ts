import {equipmentSections} from "./equipment-sections";
/** Only allowlisted internal destinations used by equipment, quote and task links are accepted. */
export function planReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      ![...Object.values(equipmentSections).map(section=>section.href), "/equipamentos", "/orcamentos", "/orcamentos/novo", "/OrdemServico/nova", "/OrdemServico/editar", "/tarefas"].includes(url.pathname)
    )
      return "/";
    if(url.pathname==="/OrdemServico/editar"){
      const company=url.searchParams.get("empresa"),id=url.searchParams.get("id");
      return company&&["1","2","27404"].includes(company)&&id&&/^[1-9]\d{0,9}$/.test(id)?url.pathname+"?empresa="+company+"&id="+id:"/historico";
    }
    const params = new URLSearchParams();
    for (const key of (url.pathname === "/equipamentos" || Object.values(equipmentSections).some(section=>section.href===url.pathname))
      ? ["equipment", "plan"]
      : url.pathname === "/tarefas"
        ? ["task"]
        : ["id"]) {
      const v = url.searchParams.get(key);
      if (
        v &&
        (key === "equipment" || key === "task"
          ? /^[1-9]\d{0,17}$/.test(v)
          : /^[0-9a-f-]{36}$/i.test(v))
      )
        params.set(key, v);
    }
    return url.pathname + (params.size ? "?" + params : "");
  } catch {
    return "/";
  }
}
