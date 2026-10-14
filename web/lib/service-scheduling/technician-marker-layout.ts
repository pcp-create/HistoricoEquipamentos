/** Separate visible technician markers without changing their stored GPS coordinates. */
export function technicianMarkerLayout<T>(items: T[], project: (item: T) => {x: number; y: number}, labelWidth: (item: T) => number) {
  const placed: {item: T; x: number; y: number; originalX: number; originalY: number; width: number}[] = [];
  for (const item of items) {
    const original = project(item);
    const width = Math.max(44, labelWidth(item) + 42);
    const free = (x: number, y: number) => placed.every(p => Math.abs(y - p.y) >= 36 || x + width <= p.x || p.x + p.width <= x);
    let x = original.x, y = original.y;
    // Try the nearest rows first, keeping each name beside its individual dot.
    for (let step = 1; !free(x, y); step++) {
      y = original.y + Math.ceil(step / 2) * 36 * (step % 2 ? 1 : -1);
    }
    placed.push({item, x, y, originalX: original.x, originalY: original.y, width});
  }
  return placed;
}
