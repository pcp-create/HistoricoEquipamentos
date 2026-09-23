/** Only allowlisted internal destinations used by equipment, quote and task links are accepted. */
export function planReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      !["/equipamentos", "/orcamentos", "/tarefas"].includes(url.pathname)
    )
      return "/";
    const params = new URLSearchParams();
    for (const key of url.pathname === "/equipamentos"
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
