export function versionLabel(v: { name: string; header?: string[] }) {
  const conditions = [
    ...new Set(
      (v.header || [])
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter((s) => s && s !== v.name),
    ),
  ];
  const text = conditions.includes("Aplicação somente por modelo")
    ? "Aplicação por modelo · sem restrição de série"
    : conditions.join(" · ");
  return (
    v.name +
    (text ? " — " + (text.length > 105 ? text.slice(0, 102) + "…" : text) : "")
  );
}
