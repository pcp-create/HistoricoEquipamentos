import {test} from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";import vm from "node:vm";
import {materialBalance} from "../lib/service-scheduling/material-balance";
test("offline return preserves gross withdrawal, restores available balance and replays blank fields as unchanged",()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync("public/field-offline/project.js","utf8"),context);
 const home={email:"tech",displayName:"Técnico",active:null,rows:[]};
 const detail:any={operation:{id:"op",position:1,version:1,document:{}},checked:true,infoRead:true,history:[],materials:{complete:true,items:[{id_m8:"55",item_company:1,item_order:"100",quantidade:5,usage:{withdrawn:3,version:1,allocations:[{operationId:"op",quantity:3,by:"tech",at:"2026-10-29T10:00:00Z"}]}}]}};
 const body={action:"materials",quantityMode:"gross",items:[{id_m8:"55",item_company:1,item_order:"100",withdrawn:null,returned:1}],offline:{capturedAt:"2026-10-29T11:00:00Z"}};
 context.projectField(home,detail,body);
 const balance=materialBalance(detail.materials.items[0],"op");
 assert.equal(balance.ownGross,3);assert.equal(balance.ownReturned,1);assert.equal(balance.own,2);assert.equal(balance.available,3);
 context.projectField(home,detail,body);assert.equal(detail.materials.items[0].usage.withdrawn,2);
});

test('offline accumulated withdrawals require a reservation adjustment even when returns keep the net balance below the reserve',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync('public/field-offline/project.js','utf8'),context);
 const home={email:'tech',displayName:'Técnico',active:null,rows:[]};
 const detail:any={operation:{id:'op',position:1,version:1,document:{}},checked:true,infoRead:true,history:[],materials:{complete:true,items:[{id_m8:'55',item_company:1,item_order:'100',quantidade:4,usage:{withdrawn:2,version:1,allocations:[{operationId:'op',quantity:0,gross:1,returned:1,by:'tech'},{operationId:'other',quantity:2,gross:2,returned:0,by:'other'}]}}]}};
 const body={action:'materials',quantityMode:'gross',items:[{id_m8:'55',item_company:1,item_order:'100',withdrawn:3,returned:2}],offline:{capturedAt:'2026-10-29T11:00:00Z'}};
 assert.equal(materialBalance(detail.materials.items[0],'op').withdrawalMaximum,2);
 assert.throws(()=>context.projectField(home,detail,body),/ajuste da reserva/);
 assert.equal(detail.materials.items[0].usage.withdrawn,2);
 detail.materials.items[0].quantidade=5;
 context.projectField(home,detail,body);
 const balance=materialBalance(detail.materials.items[0],'op');assert.equal(balance.gross,5);assert.equal(balance.total,3);
});

test('saved returns can be corrected only above the quantity already received, including returns from other operations',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync('public/field-offline/project.js','utf8'),context);
 const home={email:'tech',rows:[],active:null};
 const item:any={id_m8:'55',item_company:1,item_order:'100',quantidade:10,received:{quantity:2},returnedTotal:3,usage:{withdrawn:3,allocations:[{operationId:'op',quantity:2,gross:4,returned:2},{operationId:'other',quantity:1,gross:2,returned:1}]}};
 const detail:any={operation:{id:'op',position:1,version:1,document:{}},history:[],materials:{items:[item]}};
 const body:any={action:'materials',quantityMode:'gross',items:[{id_m8:'55',item_company:1,item_order:'100',withdrawn:null,returned:0}],offline:{capturedAt:'2026-10-29T11:00:00Z'}};
 assert.equal(materialBalance(item,'op').returnMinimum,1);
 assert.throws(()=>context.projectField(home,detail,body),/quantidades/);
 body.items[0].returned=1;context.projectField(home,detail,body);
 assert.equal(materialBalance(item,'op').ownReturned,1);assert.equal(item.returnedTotal,2);
 body.items[0].returned=0;assert.throws(()=>context.projectField(home,detail,body),/quantidades/);
 item.received.quantity=0;context.projectField(home,detail,body);
 assert.equal(materialBalance(item,'op').ownReturned,0);assert.equal(materialBalance(item,'op').ownGross,4);
});
