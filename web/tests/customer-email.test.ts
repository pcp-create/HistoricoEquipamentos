import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailMessage} from '../lib/service-scheduling/customer-email';
import {defaultCustomerEmail,validateCustomerEmail,fillCustomerEmail} from '../lib/service-scheduling/customer-email-template';
test('email draft includes the PDF itself, encoded Portuguese text and safe headers',()=>{
 const pdf=Buffer.from('%PDF-1.7\nconteúdo do relatório');
 const mime=emailMessage({to:'cliente@example.com',subject:'Relatório técnico da manutenção',body:'Olá, segue em anexo.\nAtenciosamente, João.',filename:'OS 15253 - Cliente CCP Série ABC.pdf',pdf});
 assert.match(mime,/X-Unsent: 1\r\nTo: cliente@example.com/);
 assert.match(mime,/Content-Type: application\/pdf/);
 assert.ok(mime.includes(pdf.toString('base64')));
 assert.ok(mime.includes(Buffer.from('Olá, segue em anexo.\nAtenciosamente, João.').toString('base64')));
 assert.match(mime,/filename\*0\*=UTF-8''OS%2015253/);
 assert.ok(mime.split('\r\n').every(line=>line.length<=998));
 assert.throws(()=>emailMessage({to:'victim@example.com\r\nBcc: x@y.com',subject:'Teste',body:'Texto',filename:'x.pdf',pdf}),/destinatários/);
 assert.throws(()=>emailMessage({to:'a@b.com',subject:'Teste\r\nBcc: x@y.com',body:'Texto',filename:'x.pdf',pdf}),/assunto/);
});
test('email settings validate templates and expand only the supported placeholders',()=>{
 assert.deepEqual(validateCustomerEmail(undefined),defaultCustomerEmail);
 assert.equal(fillCustomerEmail('OS {os} · {cliente} · {responsavel}',{os:'15253',cliente:'Cliente',responsavel:'João'}),'OS 15253 · Cliente · João');
 assert.throws(()=>validateCustomerEmail({subject:'Assunto\nCabeçalho'}),/assunto/);
 assert.throws(()=>validateCustomerEmail({gmailClientId:'segredo'}),/Client ID/);
 assert.equal(validateCustomerEmail({gmailClientId:'123-public.apps.googleusercontent.com'}).gmailClientId,'123-public.apps.googleusercontent.com');
});

test('multiple recipients are normalized and unsafe attachment names rejected',()=>{
 const base={subject:'Teste',body:'Mensagem',filename:'OS 123 - Cliente.pdf',pdf:new Uint8Array()};
 const mime=emailMessage({...base,to:'a@example.com; b@example.com, a@example.com'});
 assert.match(mime,/To: a@example.com,\r\n b@example.com\r\n/);
 assert.match(mime,/filename="OS 123 - Cliente.pdf"/);
 assert.throws(()=>emailMessage({...base,to:'a@example.com,invalid'}),/válidos/);
 assert.throws(()=>emailMessage({...base,to:'a@example.com',filename:'file.pdf\r\nBcc: victim@example.com'}),/anexo/);
});
