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
export const rentalPcmRanges = [
  {id:"0-40",label:"0 - 40",min:0,max:40,exclusiveMin:false},
  {id:"41-80",label:"41 - 80",min:40,max:80,exclusiveMin:true},
  {id:"81-120",label:"81 - 120",min:80,max:120,exclusiveMin:true},
  {id:"121-160",label:"121 - 160",min:120,max:160,exclusiveMin:true},
  {id:"161-250",label:"161 - 250",min:160,max:250,exclusiveMin:true},
  {id:"251-400",label:"251 - 400",min:250,max:400,exclusiveMin:true},
  {id:"401-700",label:"401 - 700",min:400,max:700,exclusiveMin:true},
  {id:"701-1000",label:"701 - 1000",min:700,max:1000,exclusiveMin:true},
  {id:"over-1000",label:"> 1000",min:1000,max:Infinity,exclusiveMin:true},
];
export function matchesRentalSpecification(value:string, filter:string, key:RentalSpecification) {
  if (!filter) return true;
  if (filter === "missing") return !value;
  if (key === "pressure") return value === filter;
  if (!value) return false;
  if (filter.startsWith("exact:")) {
    return Number.isFinite(Number(value)) && filter.slice(6).split(",").some(exact => exact.trim() !== "" && Number.isFinite(Number(exact)) && Number(value) === Number(exact));
  }
  const range = (key === "pcm" ? rentalPcmRanges : rentalSpecificationRanges).find(r=>r.id===filter);
  const numeric = Number(value);
  return !!range && Number.isFinite(numeric) && (range.exclusiveMin ? numeric > range.min : numeric >= range.min) && numeric <= range.max;
}
