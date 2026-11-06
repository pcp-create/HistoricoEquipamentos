import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summaryReportFilename,pdfAttachmentHeader} from '../lib/service-scheduling/report-filename';
const order={numero_sequencia:15137,cliente_nome:'CLIENTE TESTE',modelo_equipamento:'GA90',numero_serie:'ABC123'};
test('summary filename identifies order, client, service abbreviation and the operation equipment',()=>{
 const op={document:{checklistRun:{template:{prefix:'CCP'}},equipmentId:'7',equipment:{model:'SRP 5050',serial:'43326'}}};
 assert.equal(summaryReportFilename(order,[op]),'OS 15137 - CLIENTE TESTE CCP SRP 5050 Série 43326.pdf');
 assert.equal(summaryReportFilename(order,[op,op]),summaryReportFilename(order,[op]));
 assert.equal(summaryReportFilename(order,[{document:{serviceType:'Manutenção Corretiva',equipmentUnassigned:true}}]),'OS 15137 - CLIENTE TESTE MC Sem equipamento específico.pdf');
 const label={document:{checklistRun:{template:{prefix:'CCP'}},equipmentId:'7',equipment:{label:'21956 – COMPRESSOR DE PARAFUSO – SRP 5050 – SÉRIE 43326'}}};
 assert.equal(summaryReportFilename(order,[label]),summaryReportFilename(order,[op]));
 assert.equal(summaryReportFilename(order,[{document:{serviceType:'Corretiva Compressor Parafuso'}}]),'OS 15137 - CLIENTE TESTE CCP GA90 Série ABC123.pdf');
});
test('download header preserves accents without allowing unsafe paths or header injection',()=>{
 const name=summaryReportFilename({...order,cliente_nome:'Cliente / João\r\nTeste'},[{document:{serviceType:'CCP'}}]);
 assert.ok(!/[\r\n/]/.test(name));
 const header=pdfAttachmentHeader(name);
 assert.match(header,/filename\*=UTF-8''OS%2015137/);
 assert.match(header,/Jo%C3%A3o/);
 assert.ok(!/[\r\n]/.test(header));
});
