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
