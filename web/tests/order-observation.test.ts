import {test} from 'node:test';import assert from 'node:assert/strict';
import {orderObservation,appendOrderObservation} from '../lib/service-scheduling/order-observation';
test('observation uses OS type, operation number, equipment and actual total meter; appending preserves history without duplication',()=>{
 const order={numero_sequencia:15174,tipo_nome:'01 - MANUTENÇÃO PREVENTIVA - AT'};
 const op={position:1,document:{equipment:{name:'COMPRESSOR PARAFUSO SK15',serial:'1282'},equipmentId:'1',checklistRun:{template:{stages:[{id:'s',name:'Leitura',fields:[{id:'ht',label:'Horímetro',type:'meter'}]}]},stages:{s:{answers:{ht:52534}}}}}};
 const text=orderObservation(order,[op]);
 assert.equal(text,'MANUTENÇÃO PREVENTIVA EM COMPRESSOR PARAFUSO SK15 - SÉRIE 1282.\n\nREALIZADO MANUTENÇÃO PREVENTIVA - RELATÓRIO Nº 15174/01 - HT: 52534');
 const notes=appendOrderObservation('Histórico anterior',text);assert.ok(notes.startsWith('Histórico anterior\n\n'));assert.equal(appendOrderObservation(notes,text),notes);
 const next=orderObservation(order,[op,{position:2,document:{equipmentUnassigned:true}}]);assert.match(next,/15174\/02 - HT: NÃO INFORMADO/);assert.equal(appendOrderObservation(notes,next).split('RELATÓRIO Nº 15174/01').length,2);
});
