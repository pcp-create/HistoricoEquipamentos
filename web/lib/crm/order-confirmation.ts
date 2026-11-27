import {CrmError,text} from './model';
export function orderConfirmation(raw:any,payment:string){
 if(!raw || raw.paymentConfirmed!==true)throw new CrmError('Confirme a condição de pagamento antes de gerar a OS.');
 if(!payment || String(raw.payment)!==String(payment))throw new CrmError('A condição de pagamento foi alterada. Reabra a confirmação do pedido.');
 const approver=text(raw.approver,160);
 if(!approver)throw new CrmError('Informe o nome de quem aprovou o pedido.');
 return {payment:String(payment),paymentConfirmed:true,approver,notes:text(raw.notes??'',2000)};
}
