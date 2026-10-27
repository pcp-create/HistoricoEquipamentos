/** Brazilian contact numbers, accepting pasted formatting and the +55 prefix. */
export function formatContactPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2), number = digits.slice(2);
  const split = number.length > 8 ? 5 : 4;
  return `(${ddd}) ${number.slice(0, split)}${number.length > split ? '-' + number.slice(split) : ''}`;
}
