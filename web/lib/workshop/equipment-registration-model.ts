export const workshopEquipmentTypes = [
  {id:'dryer',label:'Secador de Ar',ncm:'84193900'},
  {id:'screw',label:'Compressor Parafuso',ncm:'84148012'},
  {id:'piston',label:'Compressor Pistão',ncm:'84148011'},
  {id:'separator',label:'Separador de Condensado',ncm:'84213990'},
  {id:'piston-unit',label:'Unidade Compressora Pistão',ncm:'84148011',ownOnly:true},
] as const;
export class EquipmentRegistrationError extends Error {}
const clean=(value:unknown,label:string,max:number,required=false)=>{
 if(value==null&&!required)return '';
 if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new EquipmentRegistrationError(`Confira ${label}.`);
 return value.trim().replace(/\s+/g,' ');
};
const number=(value:unknown,label:string,maxDecimals=3)=>{
 if(value==null||value==='')return null;
 const raw=typeof value==='number'?String(value):typeof value==='string'?value.trim().replace(',','.'):'';
 if(!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>1e9||Number(raw)<0||Math.abs(Number(raw)-Number(Number(raw).toFixed(maxDecimals)))>1e-9)throw new EquipmentRegistrationError(`Confira ${label}.`);
 return Number(raw);
};
const isMissingSerial=(serial:string)=>['NC','SEMSERIE'].includes(serial.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toUpperCase());
export function equipmentRegistrationInput(input:any,{requireInternalDetails=true}:{requireInternalDetails?:boolean}={}){
 if(!input||!['own','customer'].includes(input.ownership))throw new EquipmentRegistrationError('Selecione equipamento próprio ou de cliente.');
 const type=workshopEquipmentTypes.find(t=>t.id===input.type);
 if(type&&input.ownership==='customer'&&'ownOnly' in type)throw new EquipmentRegistrationError('Selecione um tipo de equipamento de cliente.');
 if(!type)throw new EquipmentRegistrationError('Selecione o tipo do equipamento.');
 const own=input.ownership==='own';
 const internalCode=own?clean(input.internalCode,'o Código de Identificação Interno',100,requireInternalDetails):'';
 const measure=(key:string,label:string)=>{
  if(!own)return null;
  const value=number(input[key],label);
  if(value==null&&!requireInternalDetails)return null;
  if(value==null||value<=0)throw new EquipmentRegistrationError(`Informe ${label} com um valor maior que zero.`);
  return value;
 };
 const height=measure('height','a altura'),width=measure('width','a largura'),length=measure('length','o comprimento'),weight=measure('weight','o peso bruto');
 if(own&&input.noSerial!=null&&typeof input.noSerial!=='boolean')throw new EquipmentRegistrationError('Confirme se o equipamento não possui série disponível.');
 const noSerial=own&&input.noSerial===true;
 const model=clean(input.model,'o modelo',100,!(own&&type.id==='separator'));
 const serial=noSerial?'N/C':clean(input.serial,'a série',100,true),notes=clean(input.notes,'as informações complementares',2000);
 if(own&&!noSerial&&isMissingSerial(serial))throw new EquipmentRegistrationError('Confirme que o equipamento não possui número de série disponível para usar SÉRIE N/C.');
 const hp=own&&['dryer','separator'].includes(type.id)?null:number(input.hp,'HP');
 const pcm=own&&type.id==='separator'?null:number(input.pcm,'PCM');
 const bar=own&&['dryer','piston-unit'].includes(type.id)?null:number(input.bar,'BAR');
 const voltage=own&&!['separator','piston-unit'].includes(type.id)?clean(input.voltage,'a tensão',50):'';
 if(voltage&&!/^\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*$/.test(voltage))throw new EquipmentRegistrationError('Informe a tensão em volts, por exemplo 380 ou 220/380, sem incluir V ou HZ.');
 const frequency=own&&!['separator','piston-unit'].includes(type.id)?number(input.frequency,'a frequência'):null;
 const pressure=own&&['piston','separator'].includes(type.id)?number(input.pressure,'a pressão em PSI/LBS'):null;
 const pressureUnit=pressure!=null?clean(input.pressureUnit,'a unidade de pressão',3,true):'';
 if(pressure!=null&&!['PSI','LBS'].includes(pressureUnit))throw new EquipmentRegistrationError('Selecione PSI ou LBS para a pressão adicional.');
 const configuration=own&&type.id==='separator'?clean(input.configuration,'a configuração',80):'';
 const capacity=own&&type.id==='separator'?number(input.capacity,'a capacidade em litros'):null;
 const characteristics=own?clean(input.characteristics,'as características',150):'';
 const price=own?number(input.price,'o valor de venda',2):null;
 const minimumPrice=own?number(input.minimumPrice,'o valor mínimo de venda',2):null;
 if(price!=null&&minimumPrice!=null&&minimumPrice>price)throw new EquipmentRegistrationError('O valor mínimo não pode superar o valor de venda.');
 return {ownership:input.ownership as 'own'|'customer',type:type.id,model,serial,hp,pcm,bar,notes,price,minimumPrice,origin:'Nacional' as const,noSerial,voltage:voltage.replace(/\s/g,''),frequency,pressure,pressureUnit,configuration,capacity,characteristics,internalCode,height,width,length,weight};
}
export type RegistrationInput=ReturnType<typeof equipmentRegistrationInput>;
const decimal=(value:number|null,unit:string,min=0)=>value==null?'':`${value.toLocaleString('pt-BR',{useGrouping:false,minimumFractionDigits:min,maximumFractionDigits:3})}${unit}`;
export function equipmentRegistrationName(input:RegistrationInput){
 if(input.ownership!=='own')return `${workshopEquipmentTypes.find(t=>t.id===input.type)?.label||''} - Modelo ${input.model} - Série ${input.serial}`.toLocaleUpperCase('pt-BR');
 const hp=decimal(input.hp,'HP'),pcm=decimal(input.pcm,'PCM');
 const pressure=[decimal(input.pressure,input.pressureUnit),decimal(input.bar,'BAR',input.pressure==null?1:0)].filter(Boolean).join('/');
 const electrical=[input.voltage?`${input.voltage.replace(/\./g,',')}V`:'',decimal(input.frequency,'HZ')].filter(Boolean).join('/');
 let parts:string[];
 switch(input.type){
  case 'screw':parts=[['COMPRESSOR PARAFUSO',hp].filter(Boolean).join(' '),pcm,input.model,pressure,electrical];break;
  case 'piston':parts=[['COMPRESSOR PISTÃO',pcm].filter(Boolean).join(' '),input.model,hp,pressure,electrical];break;
  case 'piston-unit':parts=[['UNIDADE COMPRESSORA PISTÃO',pcm].filter(Boolean).join(' '),input.model,hp];break;
  case 'dryer':parts=[['SECADOR DE AR',pcm].filter(Boolean).join(' '),input.model,electrical];break;
  case 'separator':parts=[['SEPARADOR CONDENSADO',input.configuration,decimal(input.capacity,'L')].filter(Boolean).join(' '),input.model,pressure];break;
 }
 return [...parts,input.characteristics,`SÉRIE ${input.serial}`].filter(Boolean).join(' - ').replace(/\s+/g,' ').toLocaleUpperCase('pt-BR');
}
export function equipmentRegistrationPayload(input:RegistrationInput,ids:{family:number;unit:number;category?:number}){
 const own=input.ownership==='own',type=workshopEquipmentTypes.find(t=>t.id===input.type)!;
 const specifications=[input.hp!=null?`${input.hp} HP`:'',input.pcm!=null?`${input.pcm} PCM`:'',input.bar!=null?`${input.bar} BAR`:'',input.pressure!=null?`${input.pressure} ${input.pressureUnit}`:'',input.voltage?`${input.voltage} V`:'',input.frequency!=null?`${input.frequency} HZ`:'',input.configuration,input.capacity!=null?`${input.capacity} L`:'',input.characteristics].filter(Boolean).join(' · ');
 return {origem:input.origin,nome:equipmentRegistrationName(input),apelido:equipmentRegistrationName(input),ncm:own?type.ncm:'00000000',codigoGenero:own?'84':'00',codigoTipoSped:own?'00':'07',unidadeId:ids.unit,familiaId:ids.family,grupoEstoqueId:own?96:97,
 ...(own?{tipoProduto:'EquipamentoProduto',codigoIdentificacaoInterno:input.internalCode,produtoAltura:input.height,produtoLargura:input.width,produtoComprimento:input.length,pesoBruto:input.weight,tipoPeso:'Quilo',categoriaId:ids.category,precoVenda:input.price??0,precoVendaMinimo:input.minimumPrice??0,...(input.model?{modeloResumido:input.model}:{}),...(input.hp!=null?{potencia:input.hp}:{})}:{modeloGerador:input.model,numeroSerieGerador:input.serial,...(input.hp!=null?{potencia:String(input.hp)}:{})}),
 informacoesComplementares:[own?`Série: ${input.serial}`:'',specifications,input.notes].filter(Boolean).join('\n')||null};
}
