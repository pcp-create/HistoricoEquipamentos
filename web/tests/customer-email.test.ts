import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailBodyHtml} from '../lib/service-scheduling/email-body-html';
import {emailTextHtml,validEmailLink} from '../lib/service-scheduling/email-body-text';
import {emailMessage} from '../lib/service-scheduling/customer-email';
import {defaultCustomerEmail,validateCustomerEmail,fillCustomerEmail,fillCustomerEmailHtml} from '../lib/service-scheduling/customer-email-template';
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

test('formatted messages produce alternative text/HTML parts and preserve the PDF',()=>{
 const input={to:'a@example.com',subject:'Relatório',body:'Olá, relatório revisado',bodyHtml:'<p style="text-align: center"><strong>Olá</strong>, <em>relatório</em> <u>revisado</u></p><ul><li><p><a href="https://example.com">Link</a></p></li></ul>',filename:'OS 123.pdf',pdf:Buffer.from('%PDF-1.7')};
 const mime=emailMessage(input);
 assert.match(mime,/Content-Type: multipart\/alternative/);
 const encoded=mime.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
 assert.equal(Buffer.from(encoded.replace(/\s/g,''),'base64').toString(),emailBodyHtml(input.bodyHtml));
 assert.match(mime,/Content-Type: application\/pdf/);
 assert.ok(mime.includes(input.pdf.toString('base64')));
 assert.ok(mime.split('\r\n').every(line=>line.length<=998));
});
test('message HTML strips executable content and unsafe pasted styles and links',()=>{
 const safe=emailBodyHtml('<p onclick="alert(1)" style="color:#ff0000;position:fixed;background-image:url(https://evil.com)"><strong>Texto</strong><script>alert(1)</script><iframe src="https://evil.com"></iframe><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">Link</a></p>')!;
 assert.match(safe,/<strong>Texto<\/strong>/);assert.match(safe,/color:#ff0000/);
 assert.doesNotMatch(safe,/onclick|onerror|<script|<iframe|<img|javascript:|position:|background-image/);
 assert.throws(()=>emailBodyHtml('<p><br></p>'),/texto/);
 assert.throws(()=>emailBodyHtml('a'.repeat(100001)),/limite/);
 assert.equal(emailTextHtml('Olá <script> & teste\nNova linha'),'<p>Olá &lt;script&gt; &amp; teste<br>Nova linha</p>');
 assert.equal(validEmailLink('javascript:alert(1)'),false);assert.equal(validEmailLink('https://example.com'),true);
});

test('formatted defaults validate their size and escape dynamic values without losing marks',()=>{
 const config=validateCustomerEmail({body:'Olá {cliente}',bodyHtml:'<p><strong>Olá {cliente}</strong></p><p>{equipamento}</p>'});
 assert.match(config.bodyHtml,/<strong>/);
 const html=fillCustomerEmailHtml(config.bodyHtml,{cliente:'A & B <img src=x onerror=alert(1)>',equipamento:'Compressor ABC\nSecador DEF'});
 assert.match(html,/<strong>Olá A &amp; B &lt;img/);assert.match(html,/Compressor ABC<br>Secador DEF/);assert.doesNotMatch(html,/<img/);
 assert.throws(()=>validateCustomerEmail({bodyHtml:'x'.repeat(100001)}),/formatado/);
});
