import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {equipmentRegistrationInput,equipmentRegistrationPayload,equipmentRegistrationName,workshopEquipmentTypes} from '../lib/workshop/equipment-registration-model';
import {registerWorkshopEquipment} from '../lib/workshop/equipment-registration';
import {M8RequestError} from '../lib/service-orders/m8';
const internalDetails={internalCode:'00042',height:'1.2',width:'0.8',length:'2.1',weight:'500.5'};
const customer={ownership:'customer',type:'screw',model:'GA 30',serial:'SN1234',hp:'40',pcm:'180.5',bar:'8.5',notes:'Revisão geral'};
test('equipment defaults enforce the requested names, fiscal codes, optional quantities and prices',()=>{
 const input=equipmentRegistrationInput({...customer,origin:'EstrangeiraImportacaoDireta',grupoEstoqueId:1,ncm:'99999999'}),payload=equipmentRegistrationPayload(input,{family:1,unit:1});
 assert.equal(payload.nome,'COMPRESSOR PARAFUSO - MODELO GA 30 - SÉRIE SN1234');assert.equal(payload.apelido,payload.nome);assert.equal(payload.origem,'Nacional');
 assert.equal(equipmentRegistrationName(equipmentRegistrationInput({...customer,model:'ga 30',serial:'sn1234'})),payload.nome);
 assert.equal(payload.grupoEstoqueId,97);assert.equal(payload.ncm,'00000000');assert.equal(payload.codigoGenero,'00');assert.equal(payload.codigoTipoSped,'07');assert.ok(!('precoVenda' in payload));
 assert.match(payload.informacoesComplementares!,/40 HP · 180.5 PCM · 8.5 BAR\nRevisão geral/);
 for(const type of workshopEquipmentTypes){
  const own=equipmentRegistrationInput({...customer,ownership:'own',...internalDetails,type:type.id,price:'1000,50',minimumPrice:'900'}),p=equipmentRegistrationPayload(own,{family:3,unit:1,category:1});
  assert.ok('tipoProduto' in p);
  assert.equal(p.codigoIdentificacaoInterno,'00042');assert.equal(p.produtoAltura,1.2);assert.equal(p.produtoLargura,0.8);assert.equal(p.produtoComprimento,2.1);assert.equal(p.pesoBruto,500.5);assert.equal(p.tipoPeso,'Quilo');
  assert.equal(p.nome,p.nome.toLocaleUpperCase('pt-BR'));assert.equal(p.apelido,p.nome);
  assert.ok('tipoProduto' in p);assert.equal(p.tipoProduto,'EquipamentoProduto');assert.equal(p.modeloResumido,own.model);assert.equal(p.potencia,own.hp??undefined);assert.ok(!('modeloGerador' in p));assert.ok(!('numeroSerieGerador' in p));assert.match(p.informacoesComplementares!,/Série: SN1234/);
  assert.equal(p.ncm,type.ncm);assert.equal(p.codigoTipoSped,'00');assert.equal(p.codigoGenero,'84');assert.equal(p.grupoEstoqueId,96);assert.equal(p.familiaId,3);assert.equal(p.categoriaId,1);assert.equal(p.precoVenda,1000.5);assert.equal(p.precoVendaMinimo,900);
 }
 const optional=equipmentRegistrationInput({ownership:'own',...internalDetails,type:'dryer',model:'D20',serial:'12'});assert.equal(optional.hp,null);const optionalPayload=equipmentRegistrationPayload(optional,{family:3,unit:1,category:1});assert.ok('precoVenda' in optionalPayload);assert.equal(optionalPayload.precoVenda,0);
 for(const patch of [{model:''},{serial:''},{type:'other'},{ownership:'other'},{hp:'-1'},{pcm:'NaN'},{bar:'0.0001'},{ownership:'own',...internalDetails,price:'5',minimumPrice:'6'}])assert.throws(()=>equipmentRegistrationInput({...customer,...patch}));
});
test('equipment creation writes once, immediately selects the saved catalog entry and protects uncertain requests',async()=>{
 const db=new PGlite(),g=globalThis as any,old=g.historyPool;
 const query=(sql:string,args?:any[])=>db.query(sql.replace('BEGIN READ WRITE','BEGIN'),args);
 g.historyPool={query,connect:async()=>({query,release(){}})};
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE web_user_access(email text,enabled boolean);INSERT INTO web_user_access VALUES('user',true),('disabled',false);
  CREATE TABLE m8_equipment_catalog(company_id int,equipment_id bigint PRIMARY KEY,name text,alias text,model text,models text[],serial text,serial_source text,issues jsonb,payload jsonb,present boolean,collected_at timestamptz);`);
  await db.exec(readFileSync('sql/088_workshop_equipment_registrations.sql','utf8'));
  const writes:any[]=[],session=async(company:number)=>async(path:string,body?:any)=>{
   assert.equal(company,1);
   if(body){assert.equal(path,body.tipoProduto==='EquipamentoProduto'?'/v1/estoque/produto':'/v1/estoque/equipamento');writes.push(body);return {id:122+writes.length};}
   if(path.includes('/familia?'))return [{id:1,nome:'USO E CONSUMO'},{id:3,nome:'EQUIPAMENTO DE LOCAÇÃO'}];
   if(path.includes('/unidade?'))return [{id:1,nome:'UNIDADE',abreviatura:'UN'}];
   if(path.includes('/categoria?'))return [{id:1,nome:'DIVERSOS'}];
   return [{id:97,nome:'EQUIPAMENTOS DE CLIENTES'},{id:96,nome:'EQUIPAMENTOS USADOS (COMPRESSORES, SEPARADORES, SECADORES, MOTORES)'}];
  };
  const input={...customer,requestId:randomUUID()};

  await assert.rejects(registerWorkshopEquipment(input,'disabled',session as any),/acesso/);
  const result=await registerWorkshopEquipment(input,'user',session as any);assert.equal(result.state,'complete');assert.equal(result.equipment?.id,'123');assert.equal(result.equipment?.serial,customer.serial);
  assert.equal((await registerWorkshopEquipment(input,'user',session as any)).equipment?.id,'123');assert.equal(writes.length,1);
  await db.query("UPDATE m8_equipment_catalog SET name='Nome atualizado no ERP' WHERE equipment_id=123");
  await registerWorkshopEquipment(input,'user',session as any);
  assert.equal((await db.query<any>('SELECT name FROM m8_equipment_catalog WHERE equipment_id=123')).rows[0].name,'Nome atualizado no ERP');
  assert.equal((await db.query<any>('SELECT * FROM m8_equipment_catalog')).rows[0].payload.grupoEstoqueId,97);
  await assert.rejects(registerWorkshopEquipment({...input,serial:'changed'},'user',session as any),/outro cadastro/);
  await assert.rejects(registerWorkshopEquipment({...input,requestId:randomUUID()},'user',session as any),/já está cadastrado/);
  const own={...input,ownership:'own',...internalDetails,type:'piston',model:'P100',serial:'OWN124',price:'15000',minimumPrice:'14000',requestId:randomUUID()};
  const ownResult=await registerWorkshopEquipment(own,'user',session as any);
  assert.equal(ownResult.state,'complete');assert.equal(ownResult.equipment?.id,'124');
  assert.equal((await registerWorkshopEquipment(own,'user',session as any)).equipment?.id,'124');
  assert.equal(writes.length,2);assert.equal(writes[1].tipoProduto,'EquipamentoProduto');assert.equal(writes[1].grupoEstoqueId,96);assert.equal(writes[1].ncm,'84148011');assert.equal(writes[1].precoVenda,15000);assert.equal(writes[1].modeloResumido,'P100');
  assert.equal((await db.query<any>('SELECT payload FROM m8_equipment_catalog WHERE equipment_id=124')).rows[0].payload.familiaId,3);
  let attempts=0;const uncertain=async(company:number)=>{const api=await session(company);return async(path:string,body?:any)=>{if(body){attempts++;throw new M8RequestError('Confira o ERP',true);}return api(path);};};
  const lost={...customer,serial:'UNKNOWN123',requestId:randomUUID()};
  assert.equal((await registerWorkshopEquipment(lost,'user',uncertain as any)).state,'uncertain');
  assert.equal((await registerWorkshopEquipment(lost,'user',uncertain as any)).state,'uncertain');assert.equal(attempts,1);
  await assert.rejects(registerWorkshopEquipment({...lost,requestId:randomUUID()},'user',uncertain as any),/aguardando confirmação/);assert.equal(attempts,1);
  const withoutSerial={...customer,ownership:'own',...internalDetails,type:'piston-unit',model:'W900',serial:'N/C',noSerial:true,requestId:randomUUID()};
  const firstMissing=await registerWorkshopEquipment(withoutSerial,'user',session as any);
  const replayMissing=await registerWorkshopEquipment(withoutSerial,'user',session as any);assert.equal(firstMissing.equipment?.id,replayMissing.equipment?.id);
  const secondMissing=await registerWorkshopEquipment({...withoutSerial,internalCode:'00043',requestId:randomUUID()},'user',session as any);assert.notEqual(firstMissing.equipment?.id,secondMissing.equipment?.id);
  assert.equal(writes.length,4);
  const legacy={ownership:'own',type:'screw',model:'GA LEGACY',serial:'LEGACY130',requestId:randomUUID()};
  await db.query("INSERT INTO web_workshop_equipment_registrations(id,actor,document,payload,state,equipment_id) VALUES($1,'user',$2,$3,'complete',130)",[legacy.requestId,JSON.stringify({ownership:'own',type:'screw',model:'GA LEGACY',serial:'LEGACY130'}),JSON.stringify({nome:'COMPRESSOR PARAFUSO - GA LEGACY - SÉRIE LEGACY130',familiaId:3})]);
  assert.equal((await registerWorkshopEquipment(legacy,'user',session as any)).equipment?.id,'130');assert.equal(writes.length,4);
  await assert.rejects(registerWorkshopEquipment({...legacy,serial:'NEW130',requestId:randomUUID()},'user',session as any),/Código de Identificação Interno/);assert.equal(writes.length,4);
  const misconfigured=async()=>async()=>[];
  await assert.rejects(registerWorkshopEquipment({...customer,serial:'CONFIG',requestId:randomUUID()},'user',misconfigured as any),/cadastro automático/);
 }finally{g.historyPool=old;await db.close();}
});


test('owned equipment names follow every POP order and do not invent unavailable characteristics',()=>{
 const cases:[Record<string,unknown>,string][]=[
  [{type:'screw',model:'Rotor Plus 25',serial:'57885',hp:'25',pcm:'96.6',bar:'9',voltage:'380',frequency:'60',characteristics:'Sobre Base'},'COMPRESSOR PARAFUSO 25HP - 96,6PCM - ROTOR PLUS 25 - 9,0BAR - 380V/60HZ - SOBRE BASE - SÉRIE 57885'],
  [{type:'piston',model:'CPV 20/200',serial:'23783',pcm:'20',hp:'5',pressure:'175',pressureUnit:'LBS',voltage:'220/380',frequency:'60'},'COMPRESSOR PISTÃO 20PCM - CPV 20/200 - 5HP - 175LBS - 220/380V/60HZ - SÉRIE 23783'],
  [{type:'piston-unit',model:'W900',noSerial:true,pcm:'60',hp:'15',characteristics:'5 cilindros',bar:'8',voltage:'380',frequency:'60'},'UNIDADE COMPRESSORA PISTÃO 60PCM - W900 - 15HP - 5 CILINDROS - SÉRIE N/C'],
  [{type:'piston-unit',model:'CJ60',noSerial:true,pcm:'60',hp:'15'},'UNIDADE COMPRESSORA PISTÃO 60PCM - CJ60 - 15HP - SÉRIE N/C'],
  [{type:'dryer',model:'Titan Plus 150',noSerial:true,pcm:'150',voltage:'220',frequency:'60',hp:'20',bar:'12'},'SECADOR DE AR 150PCM - TITAN PLUS 150 - 220V/60HZ - SÉRIE N/C'],
  [{type:'separator',model:'SC425',serial:'630088',configuration:'Vertical',capacity:'425',pressure:'175',pressureUnit:'PSI',bar:'12'},'SEPARADOR CONDENSADO VERTICAL 425L - SC425 - 175PSI/12BAR - SÉRIE 630088'],
  [{type:'separator',serial:'947',configuration:'VERTICAL',capacity:'1000',bar:'10'},'SEPARADOR CONDENSADO VERTICAL 1000L - 10,0BAR - SÉRIE 947'],
  [{type:'screw',model:' GA30 ',serial:'SN500'},'COMPRESSOR PARAFUSO - GA30 - SÉRIE SN500'],
 ];
 for(const [fields,name] of cases){
  const input=equipmentRegistrationInput({ownership:'own',...internalDetails,...fields});assert.equal(equipmentRegistrationName(input),name);
  const payload=equipmentRegistrationPayload(input,{family:3,unit:1,category:1});assert.equal(payload.nome,name);assert.equal(payload.apelido,name);
  if(input.type==='piston-unit')assert.equal(payload.ncm,'84148011');
  if('modeloResumido' in payload)assert.equal(payload.modeloResumido,input.model);else assert.equal(input.model,'');
 }
 const absent=equipmentRegistrationInput({ownership:'own',...internalDetails,type:'screw',model:'GA30',serial:'SN500'});
 assert.ok(!equipmentRegistrationName(absent).includes('HZ'));assert.ok(!equipmentRegistrationName(absent).includes('HP'));
 for(const fields of [{serial:'N/C'},{serial:'NC'},{noSerial:'true'},{voltage:'380V/60HZ'},{frequency:-1},{pressure:175,pressureUnit:'BAR'}])assert.throws(()=>equipmentRegistrationInput({ownership:'own',...internalDetails,type:'piston',model:'P20',serial:'SN500',...fields}));
 assert.throws(()=>equipmentRegistrationInput({...customer,type:'piston-unit'}),/tipo de equipamento de cliente/);
});


test('internal equipment requires its code and every positive dimension and weight; customer equipment does not',()=>{
 const own={...customer,ownership:'own',...internalDetails};
 for(const key of ['internalCode','height','width','length','weight']){
  for(const value of [undefined,'','   '])assert.throws(()=>equipmentRegistrationInput({...own,[key]:value}));
 }
 for(const key of ['height','width','length','weight'])for(const value of ['0','-1','NaN','1.0001',Infinity])assert.throws(()=>equipmentRegistrationInput({...own,[key]:value}));
 const valid=equipmentRegistrationInput(own);assert.equal(valid.internalCode,'00042');assert.equal(valid.weight,500.5);
 assert.equal(equipmentRegistrationInput(customer).height,null);
 assert.equal(equipmentRegistrationInput({...customer,...internalDetails}).internalCode,'');
});
