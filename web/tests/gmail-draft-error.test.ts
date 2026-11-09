import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gmailDraftError} from '../lib/service-scheduling/gmail-draft-error';
test('Gmail failures distinguish disabled API, expired token, missing scope, domain policy and quota',()=>{
 assert.equal(gmailDraftError(403,{error:{details:[{reason:'SERVICE_DISABLED'}]}}).enableApi,true);
 assert.equal(gmailDraftError(403,{error:{errors:[{reason:'accessNotConfigured'}]}}).enableApi,true);
 assert.match(gmailDraftError(401,{}).message,/expirou/);
 assert.match(gmailDraftError(403,{error:{details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}}).message,/permissão/);
 assert.match(gmailDraftError(403,{error:{errors:[{reason:'domainPolicy'}]}}).message,/administrador/);
 assert.match(gmailDraftError(429,{}).message,/limite/);
 assert.match(gmailDraftError(400,{error:{status:'INVALID_ARGUMENT'}}).message,/HTTP 400 · INVALID_ARGUMENT/);
 assert.doesNotMatch(gmailDraftError(500,{error:{message:'private recipient and token'}}).message,/private recipient/);
});
