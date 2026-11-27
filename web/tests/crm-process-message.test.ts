import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crmProcessMessage} from '../lib/tasks/crm-process-message';
const task={source_key:'manual:crm-review:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002',task_id:'42',title:'PROP-7',source_status:'Proposta revisada',assignment_reason:'Responsabilidade transferida ao vendedor',assignee_name:'Vendedor',customer:'Cliente'};
test('reviewed notification includes proposal and task links',()=>{
 const message=crmProcessMessage(task,'https://portal.test','Comentário antigo');
 assert.match(message,/Proposta revisada/);assert.match(message,/Responsabilidade transferida ao vendedor/);
 assert.match(message,/https:\/\/portal.test\/crm\/propostas\/00000000-0000-4000-8000-000000000001/);
 assert.match(message,/tarefas\?task=42/);assert.doesNotMatch(message,/Comentário antigo/);
});
test('warehouse and review messages describe the correct next action',()=>{
 assert.match(crmProcessMessage({...task,source_status:'Aguardando separação de peças'},'https://portal.test'),/Pedido gerado — separação de peças/);
 assert.match(crmProcessMessage({...task,source_status:'Aguardando revisão'},'https://portal.test','Confira os valores'),/Confira os valores/);
});
