import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderServiceName,summaryReportFilename,pdfAttachmentHeader} from '../lib/service-scheduling/report-filename';
const order={tipo_nome:'001 - MANUTENÇÃO PREVENTIVA - AT',numero_sequencia:15137,cliente_nome:'CLIENTE TESTE',modelo_equipamento:'GA90',numero_serie:'ABC123'};
test('report filename uses short customer, OS service type and operation equipment',()=>{
 const op={document:{checklistRun:{template:{prefix:'CCP'}},equipmentId:'7',equipment:{model:'SRP 5050',serial:'43326'}}};
 assert.equal(summaryReportFilename(order,[op]),'OS 15137 - CLIENTE TESTE - MANUTENÇÃO PREVENTIVA - SRP 5050 - SÉRIE 43326.pdf');
 assert.equal(summaryReportFilename(order,[op,op]),summaryReportFilename(order,[op]));
 assert.equal(summaryReportFilename(order,[{document:{serviceType:'Manutenção Corretiva',equipmentUnassigned:true}}]),'OS 15137 - CLIENTE TESTE - MANUTENÇÃO PREVENTIVA - Sem equipamento específico.pdf');
 const label={document:{checklistRun:{template:{prefix:'CCP'}},equipmentId:'7',equipment:{label:'21956 – COMPRESSOR DE PARAFUSO – SRP 5050 – SÉRIE 43326'}}};
 assert.equal(summaryReportFilename(order,[label]),summaryReportFilename(order,[op]));
 assert.equal(summaryReportFilename(order,[{document:{serviceType:'Corretiva Compressor Parafuso'}}]),'OS 15137 - CLIENTE TESTE - MANUTENÇÃO PREVENTIVA - GA90 - SÉRIE ABC123.pdf');
});
test('download header preserves accents without allowing unsafe paths or header injection',()=>{
 const name=summaryReportFilename({...order,cliente_nome:'Cliente / João\r\nTeste'},[{document:{serviceType:'CCP'}}]);
 assert.ok(!/[\r\n/]/.test(name));
 const header=pdfAttachmentHeader(name);
 assert.match(header,/filename\*=UTF-8''OS%2015137/);
 assert.match(header,/Jo%C3%A3o/);
 assert.ok(!/[\r\n]/.test(header));
});

test('OS 15253 uses short customer, order type and equipment model instead of electrical ratings',()=>{
 const order={numero_sequencia:15253,cliente_nome:'MAGAZINE RURAL COMERCIO AGRICOLA LTDA - 36835352000104',tipo_nome:'01 - GARANTIA DE SERVIÇO - AT'};
 const op={document:{equipmentId:'22988',equipment:{label:'22988 - ZZ - SECADOR DE AR 30PCM - SRS 30 - 220V/60HZ - SÉRIE 10612'},checklistRun:{template:{prefix:'MS'}}}};
 assert.equal(summaryReportFilename(order,[op]),'OS 15253 - MAGAZINE RURAL - GARANTIA DE SERVIÇO - SRS 30 - SÉRIE 10612.pdf');
});

test('GAS is always expanded to GARANTIA DE SERVIÇO in customer-facing naming',()=>{
 for(const tipo_nome of ['GAS','gas','01 - GAS - AT','GAS - GARANTIA DE SERVIÇO']){
  assert.equal(orderServiceName({tipo_nome}),'GARANTIA DE SERVIÇO');
  assert.equal(summaryReportFilename({numero_sequencia:15253,cliente_nome:'MAGAZINE RURAL COMERCIO AGRICOLA LTDA',tipo_nome},[{document:{equipment:{model:'SRS 30',serial:'10612'}}}]),'OS 15253 - MAGAZINE RURAL - GARANTIA DE SERVIÇO - SRS 30 - SÉRIE 10612.pdf');
 }
});
