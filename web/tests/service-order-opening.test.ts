import {test} from 'node:test';import assert from 'node:assert/strict';
import {localOrderHeader,restoredOpening} from '../lib/service-orders/opening-time';import {m8Session} from '../lib/service-orders/m8';
test('M8 local dates preserve the Brazilian opening day around midnight and only repair proven UTC conversions',()=>{
 const opening='2026-11-16T23:29:26-03:00';
 assert.equal(restoredOpening({emissao:'2026-11-17T02:29:26'},opening),'2026-11-16T23:29:26');
 assert.equal(restoredOpening({emissao:'2026-11-17T03:00:00'},opening),'2026-11-17T03:00:00');
 assert.equal(restoredOpening({emissao:'2026-11-16T23:29:26'},opening),'2026-11-16T23:29:26');
 assert.equal(restoredOpening({emissao:'2026-11-17T02:29:26Z'}),'2026-11-16T23:29:26');
 const original={emissao:opening,dataEntrega:'2026-11-16T00:00:00-03:00',dataEntregaPrevista:'2026-11-16T00:00:00-03:00',observacao:'Manter texto'};
 assert.deepEqual(localOrderHeader(original),{emissao:'2026-11-16T23:29:26',dataEntrega:'2026-11-16T00:00:00',dataEntregaPrevista:'2026-11-16T00:00:00',observacao:'Manter texto'});
 assert.equal(original.emissao,opening);
});
test('actual POST and PUT transport sends order headers as local wall time without changing child-item requests',async()=>{
 const env={...process.env};Object.assign(process.env,{M8_TENANT:'test',M8_USERNAME:'test',M8_PASSWORD:'test'});
 try{const bodies:any[]=[];const m8=await m8Session(1,async(url,options)=>{
  if(String(url).endsWith('/auth/token'))return Response.json({data:{token:'test'}});
  bodies.push(JSON.parse(String(options?.body)));return Response.json({data:{id:15424}});
 });
 const payload={emissao:'2026-11-16T23:29:26-03:00',dataEntrega:'2026-11-16T00:00:00-03:00'};
 await m8('/v1/assistenciatecnica/ordemservico',payload,'POST');await m8('/v1/assistenciatecnica/ordemservico/15424',payload,'PUT');await m8('/v1/assistenciatecnica/ordemservico/15424/produto',payload,'POST');
 assert.equal(bodies[0].emissao,'2026-11-16T23:29:26');assert.equal(bodies[1].emissao,'2026-11-16T23:29:26');assert.deepEqual(bodies[2],payload);
 }finally{process.env=env;}
});
