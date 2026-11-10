'use client';
import OrderSearchSelect from './order-search-select';
import {normalizedEquipmentSerial} from '@/lib/equipment/serial';
import {clearApiCache} from '@/lib/client-api-cache';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,CheckCircle2,Plus} from 'lucide-react';
import {equipmentRegistrationInput,equipmentRegistrationName,workshopEquipmentTypes} from '@/lib/workshop/equipment-registration-model';
export default function WorkshopRegisterEquipment({onCreated,onCancel,onBusy,customer,source="workshop",customerOnly=false,onDraft,actionHint,endpoint="/api/workshop/equipment"}:{customer?:{id:string;name:string};source?:"workshop"|"visits"|"service-order";endpoint?:string;customerOnly?:boolean;actionHint?:string;onDraft?:(input:any)=>void;onCreated:(equipment:any)=>void;onCancel:()=>void;onBusy:(busy:boolean)=>void}){
 const [input,setInput]=useState({brand:'',meter:'',customerKey:customer?.id||'',source,ownership:'customer',type:'',model:'',serial:'',hp:'',pcm:'',bar:'',notes:'',price:'',minimumPrice:'',noSerial:false,internalSerial:false,internalSerialId:'',voltage:'',frequency:'',pressure:'',pressureUnit:'PSI',configuration:'',capacity:'',characteristics:'',internalCode:'',height:'',width:'',length:'',weight:''});
 const [busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[error,setError]=useState('');
 const [customerName,setCustomerName]=useState(customer?.name||'');
 const [candidates,setCandidates]=useState<any[]>([]),[checking,setChecking]=useState(false),[serialError,setSerialError]=useState('');
 useEffect(()=>{const controller=new AbortController();setCandidates([]);setSerialError('');const serial=normalizedEquipmentSerial(input.serial);if(!serial||input.noSerial){setChecking(false);return;}setChecking(true);const timer=setTimeout(async()=>{try{const r=await fetch('/api/workshop/equipment?serial='+encodeURIComponent(input.serial),{signal:controller.signal,cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);setCandidates(body.rows||[]);}catch(e){if(!controller.signal.aborted)setSerialError((e as Error).message);}finally{if(!controller.signal.aborted)setChecking(false);}},350);return()=>{clearTimeout(timer);controller.abort();};},[input.serial,input.noSerial]);
 const request=useRef<string|null>(null);
 const internalReservation=useRef<string|null>(null),previousSerial=useRef('');
 function change<K extends keyof typeof input>(key:K,value:(typeof input)[K]){setInput(current=>({...current,[key]:value,...(key==='ownership'&&value==='customer'&&current.type==='piston-unit'?{type:''}:{})}));request.current=null;setError('');}
 async function toggleInternalSerial(checked:boolean){
  request.current=null;setError('');
  if(!checked){setInput(current=>({...current,internalSerial:false,internalSerialId:'',serial:previousSerial.current}));return;}
  previousSerial.current=input.serial;
  internalReservation.current??=crypto.randomUUID();
  setBusy(true);onBusy(true);
  try{
   const response=await fetch('/api/workshop/equipment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reserve-internal-serial',reservationId:internalReservation.current})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível gerar a série interna.');
   setInput(current=>({...current,internalSerial:true,internalSerialId:result.id,serial:result.serial,noSerial:false}));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}
 }
 async function create(){
  let normalized;try{normalized=equipmentRegistrationInput(input);}catch(e){setError((e as Error).message);return;}
  if(input.ownership==='customer'&&!input.customerKey&&!onDraft){setError('Selecione o cliente para vincular o equipamento.');return;}
  if(!locked&&(checking||serialError||candidates.some(row=>row.exact))){setError('Confira os equipamentos encontrados pela série antes de cadastrar.');return;}
  if(onDraft){onDraft(normalized);return;}
  request.current??=crypto.randomUUID();setBusy(true);onBusy(true);setLocked(true);setError('');
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...normalized,requestId:request.current})});
   const result=await response.json();
   if(!response.ok){if(response.status>=400&&response.status<500){setLocked(false);request.current=null;}throw Error(result.error||'Não foi possível confirmar o cadastro.');}
   if(result.state==='complete'&&result.equipment){clearApiCache();window.dispatchEvent(new Event('equipment-created'));onCreated({...result.equipment,customerKey:input.customerKey});return;}
   if(result.state==='rejected'){setLocked(false);request.current=null;}
   setError(result.message||'O cadastro aguarda confirmação. Consulte novamente antes de reenviar.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}
 }
 const own=input.ownership==='own';
 let preview='';try{preview=equipmentRegistrationName(equipmentRegistrationInput(input,{requireInternalDetails:false}));}catch{}
 const separator=own&&input.type==='separator',unit=own&&input.type==='piston-unit';
 return <section className="ws-register-equipment" aria-label="Adicionar equipamento">
  <div className="ws-register-heading"><h3>Adicionar equipamento</h3><button type="button" disabled={busy} onClick={onCancel}><ArrowLeft size={14}/>Voltar à pesquisa</button></div>
  <p className="ws-helper">Cadastre a máquina para selecioná-la no sistema.</p>{own&&<p className="ws-helper">Nome e apelido seguem o POP de locação. Preencha somente as características confirmadas na plaqueta ou documentação; dados opcionais não informados serão omitidos.</p>}
  <fieldset disabled={busy||locked}>
   <legend>{customerOnly?'Dados do equipamento':'Propriedade do equipamento'}</legend>
   {!customerOnly&&<div className="ws-register-ownership">{[['customer','Equipamento de cliente'],['own','Equipamento Próprio']].map(([value,label])=><label className="ws-check" key={value}><input type="radio" name="equipmentOwnership" value={value} checked={input.ownership===value} onChange={()=>change('ownership',value)}/>{label}</label>)}</div>}
   {!own&&<div><label>Cliente *{customer?<input readOnly value={customer.name}/>:onDraft?<input readOnly value="Novo Lead — vínculo será salvo ao confirmar a visita"/>:<OrderSearchSelect label="Cliente do equipamento" value={input.customerKey} selectedLabel={customerName} endpoint="/api/visits/customers" placeholder="Pesquise o cliente" onChange={row=>{change('customerKey',row.id);setCustomerName(row.name);}}/>}</label><small>Pesquise todos os clientes da base, inclusive os que ainda não possuem máquinas. O vínculo com clientes cadastrados no M8 é realizado automaticamente.</small></div>}
   <label>Tipo do equipamento *<select value={input.type} onChange={e=>change('type',e.target.value)}><option value="">Selecione o tipo</option>{workshopEquipmentTypes.filter(type=>own||!('ownOnly' in type)).map(type=><option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
   <div className="ws-form-grid"><label>{separator?'Modelo':'Modelo *'}<input value={input.model} maxLength={100} onChange={e=>change('model',e.target.value)}/></label><label>{input.internalSerial?'Série interna':own&&input.noSerial?'Série':'Série *'}<input value={own&&input.noSerial?'N/C':input.serial} disabled={own&&input.noSerial} readOnly={input.internalSerial} maxLength={100} onChange={e=>change('serial',e.target.value)}/></label></div>
   <label className="ws-check"><input type="checkbox" checked={input.internalSerial} onChange={e=>void toggleInternalSerial(e.target.checked)}/>Cadastrar número de série interno</label>
   {input.internalSerial&&<small>Identificação interna gerada pelo sistema para equipamento sem etiqueta de série. Este número fica reservado e não será reutilizado.</small>}
   <div className="ws-form-grid"><label>Marca<input value={input.brand} maxLength={100} onChange={e=>change('brand',e.target.value)}/></label>{source==='visits'&&<label>Horímetro (h)<input type="number" min="0" step="0.01" value={input.meter} onChange={e=>change('meter',e.target.value)}/></label>}</div>
   {checking&&<p role="status">Conferindo número de série…</p>}
   {serialError&&<p role="alert">{serialError}</p>}
   {!!candidates.length&&<div className="ws-serial-matches"><strong>Possíveis equipamentos já cadastrados</strong>{candidates.map(row=><div key={row.id}><p>{row.id} · {row.name}<small>Série: {row.serial} · {row.client||'Cliente não informado'}{row.exact?' · Série equivalente':''}</small></p><button type="button" disabled={busy||(!own&&!input.customerKey)} onClick={async()=>{setBusy(true);onBusy(true);setError('');try{if(own){onCreated(row);return;}const response=await fetch('/api/workshop/equipment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'link-existing',equipmentId:row.id,customerKey:input.customerKey,source})});const result=await response.json();if(!response.ok)throw Error(result.error);clearApiCache();window.dispatchEvent(new Event('equipment-created'));onCreated({...result.equipment,customerKey:input.customerKey});}catch(e){setError((e as Error).message);}finally{setBusy(false);onBusy(false);}}}>Usar este equipamento</button></div>)}</div>}
   {own&&<div className="ws-register-internal"><h4>Identificação, dimensões e peso</h4><label>Código de Identificação Interno *<input required value={input.internalCode} maxLength={100} onChange={e=>change('internalCode',e.target.value)}/></label><div className="ws-form-grid">{([['height','Altura (m)'],['width','Largura (m)'],['length','Comprimento (m)'],['weight','Peso bruto (kg)']] as const).map(([key,label])=><label key={key}>{label} *<input required type="number" min="0.001" max="1000000000" step="0.001" inputMode="decimal" value={input[key]} onChange={e=>change(key,e.target.value)}/></label>)}</div></div>}
   {own&&!input.internalSerial&&<label className="ws-check"><input type="checkbox" checked={input.noSerial} onChange={e=>change('noSerial',e.target.checked)}/>Confirmo que o equipamento não possui série disponível</label>}
   {separator&&<div className="ws-form-grid"><label>Configuração<input value={input.configuration} maxLength={80} placeholder="Ex.: VERTICAL" onChange={e=>change('configuration',e.target.value)}/></label><label>Capacidade (L)<input type="number" min="0" step="0.001" inputMode="decimal" value={input.capacity} onChange={e=>change('capacity',e.target.value)}/></label></div>}
   <div className="ws-register-specs">{(['hp','pcm','bar'] as const).filter(key=>!own||(key==='hp'?!['dryer','separator'].includes(input.type):key==='pcm'?!separator:!['dryer','piston-unit'].includes(input.type))).map(key=><label key={key}>{key.toUpperCase()}<input type="number" min="0" max="1000000000" step="0.001" inputMode="decimal" value={input[key]} onChange={e=>change(key,e.target.value)}/></label>)}</div>
   {own&&['piston','separator'].includes(input.type)&&<div className="ws-form-grid"><label>Pressão adicional<input type="number" min="0" step="0.001" inputMode="decimal" value={input.pressure} onChange={e=>change('pressure',e.target.value)}/></label><label>Unidade da pressão adicional<select value={input.pressureUnit} onChange={e=>change('pressureUnit',e.target.value)}><option value="PSI">PSI</option><option value="LBS">LBS</option></select></label></div>}
   {own&&!separator&&!unit&&<div className="ws-form-grid"><label>Tensão (V)<input value={input.voltage} maxLength={50} placeholder="Ex.: 380 ou 220/380" onChange={e=>change('voltage',e.target.value)}/></label><label>Frequência (HZ)<input type="number" min="0" step="0.001" inputMode="decimal" value={input.frequency} onChange={e=>change('frequency',e.target.value)}/></label></div>}
   {own&&<label>Características<input value={input.characteristics} maxLength={150} placeholder="Ex.: SOBRE BASE, COM RESERVATÓRIO ou 5 CILINDROS" onChange={e=>change('characteristics',e.target.value)}/></label>}
   {own&&<div className="ws-form-grid"><label>Valor de venda (R$)<input type="number" min="0" max="1000000000" step="0.01" inputMode="decimal" value={input.price} onChange={e=>change('price',e.target.value)}/></label><label>Valor de venda mínimo (R$)<input type="number" min="0" max="1000000000" step="0.01" inputMode="decimal" value={input.minimumPrice} onChange={e=>change('minimumPrice',e.target.value)}/></label></div>}
   <label>Informações complementares<textarea rows={3} maxLength={2000} value={input.notes} onChange={e=>change('notes',e.target.value)}/></label>
  </fieldset>
  {preview&&<p className="ws-register-preview"><small>Nome do equipamento</small><strong>{preview}</strong></p>}
  {error&&<p role="alert" className="ws-error">{error}</p>}
  <div className="ws-register-actions"><button className="ws-primary" type="button" disabled={busy||(!locked&&(checking||!!serialError||candidates.some(row=>row.exact)))} onClick={()=>void create()}>{busy?'Confirmando cadastro…':locked?'Consultar confirmação':<><Plus size={15}/>Cadastrar e selecionar</>}</button><small><CheckCircle2 size={13}/>{actionHint||(own?'A entrada será registrada na confirmação abaixo.':onDraft||input.customerKey.startsWith('lead:')?'O vínculo será concluído quando o cliente tiver cadastro no M8.':'O equipamento será cadastrado e vinculado automaticamente ao cliente no M8.')}</small></div>
 </section>;
}
