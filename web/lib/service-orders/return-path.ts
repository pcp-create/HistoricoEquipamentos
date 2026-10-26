// Only allow the commercial report and its known filter values as an edit return.
export function commercialReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  let url: URL;
  try {
    url = new URL(value, "https://local.invalid");
  } catch {
    return;
  }
  if (
    !value.startsWith("/comercial/vendas?") ||
    url.origin !== "https://local.invalid" ||
    url.pathname !== "/comercial/vendas"
  )
    return;
  const p = new URLSearchParams();
  const period = url.searchParams.get("period") || "";
  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) p.set("period", period);
  const company = url.searchParams.get("company") || "all",
    status = url.searchParams.get("status") || "all";
  p.set("company", ["1", "2", "27404"].includes(company) ? company : "all");
  p.set("status", ["Pendente", "Processado"].includes(status) ? status : "all");
  const billing = url.searchParams.get("billing");
  if (
    billing &&
    ["partial", "matched", "unmatched", "review"].includes(billing)
  )
    p.set("billing", billing);
  return "/comercial/vendas?" + p;
}
