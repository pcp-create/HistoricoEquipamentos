export function rentalSpecifications(name: string) {
  const read = (units: string) => {
    const match = new RegExp(`(?:^|[^\\p{L}\\d.,])([0-9]+(?:[.,][0-9]+)?)\\s*(${units})\\b`, 'iu').exec(name || '');
    return match ? {value: String(Number(match[1].replace(',', '.'))), unit: match[2].toUpperCase()} : null;
  };
  const pressure = read('BAR|PSI|LBS');
  return { hp: read('HP')?.value || '', pcm: read('PCM')?.value || '', pressure: pressure ? `${pressure.value} ${pressure.unit}` : '' };
}
export type RentalSpecification = keyof ReturnType<typeof rentalSpecifications>;

// Boundaries are continuous so decimal ratings (e.g. 30.5 HP) are not lost.
export const rentalSpecificationRanges = [
  {id:"0-30",label:"0 - 30",min:0,max:30,exclusiveMin:false},
  {id:"31-60",label:"31 - 60",min:30,max:60,exclusiveMin:true},
  {id:"61-100",label:"61 - 100",min:60,max:100,exclusiveMin:true},
  {id:"101-250",label:"101 - 250",min:100,max:250,exclusiveMin:true},
  {id:"over-250",label:"> 250",min:250,max:Infinity,exclusiveMin:true},
];
export function matchesRentalSpecification(value:string, filter:string, key:RentalSpecification) {
  if (!filter) return true;
  if (filter === "missing") return !value;
  if (key === "pressure") return value === filter;
  if (!value) return false;
  const range = rentalSpecificationRanges.find(r=>r.id===filter);
  const numeric = Number(value);
  return !!range && Number.isFinite(numeric) && (range.exclusiveMin ? numeric > range.min : numeric >= range.min) && numeric <= range.max;
}
