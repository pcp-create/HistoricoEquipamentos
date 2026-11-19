import type {WritingField} from './review-writing';
import {reviewWritingPrompt} from './review-writing-prompt';

// Keep internal JSON-encoded paths out of strict schema enum literals.
export function writingReviewRequest(fields:WritingField[],model:string){
 const ids=fields.map((_,index)=>`field_${index+1}`);
 return {
  body:{model,store:false,max_output_tokens:10000,instructions:reviewWritingPrompt,
   input:JSON.stringify(fields.map((field,index)=>({...field,id:ids[index]}))),
   text:{format:{type:'json_schema',name:'writing_review',strict:true,schema:{type:'object',additionalProperties:false,required:['suggestions'],properties:{suggestions:{type:'array',items:{type:'object',additionalProperties:false,required:['id','suggested'],properties:{id:{type:'string',enum:ids},suggested:{type:'string'}}}}}}}}
  },
  restore(payload:any){
   if(!Array.isArray(payload?.suggestions))throw Error('Resposta de IA inválida.');
   return {...payload,suggestions:payload.suggestions.map((item:any)=>{
    const index=ids.indexOf(item?.id);
    if(index<0)throw Error('Identificador de IA inválido.');
    return {...item,id:fields[index].id};
   })};
  }
 };
}
