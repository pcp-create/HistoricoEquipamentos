"use client";
import SheetFillCell from "./sheet-fill-cell";
import TerritoryColumnFilter from "./territory-column-filter";
import {useEffect,useMemo,useState} from "react";
import {Plus,Save,Trash2} from "lucide-react";
import {apiFetch,clearApiCache} from "@/lib/client-api-cache";
import "./territory-sheet.css";
const columns=[['city','Cidade'],['mesoregion','Mesorregião'],['microregion','Microrregião'],['seller','Vendedor (texto original)'],['seller_user','Vendedor vinculado'],['uf','Estado'],['assignee','Orçamentista']] as const;
type Row={key:string;id?:string;version:number;[key:string]:any};
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export default function TaskTerritories(){
 const [original,setOriginal]=useState<Row[]>([]),[draft,setDraft]=useState<Row[]>([]),[users,setUsers]=useState<any[]>([]);
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [filters,setFilters]=useState<Record<string,string[]|undefined>>({}),[sort,setSort]=useState({key:'city',direction:1});
 const [selectedColumn,setSelectedColumn]=useState<number|null>(null);
 const originals=useMemo(()=>new Map(original.map(row=>[row.key,row])),[original]);
 const draftKeys=new Set(draft.map(row=>row.key));
 const changed=draft.filter(row=>!row.id||JSON.stringify(row)!==JSON.stringify(originals.get(row.key)));
 const removed=original.filter(row=>!draftKeys.has(row.key));
 const dirty=changed.length+removed.length;
 async function load(){
  const response=await apiFetch('/api/task-territories');const data=await response.json();if(!response.ok)throw Error(data.error);
  const rows=data.rules.map((row:any)=>({...row,key:String(row.id),...Object.fromEntries(columns.map(([key])=>[key,row[key]||'']))}));
  setOriginal(rows);setDraft(rows);setUsers(data.users);setLoaded(true);
 }
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 const display=(row:Row,key:string)=>{
  if(!['seller_user','assignee'].includes(key))return row[key];
  const original=originals.get(row.key);
  return users.find(user=>user.email===row[key])?.display_name || (original?.[key]===row[key] ? original?.[key==='assignee'?'display_name':'seller_display_name'] : '') || row[key];
 };
 // Keep filtering and ordering stable while editing so the next paste targets the same visible rows.
 const rows=draft.filter(row=>{const source=originals.get(row.key)||row;return columns.every(([key])=>!filters[key]||filters[key]!.includes(display(source,key)))})
 .sort((a,b)=>String(display(originals.get(a.key)||a,sort.key)).localeCompare(String(display(originals.get(b.key)||b,sort.key)),'pt-BR',{numeric:true})*sort.direction);
 function edit(key:string,field:string,value:string){setDraft(current=>current.map(row=>row.key===key?{...row,[field]:value}:row));setMessage('')}
 function paste(text:string,rowIndex:number,columnIndex:number,wholeColumn=false){
  const matrix=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));
  if(matrix.some(line=>line.length+columnIndex>columns.length)){setError('A colagem excede as colunas disponíveis.');return;}
  if(wholeColumn&&matrix.some(line=>line.length!==1)){setError('Selecione uma célula para colar várias colunas.');return;}
  const values=wholeColumn&&matrix.length===1?rows.map(()=>matrix[0]):matrix;
  if(rowIndex+values.length>rows.length){setError('A colagem excede as linhas visíveis. Adicione linhas antes de colar.');return;}
  const updates=new Map(rows.slice(rowIndex,rowIndex+values.length).map((row,index)=>[row.key,Object.fromEntries(values[index].map((value,i)=>[columns[columnIndex+i][0],value]))]));
  setDraft(current=>current.map(row=>updates.has(row.key)?{...row,...updates.get(row.key)}:row));setError('');setMessage('');
 }
 function resolveUser(value:string,seller:boolean){
  if(!value.trim()&&seller)return '';
  const candidates=users.filter(user=>(!seller||/^vendedor(a)?$/i.test(user.job_title?.trim()))&&(fold(user.email)===fold(value)||fold(user.display_name||'')===fold(value)));
  if(candidates.length!==1)throw Error(`Usuário "${value}" inválido ou ambíguo. Informe o e-mail de um ${seller?'vendedor':'usuário'} ativo.`);
  return candidates[0].email;
 }
 async function save(){
  if(busy||!dirty)return;setError('');setMessage('');setBusy(true);
  try{
   const changes=[...removed.map(row=>({action:'delete',id:row.id,version:row.version})),...changed.map(row=>{
    const old=original.find(item=>item.key===row.key);
    return {...Object.fromEntries(columns.map(([key])=>[key,row[key]])),id:row.id,version:row.version,action:'save',uf:row.uf.trim().toUpperCase(),
     seller_user:old&&old.seller_user===row.seller_user?row.seller_user:resolveUser(row.seller_user,true),
     assignee:resolveUser(row.assignee,false)};
   })];
   const response=await apiFetch('/api/task-territories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'batch',changes})});
   const data=await response.json();if(!response.ok)throw Error(data.error);
   clearApiCache();await load();setMessage('Todas as alterações foram salvas.');
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="manual-card territory-sheet">
  <h2>Divisão comercial por cidade e UF</h2>
  <p>Arraste o canto inferior direito da célula para copiar o valor nas linhas visíveis abaixo. Edite as células ou cole dados do Excel com Ctrl+V. Para preencher uma coluna inteira, segure Shift e clique no título da coluna e cole um valor ou uma lista. A colagem segue as linhas visíveis. Use Ctrl+C para copiar a coluna selecionada.</p>
  <p>As alterações só são gravadas em “Salvar alterações”. Vendedores definem a carteira de visitas; orçamentistas recebem as novas tarefas. Tarefas existentes não são redistribuídas.</p>
  <div className="territory-sheet-toolbar">
   <button disabled={!loaded||busy} onClick={()=>{setDraft(current=>[...current,{key:crypto.randomUUID(),version:0,...Object.fromEntries(columns.map(([key])=>[key,key==='uf'?'SC':'']))}]);setFilters({})}}><Plus size={16}/>Adicionar regra</button>
   <button disabled={busy||!dirty} onClick={()=>{if(confirm('Descartar todas as alterações não salvas?')){setDraft(original);setError('');setMessage('')}}}>Descartar alterações</button>
   <button disabled={busy||!!dirty} onClick={()=>{clearApiCache();void load().catch(e=>setError(e.message))}}>Atualizar divisão</button>
   <button className="territory-save" disabled={!dirty||busy} onClick={()=>void save()}><Save size={16}/>{busy?'Salvando…':`Salvar alterações (${dirty})`}</button>
  </div>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <p>{rows.length} de {draft.length} regras · {dirty} alterações pendentes</p>
  <div className="territory-sheet-scroll" onCopy={e=>{if(selectedColumn===null)return;e.preventDefault();e.clipboardData.setData('text/plain',rows.map(row=>display(row,columns[selectedColumn][0])).join('\n'))}} onPaste={e=>{if(selectedColumn===null||busy)return;e.preventDefault();paste(e.clipboardData.getData('text/plain'),0,selectedColumn,true)}}>
   <table><thead><tr>{columns.map(([key,label],index)=><th key={key} aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):'none'}>
    <div className="territory-column-heading"><button title="Shift + clique para selecionar a coluna" aria-pressed={selectedColumn===index} onClick={e=>{if(e.shiftKey){setSelectedColumn(index);return;}setSelectedColumn(null)}}>{label}</button>
    <TerritoryColumnFilter onSort={direction=>setSort({key,direction})} onOpen={()=>setSelectedColumn(null)} label={label} values={[...new Set(draft.map(row=>String(display(originals.get(row.key)||row,key))))].sort((a,b)=>a.localeCompare(b,"pt-BR"))} selected={filters[key]} onApply={values=>{setSelectedColumn(null);setFilters(current=>({...current,[key]:values}))}}/></div>
   </th>)}<th>Ações</th></tr></thead>
   <tbody>{rows.map((row,rowIndex)=><tr key={row.key} className={changed.includes(row)?'territory-dirty':''}>{columns.map(([key,label],columnIndex)=><SheetFillCell key={key} rowIndex={rowIndex} column={key} editable={!busy} className={selectedColumn===columnIndex?'territory-selected':''} onFill={last=>{const keys=new Set(rows.slice(rowIndex+1,last+1).map(item=>item.key));setDraft(current=>current.map(item=>keys.has(item.key)?{...item,[key]:row[key]}:item));setError('');setMessage('')}}>
    <input aria-label={`${label} ${row.city||'nova regra'}`} disabled={busy} value={display(row,key)} list={key==='seller_user'?'territory-sellers':key==='assignee'?'territory-users':undefined}
     onFocus={()=>setSelectedColumn(null)} onChange={e=>edit(row.key,key,e.target.value)} onPaste={e=>{e.preventDefault();e.stopPropagation();paste(e.clipboardData.getData('text/plain'),rowIndex,columnIndex)}}/>
   </SheetFillCell>)}<td><button disabled={busy} aria-label={`Remover regra de ${row.city}`} onClick={()=>setDraft(current=>current.filter(item=>item.key!==row.key))}><Trash2 size={15}/></button></td></tr>)}</tbody></table>
  </div>
  {!rows.length&&<p>{loaded?'Nenhuma regra nos filtros selecionados.':'Carregando divisão comercial…'}</p>}
  <datalist id="territory-users">{users.map(user=><option key={user.email} value={user.email}>{user.display_name}</option>)}</datalist>
  <datalist id="territory-sellers">{users.filter(user=>/^vendedor(a)?$/i.test(user.job_title?.trim())).map(user=><option key={user.email} value={user.email}>{user.display_name}</option>)}</datalist>
 </section>
}
