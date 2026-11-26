export function canEditProposalReview(workflow: {reviewer?:string|null;review_requested_by?:string|null}, actor:string) {
 return !!actor && (workflow.reviewer === actor || workflow.review_requested_by === actor);
}
