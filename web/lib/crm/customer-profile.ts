import {CrmError,text} from './model';
export function customerProfile(raw:unknown={}) {
 if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new CrmError('Perfil do cliente inválido.');
 const value=raw as Record<string,unknown>;
 const partsType=text(value.partsType??'',20);
 if(!['','original','aftermarket','mixed','unknown'].includes(partsType))throw new CrmError('Selecione um tipo de peças válido.');
 return {partsType,currentBrands:text(value.currentBrands??'',500),partsBrands:text(value.partsBrands??'',500),offeredBrands:text(value.offeredBrands??'',500),servicePartner:text(value.servicePartner??'',500),competitors:text(value.competitors??'',500),profileNotes:text(value.profileNotes??'',2000)};
}
