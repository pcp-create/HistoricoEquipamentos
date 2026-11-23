export function canManageVisits(profile: unknown) {
 if(profile && typeof profile==='object'){
  const access=profile as {enabled?:boolean;role?:string;modules?:unknown};
  if(access.enabled===false)return false;
  if(Array.isArray(access.modules))return access.modules.includes('gestao-visitas');
  return access.role==='admin'||access.role==='manager';
 }
 return profile === "admin" || profile === "manager";
}
