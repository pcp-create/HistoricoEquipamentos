import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {POST} from '../app/api/localities/automation/route';
test('location automation authenticates independently of user sessions and reports missing provider configuration',async()=>{
 const token=process.env.TASK_AUTOMATION_TOKEN,geo=process.env.GEOAPIFY_API_KEY;
 try{
 process.env.TASK_AUTOMATION_TOKEN='fixture-only-automation-token-123456789';delete process.env.GEOAPIFY_API_KEY;
 assert.equal((await POST(new Request('https://example.test/api/localities/automation',{method:'POST'}))).status,401);
 assert.equal((await POST(new Request('https://example.test/api/localities/automation',{method:'POST',headers:{Authorization:'Bearer '+process.env.TASK_AUTOMATION_TOKEN}}))).status,503);
 }finally{
 if(token===undefined)delete process.env.TASK_AUTOMATION_TOKEN;else process.env.TASK_AUTOMATION_TOKEN=token;
 if(geo===undefined)delete process.env.GEOAPIFY_API_KEY;else process.env.GEOAPIFY_API_KEY=geo;
 }
 const workflow=JSON.parse(readFileSync('../automations/n8n/clientes-localizacoes.json','utf8'));
 const http=workflow.nodes.find((n:any)=>n.type==='n8n-nodes-base.httpRequest');
 assert.equal(http.parameters.url,'https://rjcompressores.app/api/localities/automation');
 assert.equal(http.parameters.method,'POST');
 assert.equal(http.parameters.genericAuthType,'httpHeaderAuth');
 assert.equal(workflow.active,false);
 assert.equal(workflow.nodes.find((n:any)=>n.type==='n8n-nodes-base.scheduleTrigger').parameters.rule.interval[0].expression,'* * * * *');
 for(const branch of Object.values(workflow.connections) as any[])assert.equal(branch.main[0][0].node,http.name);
});
