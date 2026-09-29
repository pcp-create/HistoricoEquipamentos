import {stagesOf,normalizeStage,type ChecklistTemplate} from './checklists';
/** Repairs only generated CCP structure; custom names and active operation snapshots stay intact. */
export function repairCcpStructure(source:ChecklistTemplate):ChecklistTemplate {
 if(source.id!=='ccp')return source;
 const c=structuredClone(source);
 c.stages=stagesOf(c).map(stage=>{
  let groups=stage.groups!.map(group=>{
   const g={...group,fields:[...group.fields]};
   if(g.name==='Geral'&&g.id.startsWith(stage.id+'-group-')&&g.fields.every(f=>!f.group?.trim())){g.name='';g.direct=true;}
   const paired:Record<string,string>={
    'ccp-stage-3-field-1':'Comentário',
    'ccp-stage-5-field-1':'Comentário das fotos gerais',
    'ccp-stage-5-field-3':'Comentário da identificação',
   };
   const fields=[];
   for(let i=0;i<g.fields.length;i++){
    const f=g.fields[i],next=g.fields[i+1];
    const expected=stage.id==='ccp-stage-2'&&f.type==='flag'?'Comentário — '+f.label:paired[f.id];
    if(expected&&next?.type==='textarea'&&next.label===expected&&f.comment===undefined){fields.push({...f,comment:true});i++;}
    else fields.push(f);
   }
   return {...g,fields};
  });
  if(stage.id==='ccp-stage-1'){
   const initial=groups.find(g=>g.name==='Informações iniciais do equipamento'&&g.fields.length===1&&g.fields[0].id==='ccp-stage-1-field-1');
   const meter=groups.find(g=>g.name==='Medições de horímetro');
   if(initial&&meter){const merged={...initial,name:meter.name,fields:[...initial.fields,...meter.fields]};groups=groups.filter(g=>g.id!==meter.id).map(g=>g.id===initial.id?merged:g);}
  }
  return normalizeStage({...stage,groups});
 });
 return c;
}
