const positive=v=>Number.isFinite(v)&&v>0;
const known=v=>Number.isFinite(v)&&v>=0;
export function leakageM3PerHour(flow,unit='ltr/min'){
 if(!known(flow))return null;
 const key=unit.toLowerCase().replace(/³/g,'3').replace(/\s/g,'');
 const factors={'ltr/min':.06,'l/min':.06,'nl/min':.06,'liter/min':.06,'litre/min':.06,'m3/min':60,'nm3/min':60,'m3/h':1,'nm3/h':1,'m3/hr':1,'cfm':1.69901079552,'cuft/min':1.69901079552};
 return Object.hasOwn(factors,key)?flow*factors[key]:null;
}
/**
 * Device cost is authoritative; remaining references use its recorded parameters.
 * @param {{flow:number, unit?:string, device:{annualHours?:number|null,specificPower?:number|null,energyPrice?:number|null,cost?:number|null}, system?:{annualHours?:number|null,specificPower?:number|null,energyPrice?:number|null}|null, source?:string}} options
 */
export function calculateLeakResults({flow,unit='ltr/min',device,system=null,source='device'}){
 const hourly=leakageM3PerHour(flow,unit);
 const derive=parameters=>{
  const volume=hourly!==null&&positive(parameters.annualHours)?hourly*parameters.annualHours:null;
  const energy=volume!==null&&positive(parameters.specificPower)?volume*parameters.specificPower:null;
  return {volumeAno:volume,energy,cost:energy!==null&&positive(parameters.energyPrice)?energy*parameters.energyPrice:null,co2:energy!==null?energy*.527/1000:null};
 };
 const reference=derive(device);
 reference.cost=known(device.cost)?device.cost:null;
 if(source==='device')return {...reference,device:reference};
 if(source!=='system')throw Error('Selecione a origem dos cálculos.');
 if(!system||!positive(system.specificPower)||!positive(system.annualHours)||!positive(system.energyPrice))throw Error('Preencha as máquinas, as horas anuais e o preço da energia em Máquinas e cálculo para usar o cálculo do sistema.');
 if(hourly===null)throw Error('Unidade de vazão não reconhecida para o cálculo do sistema: '+unit);
 return {...derive(system),device:reference};
}
