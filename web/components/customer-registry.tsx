"use client";
import {tableFilterValues} from "@/lib/table-filter-values";
import {useEffect,useMemo,useRef,useState} from 'react';
import {Save,Pencil,Download} from 'lucide-react';
import SheetFillCell from './sheet-fill-cell';
import TerritoryColumnFilter from './territory-column-filter';
import './territory-sheet.css';
const columns=[['id','ID M8'],['name','Cliente'],['document','CNPJ / CPF'],['municipioNome','Município'],['ufSigla','UF'],['regiaoId','Região M8'],['vendedorId','Vendedor M8'],['seller_user','Vendedor vinculado'],['classificacaoId','Classificação M8'],['mesoregion','Mesorregião'],['microregion','Microrregião'],['assignee','Orçamentista']] as const;
const remoteKeys=['name','municipioNome','ufSigla','regiaoId','classificacaoId','vendedorId'];
export default function CustomerRegistry(){
 const company='1';
 const [exporting,setExporting]=useState(false);
 const [data,setData]=useState<any>({rows:[],users:[]}),[draft,setDraft]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[editM8,setEditM8]=useState(false);
 const [sellers,setSellers]=useState<{id:string;name:string}[]>([]);
 const [classifications,setClassifications]=useState<{id:string;name:string}[]>([]);
 const [filters,setFilters]=useState<Record<string,string[]|undefined>>({}),[sort,setSort]=useState({key:'name',direction:1}),[column,setColumn]=useState<number|null>(null);
 const stopped=useRef(false);
 const [syncing,setSyncing]=useState(false);
 useEffect(()=>{stopped.current=false;return()=>{stopped.current=true}},[]);
 const old=new Map<string,any>(data.rows.map((row:any)=>[row.id,row]));
 const dirty=draft.filter(row=>JSON.stringify(row)!==JSON.stringify(old.get(row.id)));
 async function load(){const r=await fetch('/api/customer-registry?company='+company,{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setData(b);setDraft(b.rows);return b;}
 async function post(body:any){const r=await fetch('/api/customer-registry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,company:Number(company)})});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
 useEffect(()=>{setData({rows:[],users:[]});setDraft([]);setFilters({});setEditM8(false);setClassifications([]);setSellers([]);void load().catch(e=>setError(e.message))},[company]);
 useEffect(()=>{if(!dirty.length)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty.length]);
 const choices=useMemo(()=>({seller_user:data.users.filter((u:any)=>/^vendedor(a)?$/i.test(u.job_title?.trim())).map((u:any)=>({id:u.email,name:u.display_name||u.email})),assignee:data.users.map((u:any)=>({id:u.email,name:u.display_name||u.email})),...Object.fromEntries(['regiaoId','classificacaoId'].map(key=>[key,Array.from(new Map(data.rows.filter((r:any)=>r[key]).map((r:any)=>[String(r[key]),{id:String(r[key]),name:r[key==='regiaoId'?'regiaoNome':'classificacaoNome']||String(r[key])}])).values())]))}),[data]) as Record<string,{id:string;name:string}[]>;
 const allChoices:Record<string,{id:string;name:string}[]>={...choices,vendedorId:sellers,classificacaoId:classifications.length?classifications:choices.classificacaoId};
 const choicesMap=useMemo(()=>Object.fromEntries(Object.entries(allChoices).map(([key,values])=>[key,new Map(values.map(item=>[item.id,item.name]))])),[choices,classifications,sellers]);
 const options=(key:string)=>allChoices[key]||[];
 const display=(row:any,key:string)=>key==='vendedorId'?(choicesMap.vendedorId?.get(String(row.vendedorId))||row.seller||String(row.vendedorId||'')):['regiaoId','classificacaoId','vendedorId','assignee','seller_user'].includes(key)?choicesMap[key]?.get(String(row[key]))||String(row[key]||''):String(row[key]||'');
 const filtered=draft.filter(row=>columns.every(([key])=>!filters[key]||filters[key]!.includes(display(old.get(row.id)||row,key)))).sort((a,b)=>display(old.get(a.id)||a,sort.key).localeCompare(display(old.get(b.id)||b,sort.key),'pt-BR',{numeric:true})*sort.direction);
 const visible=filtered;
 const editable=(key:string)=>['assignee','seller_user'].includes(key)||editM8&&remoteKeys.includes(key);
 function edit(id:string,key:string,value:string){setDraft(rows=>rows.map(row=>row.id===id?{...row,[key]:value}:row))}
 function paste(text:string,rowIndex:number,index:number,whole=false){try{const matrix=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));const values=whole&&matrix.length===1?filtered.map(()=>matrix[0]):matrix;if(rowIndex+values.length>filtered.length)throw Error('A colagem excede as linhas filtradas.');const updates=new Map();values.forEach((line,r)=>{const changes:any={};line.forEach((value,c)=>{const key=columns[index+c]?.[0];if(!key||!editable(key))throw Error('A colagem inclui colunas não editáveis.');if(['regiaoId','classificacaoId','vendedorId','assignee','seller_user'].includes(key)&&value){const found=options(key).filter((item:any)=>item.id===value||item.name.toLocaleLowerCase()===value.toLocaleLowerCase());if(found.length!==1)throw Error(`Valor não reconhecido: ${value}. Selecione um item válido.`);value=found[0].id;}changes[key]=value;});updates.set(filtered[rowIndex+r].id,changes)});setDraft(rows=>rows.map(row=>updates.has(row.id)?{...row,...updates.get(row.id)}:row));setError('')}catch(e){setError((e as Error).message)}}
 async function exportExcel(){
  setExporting(true);setError('');
  try{
   const XLSX=await import('xlsx');
   const sheet=XLSX.utils.aoa_to_sheet([
    columns.map(([,label])=>label),
    ...filtered.map(row=>columns.map(([key])=>display(row,key)))
   ]);
   sheet['!cols']=columns.map(([key])=>({wch:key==='name'?48:key==='document'?22:key==='ufSigla'?8:28}));
   sheet['!autofilter']={ref:sheet['!ref']!};
   const workbook=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(workbook,sheet,'Clientes M8');
   XLSX.writeFile(workbook,'clientes-m8.xlsx',{compression:true});
  }catch{setError('Não foi possível exportar os clientes para Excel. Tente novamente.');}
  finally{setExporting(false);}
 }
 async function sync(){setSyncing(true);setBusy(true);setError('');stopped.current=false;try{const ids=visible.map(r=>r.id);for(let i=0;i<ids.length&&!stopped.current;i+=5){setMessage(`Consultando classificação e vendedores: ${i} de ${ids.length}`);await post({action:'details',ids:ids.slice(i,i+5)});}await load();setMessage(stopped.current?'Sincronização interrompida. Dados já recebidos foram preservados.':'Dados sincronizados com o M8.')}catch(e){setError((e as Error).message)}finally{setBusy(false);setSyncing(false)}}
 async function toggleM8(){if(editM8){setEditM8(false);return;}setBusy(true);setError('');try{const result=await post({action:'lookups'});setClassifications(result.classifications);setSellers(result.sellers||[]);setEditM8(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function save(){setBusy(true);setError('');setMessage('');const failed:any[]=[];const errors:string[]=[];let saved=0;for(const row of dirty){try{const original=old.get(row.id);const changes:any={},before:any={};for(const key of remoteKeys){if(String(row[key])!==String(original[key])){const m8key=key==='name'?'razaoSocial':key;changes[m8key]=row[key];before[m8key]=original[key];}}await post({action:'save',id:row.id,version:row.version,assignee:row.assignee,seller_user:row.seller_user,editM8,changes,before});saved++;}catch(e){failed.push(row);errors.push(`${row.id} · ${(e as Error).message}`)}}try{const fresh=await load();setDraft(fresh.rows.map((r:any)=>failed.find(f=>f.id===r.id)||r))}catch(e){errors.push((e as Error).message)}setMessage(`${saved} cliente(s) salvo(s).`);setError(errors.join('\n'));setBusy(false)}
 return <section className="manual-card territory-sheet">
 <h2>Clientes M8</h2><p>Cadastro único de clientes das três empresas, sincronizado do ERP e sem exclusão de linhas. Mesorregião e Microrregião seguem a Divisão Comercial por município e UF. Vendedor vinculado e Orçamentista são campos internos. O vendedor vinculado define a carteira deste cliente, com prioridade sobre a Divisão Comercial. Sem vínculo direto, vale a regra por cidade/UF.</p>
 <div className="territory-sheet-toolbar">
 <button disabled={busy||exporting||!filtered.length} onClick={()=>void exportExcel()}><Download size={16}/>{exporting?'Exportando…':'Exportar Excel'}</button>
 <button disabled={busy||!!dirty.length||!visible.length} onClick={()=>void sync()}>Atualizar detalhes dos clientes filtrados</button>
 <button disabled={busy||!!dirty.length} aria-pressed={editM8} onClick={()=>void toggleM8()}><Pencil size={16}/>{editM8?'Encerrar edição M8':'Editar campos M8'}</button>
 <button disabled={busy||!dirty.length} onClick={()=>{setDraft(data.rows);setError('')}}>Descartar alterações</button><button className="territory-save" disabled={busy||!dirty.length} onClick={()=>void save()}><Save size={16}/>Salvar alterações ({dirty.length})</button>{syncing&&<button onClick={()=>{stopped.current=true}}>Interromper sincronização</button>}</div>
 {editM8&&<p>Ao salvar, as alterações em Cliente, Município, UF, Região, Classificação e Vendedor M8 serão enviadas ao ERP. O vendedor selecionado será definido como padrão do cliente no M8.</p>}
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <p>{filtered.length} clientes · {data.rows.filter((r:any)=>!r.synced_at).length} aguardam consulta de classificação e vendedores. Arraste o canto inferior direito de uma célula editável para copiar seu valor nas linhas visíveis abaixo. Selecione uma coluna com Shift + clique para copiar ou colar em todas as linhas filtradas.</p>
 <div className="territory-sheet-scroll" onCopy={e=>{if(column===null)return;e.preventDefault();e.clipboardData.setData('text/plain',filtered.map(row=>display(row,columns[column][0])).join('\n'))}} onPaste={e=>{if(column===null||busy)return;e.preventDefault();paste(e.clipboardData.getData('text/plain'),0,column,true)}}><table><thead><tr>{columns.map(([key,label],index)=><th key={key} aria-sort={sort.key===key?(sort.direction===1?'ascending':'descending'):'none'}><div className="territory-column-heading"><button title="Shift + clique para selecionar a coluna" onClick={e=>setColumn(e.shiftKey?index:null)}>{label}{sort.key===key?(sort.direction===1?' ↑':' ↓'):''}</button><TerritoryColumnFilter label={label} onOpen={()=>setColumn(null)} onSort={direction=>{setSort({key,direction})}} values={tableFilterValues(draft,key,filters,(row,field)=>display(old.get(row.id)||row,field))} selected={filters[key]} onApply={values=>{setFilters({...filters,[key]:values})}}/></div></th>)}</tr></thead><tbody>{visible.map((row,rowIndex)=><tr key={row.id} className={dirty.includes(row)?'territory-dirty':''}>{columns.map(([key,label],index)=><SheetFillCell key={key} rowIndex={rowIndex} column={key} editable={editable(key)&&!busy} onFill={last=>{const ids=new Set(visible.slice(rowIndex+1,last+1).map(item=>item.id));setDraft(current=>current.map(item=>ids.has(item.id)?{...item,[key]:row[key]}:item));setError('');setMessage('')}}>{editable(key)?(['regiaoId','classificacaoId','vendedorId','assignee','seller_user'].includes(key)?<select aria-label={`${label} ${row.id}`} value={row[key]} disabled={busy} onPaste={e=>{e.preventDefault();e.stopPropagation();paste(e.clipboardData.getData('text/plain'),rowIndex,index)}} onFocus={()=>setColumn(null)} onChange={e=>edit(row.id,key,e.target.value)}><option value="" disabled={key==='vendedorId'}>{key==='seller_user'?'Usar Divisão Comercial':'Não informado'}</option>{options(key).map((item:any)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>:<input aria-label={`${label} ${row.id}`} value={row[key]} disabled={busy} onFocus={()=>setColumn(null)} onChange={e=>edit(row.id,key,e.target.value)} onPaste={e=>{e.preventDefault();e.stopPropagation();paste(e.clipboardData.getData('text/plain'),rowIndex,index)}}/>):<span className="territory-cell-value">{display(row,key)||'—'}</span>}</SheetFillCell>)}</tr>)}</tbody></table></div>
 </section>
}
