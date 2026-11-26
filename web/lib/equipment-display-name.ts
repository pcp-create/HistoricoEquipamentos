/** Older saved labels appended the serial even when the equipment name already contained it. */
export function equipmentDisplayName(value: string | null | undefined): string {
  const name = (value || '').trim();
  const parts = name.split(/\s+·\s+/);
  if (parts.length < 2) return name;
  const serial = parts[parts.length - 1].trim();
  const description = parts.slice(0, -1).join(' · ');
  const normalized = description.toLocaleUpperCase('pt-BR');
  const suffix = serial.toLocaleUpperCase('pt-BR');
  // Require a complete trailing token; a partial serial must not be removed.
  if (suffix && normalized.endsWith(suffix)) {
    const preceding = normalized.charAt(normalized.length - suffix.length - 1);
    if (!preceding || /[\s:–—-]/.test(preceding)) return description;
  }
  return name;
}
