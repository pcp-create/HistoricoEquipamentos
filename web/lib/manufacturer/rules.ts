export const fold = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
export const normalizeCode = (value: unknown) =>
  fold(value).replace(/[\s.\-]/g, "");
export const normalizeSerial = (value: unknown) =>
  fold(value).replace(/[^A-Z0-9]/g, "");
export function modelKeys(text: string): string[] {
  return [
    ...new Set(
      (
        fold(text).match(
          /\b(?:GA|GX|G|W)\s*\d{1,3}C?\s*\+?(?:\s*VSD\s*\+?)?/g,
        ) || []
      ).map((v) => v.replace(/\s/g, "")),
    ),
  ];
}
export type SerialMatch = "match" | "no" | "review";
// Only mechanically unambiguous expressions are eligible for an automatic candidate match.
export function serialMatch(expression: string, serial: string): SerialMatch {
  const input = normalizeSerial(serial);
  if (!input || !expression.trim()) return "review";
  const raw = fold(expression)
    .replace(
      /\b(?:NUMERO\s+DE\s+SERIE|N[°º.]?\s*(?:DE\s+)?SERIE|SERIE)\s*:?\s*/g,
      "",
    )
    .replace(/\b(ATE|APOS)\s+A\s+/g, "$1 ")
    .replace(/^\s*DE\s+/, "")
    .replace(/[–—]/g, "-")
    .trim();
  const part = (s: string) => {
    const m = normalizeSerial(s).match(/^([A-Z]*)(\d+)$/);
    return m
      ? { prefix: m[1], number: BigInt(m[2]), width: m[2].length }
      : null;
  };
  const point = part(input);
  if (!point) return "review";
  const range = raw.match(
    /^([A-Z]*\s*\d[\d. ]*)\s+(?:ATE|A|-)\s*([A-Z]*\s*\d[\d. ]*)$/,
  );
  if (range) {
    const a = part(range[1]),
      b = part(range[2]);
    if (!a || !b) return "review";
    if (!b.prefix) b.prefix = a.prefix;
    if (a.prefix !== b.prefix || a.width !== b.width || a.number > b.number)
      return "review";
    return point.prefix === a.prefix &&
      point.width === a.width &&
      point.number >= a.number &&
      point.number <= b.number
      ? "match"
      : "no";
  }
  const lower = raw.match(
    /^(A PARTIR (?:DE|DA|DO)|DESDE|APOS|POSTERIOR A)\s+([A-Z]*\s*\d[\d. ]*)$/,
  );
  if (lower) {
    const a = part(lower[2]);
    return a &&
      point.prefix === a.prefix &&
      point.width === a.width &&
      (/^(APOS|POSTERIOR)/.test(lower[1])
        ? point.number > a.number
        : point.number >= a.number)
      ? "match"
      : "no";
  }
  const open = raw.match(/^([A-Z]*\s*\d[\d. ]*?)\s*(?:\.{3}|…)$/);
  if (open) {
    const a = part(open[1]);
    return a && point.prefix === a.prefix && point.number >= a.number
      ? "match"
      : "no";
  }
  const upper = raw.match(/^(ATE|ANTERIOR A)\s+([A-Z]*\s*\d[\d. ]*)$/);
  if (upper) {
    const a = part(upper[2]);
    return a &&
      point.prefix === a.prefix &&
      point.width === a.width &&
      (upper[1] === "ATE" ? point.number <= a.number : point.number < a.number)
      ? "match"
      : "no";
  }
  const wildcard = raw.replace(/[ .]/g, "").match(/^([A-Z]*)(\d+)(X+)$/);
  if (wildcard)
    return input.startsWith(wildcard[1] + wildcard[2]) &&
      input.length ===
        wildcard[1].length + wildcard[2].length + wildcard[3].length
      ? "match"
      : "no";
  // A bare number is an exact serial, never an implicit start of a range.
  const exact = part(raw);
  if (exact) return normalizeSerial(raw) === input ? "match" : "no";
  return "review";
}
export type SelectionRule = { model: string; serial: string; cell: string };
export type Variant = {
  id: string;
  name: string;
  header: string[];
  models: string[];
  rules: SelectionRule[];
  issues: string[];
};
export function variantMatch(
  v: Variant,
  model: string,
  serial: string,
): SerialMatch {
  const requested = modelKeys(model);
  const hasModel =
    !model ||
    requested.some((k) => v.models.includes(k)) ||
    (!requested.length &&
      fold([v.name, ...v.header].join(" ")).includes(fold(model)));
  if (!hasModel) return "no";
  if (v.header.includes("Aplicação somente por modelo"))
    return model ? "match" : "review";
  if (!serial) return "review";
  const linked = v.rules.filter(
    (r) => !model || modelKeys(r.model).some((k) => requested.includes(k)),
  );
  const expressions = linked.length
    ? linked.map((r) => r.serial)
    : v.header.filter((h) => /\d{3}|\.\.\.|xxx/i.test(h));
  const matches = expressions.map((e) => serialMatch(e, serial));
  if (matches.includes("match")) return "match";
  return matches.length && matches.every((m) => m === "no") ? "no" : "review";
}
export function validCode(value: string) {
  return /^[A-Z0-9]{6,24}$/.test(value) && /\d/.test(value);
}

// Join separated prefixes only when they occur in the manufacturer's serial references.
// This avoids interpreting ordinary words in a mixed search as serial prefixes.
export function catalogSearchTerms(
  query: string,
  variants: Variant[],
): string[] {
  const prefixes = new Set(
    variants.flatMap((v) =>
      [...v.rules.map((r) => r.serial), ...v.header].flatMap((expression) =>
        [...fold(expression).matchAll(/\b([A-Z]{2,6})\s*\d{4,}/g)].map(
          (m) => m[1],
        ),
      ),
    ),
  );
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (let i = 0; i < terms.length; i++) {
    if (prefixes.has(terms[i]) && /^\d[\d.]*$/.test(terms[i + 1] || "")) {
      result.push(terms[i] + terms[++i]);
    } else result.push(terms[i]);
  }
  return result;
}
