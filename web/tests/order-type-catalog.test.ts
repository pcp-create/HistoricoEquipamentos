import {test} from "node:test";
import assert from "node:assert/strict";
import {orderTypeRows} from "../lib/order-type-model";
test("preserves active/inactive values and deduplicates by ID",()=>{
 const row={id:1,nome:"Corretiva",ativo:false};
 assert.deepEqual(orderTypeRows({data:[row,row,{id:2,nome:"Preventiva",ativo:true}],errors:[]}),[{id:"1",name:"Corretiva",active:false},{id:"2",name:"Preventiva",active:true}]);
});
test("rejects malformed values and conflicting duplicates before saving",()=>{
 for(const body of [{data:[{id:1,nome:"Tipo",ativo:"false"}]},{data:[{id:1,nome:"A",ativo:true},{id:1,nome:"B",ativo:true}]},{data:[],errors:["invalid"]},{}])assert.throws(()=>orderTypeRows(body));
});
test("quote types use descricao, preserve inactive records and require a description",()=>{
 assert.deepEqual(orderTypeRows({data:[{id:18,descricao:"Peças",ativo:false}]},"descricao"),[{id:"18",name:"Peças",active:false}]);
 assert.throws(()=>orderTypeRows({data:[{id:1,nome:"Não substitui descrição",ativo:true}]},"descricao"));
});

test("preserves the equipment-by-customer rule from M8",()=>{
 assert.equal(orderTypeRows({data:[{id:1,nome:"Corretiva",ativo:true,buscarEquipamentoPorCliente:true} ]})[0].customer_equipment_only,true);
 assert.equal(orderTypeRows({data:[{id:1,nome:"Corretiva",ativo:true,buscarEquipamentoPorCliente:false} ]})[0].customer_equipment_only,false);
});
