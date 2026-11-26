import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialProposalWorkflow,transitionProposalWorkflow as transition} from '../lib/crm/proposal-workflow';

test('revision increments only after a customer send and requires a new review',()=>{
 let workflow=initialProposalWorkflow();
 assert.throws(()=>transition(workflow,'send_customer'));
 workflow=transition(workflow,'request_review');
 workflow=transition(workflow,'complete_review');
 workflow=transition(workflow,'request_review');
 assert.equal(workflow.revision,0);
 workflow=transition(workflow,'complete_review');
 workflow=transition(workflow,'send_customer');
 assert.deepEqual(workflow,{state:'sent',revision:0,lastSentRevision:0});
 assert.throws(()=>transition(workflow,'send_customer'));
 workflow=transition(workflow,'request_review');
 assert.deepEqual(workflow,{state:'in_review',revision:1,lastSentRevision:0});
 workflow=transition(workflow,'complete_review');
 workflow=transition(workflow,'send_customer');
 workflow=transition(workflow,'request_review');
 assert.equal(workflow.revision,2);
});

test('reopening preserves sent revisions and returns to creating',()=>{
 const reopened=transition({state:'sent',revision:2,lastSentRevision:2},'reopen_proposal');
 assert.deepEqual(reopened,{state:'creating',revision:3,lastSentRevision:2});
 assert.equal(transition({state:'in_review',revision:0,lastSentRevision:null},'reopen_proposal').state,'creating');
 assert.throws(()=>transition(initialProposalWorkflow(),'reopen_proposal'));
});

test('creating proposal can be reviewed directly',()=>{assert.equal(transition(initialProposalWorkflow(),'complete_review').state,'reviewed');});
