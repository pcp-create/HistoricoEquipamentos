/** Display operation numbers with at least two digits, without changing their stored value. */
export function operationNumber(position: number | string | null | undefined): string {
  return position == null ? "" : String(position).padStart(2, "0");
}
