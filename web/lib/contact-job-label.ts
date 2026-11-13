/** Hide the ERP code prefix while preserving the original contact data. */
export function contactJobLabel(contact: { job_title?: string; cargo_id?: string | number | null }) {
  const label = (contact.job_title || "").trim();
  const code = String(contact.cargo_id ?? "").trim();
  if (!/^\d+$/.test(code)) return label;
  return label.replace(new RegExp(`^${code}(?:\\s*[-·:]\\s*|\\s+|(?=[A-Za-zÀ-ÿ]))`), "").trim();
}
