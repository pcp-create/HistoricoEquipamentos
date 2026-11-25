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
