/** Missing approval remains unknown; only explicit rejection is excluded. */
export function isNotApproved(value: unknown): boolean {
  return (
    value === false ||
    ["false", "nao", "não"].includes(
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
  );
}
export const approvedMaterialSql = (alias: string) =>
  `lower(trim(COALESCE(${alias}.aprovado::text,''))) NOT IN ('false','nao','não')`;

/** Explicit ERP approval only. Unknown must never be presented as approved. */
export function itemApproval(value: unknown): "approved" | "rejected" | "unknown" {
  if (isNotApproved(value)) return "rejected";
  return value === true || ["true", "sim"].includes(String(value ?? "").trim().toLowerCase())
    ? "approved" : "unknown";
}
