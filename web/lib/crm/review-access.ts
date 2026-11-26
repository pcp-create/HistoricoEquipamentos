export function canEditProposalReview(workflow: {reviewer?:string|null;review_requested_by?:string|null}, actor:string, isAdmin=false) {
 return !!actor && (isAdmin || workflow.reviewer === actor || workflow.review_requested_by === actor);
}
