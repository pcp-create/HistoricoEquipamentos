export function rentalSpecifications(name: string) {
  const read = (units: string) => {
    const match = new RegExp(`(?:^|[^\\p{L}\\d.,])([0-9]+(?:[.,][0-9]+)?)\\s*(${units})\\b`, 'iu').exec(name || '');
    return match ? {value: String(Number(match[1].replace(',', '.'))), unit: match[2].toUpperCase()} : null;
  };
  const pressure = read('BAR|PSI|LBS');
  return { hp: read('HP')?.value || '', pcm: read('PCM')?.value || '', pressure: pressure ? `${pressure.value} ${pressure.unit}` : '' };
}
export type RentalSpecification = keyof ReturnType<typeof rentalSpecifications>;

export const rentalSpecificationRanges = [
  {id:"0-30",label:"0 - 30",min:0,max:30},
  {id:"32-60",label:"32 - 60",min:32,max:60},
  {id:"75-100",label:"75 - 100",min:75,max:100},
  {id:"125-250",label:"125 - 250",min:125,max:250},
  {id:"over-250",label:"> 250",min:250,max:Infinity},
];
export function matchesRentalSpecification(value:string, filter:string, key:RentalSpecification) {
  if (!filter) return true;
  if (filter === "missing") return !value;
  if (key === "pressure") return value === filter;
  if (!value) return false;
  const range = rentalSpecificationRanges.find(r=>r.id===filter);
  const numeric = Number(value);
  return !!range && Number.isFinite(numeric) && (range.id === "over-250" ? numeric > 250 : numeric >= range.min && numeric <= range.max);
}
