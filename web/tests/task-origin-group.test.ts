import {test} from "node:test";
import assert from "node:assert/strict";
import {taskOriginGroup} from "../lib/tasks/origin-group";
test("kanban groups tasks by process without changing their source",()=>{
 assert.equal(taskOriginGroup({source_key:"preventive:1",origin:"Preventiva de Equipamento de Cliente"}),"Preventivas");
 assert.equal(taskOriginGroup({source_key:"preventive-group:2",origin:"Preventiva de Equipamento Próprio"}),"Preventivas");
 assert.equal(taskOriginGroup({source_key:"manual:order-report-task:1",origin:"Ordem de Serviço"}),"Revisão de relatórios");
 assert.equal(taskOriginGroup({source_key:"manual:order-report-task:1",origin:"Revisão de relatório",action_name:"Efetuar Fechamento"}),"Efetuar Fechamento");
 assert.equal(taskOriginGroup({source_key:"manual:order-report-task:2",origin:"Revisão de relatório",action_name:"Gerar Orçamento"}),"Gerar Orçamento");
 assert.equal(taskOriginGroup({source_key:"manual:order-report-task:3",action_name:"Conferir preventiva"}),"Conferir preventiva");
 assert.equal(taskOriginGroup({origin:"Revisão de relatório"}),"Revisão de relatórios");
 assert.equal(taskOriginGroup({origin:"Tarefa manual"}),"Tarefa manual");
 assert.equal(taskOriginGroup({source_key:"manual:restricted",origin:"Tarefa restrita"}),"Tarefa restrita");
});
