import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crmReviewProposalPath} from '../lib/tasks/crm-review-link';

test('review tasks link to their proposal, including existing tasks',()=>{
 const proposal='933f4fbb-8976-4d84-b6b7-af605fdc76be';
 assert.equal(crmReviewProposalPath(`manual:crm-review:${proposal}:d839efa8-d8a6-43d9-9bba-7ff57641451a`),`/crm/propostas/${proposal}`);
 assert.equal(crmReviewProposalPath('manual:crm-review:../../admin:invalid'),null);
 assert.equal(crmReviewProposalPath('manual:other:123'),null);
});
