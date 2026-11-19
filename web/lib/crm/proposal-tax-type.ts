import 'server-only';
import {database} from '../db';
import type {OrderDraft} from '../service-orders/model';
import {CrmError,positive} from './model';
/** Always resolve the current catalog mapping; never trust the draft's old/manual fiscal type. */
export async function applyProposalTaxType(draft:OrderDraft,typeId:unknown,db:Pick<ReturnType<typeof database>,'query'>=database()):Promise<OrderDraft>{
 const type=(await db.query('SELECT tax_budget_type FROM crm_proposal_types WHERE id=$1',[positive(typeId)])).rows[0];
 if(!type)throw new CrmError('Tipo de proposta não encontrado.');
 const taxBudgetType=type.tax_budget_type?String(type.tax_budget_type):'';
 return {...draft,commercial:{...draft.commercial,taxBudgetType},items:draft.items.map(item=>({...item,taxes:undefined}))};
}
