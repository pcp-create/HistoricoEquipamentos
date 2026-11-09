/** Preserve letters and leading zeroes; ignore case, accents and punctuation. */
export function normalizedEquipmentSerial(value: unknown) {
  const key = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return ["NC", "SEMSERIE"].includes(key) ? "" : key;
}
