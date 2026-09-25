const palette = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#a78bfa",
  "#2dd4bf",
  "#fb923c",
];
export function userTaskColor(
  email?: string | null,
  configured?: string | null,
) {
  if (configured && /^#[0-9a-f]{6}$/i.test(configured)) return configured;
  if (!email) return "#94a3b8";
  let hash = 0;
  for (const c of email.trim().toLowerCase())
    hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
