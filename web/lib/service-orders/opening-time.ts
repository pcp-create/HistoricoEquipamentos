import {brazilNow} from './model';
/** M8 DateTime fields expect local wall time; offsets are converted to UTC by M8. */
export function m8LocalDateTime(value: unknown) {
  if(typeof value!=='string')return value;
  if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))return value;
  const instant=new Date(value);
  return Number.isFinite(instant.getTime())?brazilNow(instant).slice(0,19):value;
}
export function localOrderHeader(header:any) {
  const result={...header};
  for(const field of ['emissao','dataEntrega','dataEntregaPrevista'])if(field in result)result[field]=m8LocalDateTime(result[field]);
  return result;
}
/** Only repair the known offset conversion, using the immutable creation receipt. */
export function restoredOpening(source:any,original?:string) {
  if(original&&/(?:Z|[+-]\d{2}:\d{2})$/.test(original)&&Number.isFinite(Date.parse(original))){
    const utc=new Date(original).toISOString().slice(0,19);
    if(source.emissao===utc)return m8LocalDateTime(original) as string;
  }
  return m8LocalDateTime(source.emissao??source.dataAbertura??'') as string;
}
