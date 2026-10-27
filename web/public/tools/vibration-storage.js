/* Database persistence for the vibration editor; local JSON export remains available. */
(()=>{
 let current=null,savedSnapshot='',offset=0,listRequest=0,busy=false;
 const imageCache=new Map();
 const actionIcon=(name)=>'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+({
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5"/>',
  pdf:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z M14 2v6h6 M12 11v7m-3-3 3 3 3-3"/>'
 })[name]+'</svg>';
 const main=document.querySelector('main'),editor=document.createElement('div');
 editor.id='vibrationEditor';editor.setAttribute('role','tabpanel');editor.setAttribute('aria-labelledby','reportEditorTab');
 while(main.firstChild)editor.append(main.firstChild);
 main.append(editor);
 const tabs=document.createElement('div');tabs.className='v-storage-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Relatórios de vibração');
 tabs.innerHTML='<button type="button" id="savedReportsTab" role="tab" aria-controls="vibrationSaved">Relatórios salvos</button><button type="button" id="reportEditorTab" role="tab" aria-controls="vibrationEditor">Relatório</button>';
 main.prepend(tabs);
 function tab(edit){editor.hidden=!edit;panel.hidden=edit;for(const [id,selected] of [['savedReportsTab',!edit],['reportEditorTab',edit]]){$(id).setAttribute('aria-selected',String(selected));$(id).tabIndex=selected?0:-1;}}

 const panel=document.createElement('section');panel.id='vibrationSaved';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','savedReportsTab');panel.className='panel screen';
 panel.innerHTML=`<div class="v-saved-heading"><h2>Relatórios salvos</h2><button type="button" class="btn v-action v-action-primary" id="newStoredReport">${actionIcon('plus')}Novo relatório</button></div>
 <div class="v-saved-search"><label for="storedSearch">Pesquisar relatórios<input type="search" id="storedSearch" placeholder="Cliente, OS ou título"></label><button type="button" class="btn secondary v-action" id="searchStoredReports">${actionIcon('search')}Pesquisar</button></div>
 <p id="storedListStatus" role="status"></p><div id="storedReports" style="overflow:auto"></div>
 <div class="v-saved-pagination"><button class="btn secondary" id="storedPrevious">Anterior</button><button class="btn secondary" id="storedNext">Próxima</button></div>
 `;
 main.insertBefore(panel,editor);
 const status=document.createElement('p');status.id='storedSaveStatus';status.setAttribute('role','status');tabs.after(status);
 const actions=document.createElement('section');actions.className='panel';
 actions.innerHTML='<div class="flex between"><span id="storedCurrent"></span><div class="flex"><button class="btn" id="saveStoredReport">Salvar na base</button><button class="btn secondary" id="copyStoredReport" hidden>Salvar como novo</button><button class="btn secondary" id="inspectionPlan">Ir ao plano / criar plano de inspeção</button></div></div>';
 editor.prepend(actions);
 const customerField=document.createElement('div');customerField.className='v-customer-field';
 customerField.innerHTML='<label id="vCustomerLabel">Cliente do relatório <span aria-label="obrigatório">*</span></label><details id="vCustomerPicker"><summary aria-labelledby="vCustomerLabel vCustomerSelected"><span id="vCustomerSelected">Selecione um cliente cadastrado</span></summary><input id="vCustomerSearch" aria-label="Pesquisar cliente cadastrado" placeholder="Nome, documento ou cidade" autocomplete="off"><p id="vCustomerStatus" role="status"></p><div id="vCustomerResults"></div></details><small id="vCustomerHint">Selecione o cliente para vincular o relatório ao cadastro do sistema.</small>';
 $('title').closest('section').querySelector('h2').after(customerField);
 let customerRequest=0,customerTimer,customerOptions=[];
 function showCustomer(){
  $('vCustomerSelected').textContent=reportCustomer?reportCustomer.name+' · '+(reportCustomer.document||reportCustomer.personId):'Selecione um cliente cadastrado';
  $('vCustomerHint').textContent=reportCustomer?[reportCustomer.city,reportCustomer.uf].filter(Boolean).join(' / ')+' · Cliente vinculado ao relatório.':'Selecione o cliente para vincular o relatório ao cadastro do sistema.';
 }
 async function customers(){
  const request=++customerRequest;$('vCustomerStatus').textContent='Buscando clientes…';
  try{const result=await (await api('?customers=1&search='+encodeURIComponent($('vCustomerSearch').value))).json();if(request!==customerRequest)return;
   customerOptions=result.customers;$('vCustomerResults').innerHTML=customerOptions.map((c,i)=>'<button type="button" data-customer-index="'+i+'"><strong>'+escapeHtml(c.name)+'</strong><small>'+escapeHtml([c.document,c.city,c.uf].filter(Boolean).join(' · '))+'</small></button>').join('');
   $('vCustomerStatus').textContent=result.hasMore?'Mostrando 50 clientes. Digite para refinar a pesquisa.':customerOptions.length?'':'Nenhum cliente encontrado.';
  }catch(e){if(request===customerRequest)$('vCustomerStatus').textContent=e.message;}
 }
 $('vCustomerPicker').ontoggle=()=>{if($('vCustomerPicker').open){void customers();$('vCustomerSearch').focus();}};
 $('vCustomerSearch').oninput=()=>{clearTimeout(customerTimer);customerRequest++;customerTimer=setTimeout(customers,250);};
 $('vCustomerResults').onclick=e=>{const button=e.target.closest('[data-customer-index]');if(!button)return;reportCustomer=customerOptions[Number(button.dataset.customerIndex)];showCustomer();render();$('vCustomerPicker').open=false;$('vCustomerPicker').querySelector('summary').focus();};
 window.addEventListener('vibration-customer-changed',showCustomer);
 $('savedReportsTab').onclick=()=>{tab(false);void list();};
 $('reportEditorTab').onclick=()=>tab(true);
 tabs.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const edit=e.key==='End'||(e.key!=='Home'&&editor.hidden);tab(edit);$(edit?'reportEditorTab':'savedReportsTab').focus();}};

 function project(){const result={version:3,equipments,customer:reportCustomer};for(const key of ['title','serviceOrder','technician','collector','issued','general'])result[key]=$(key).value;return structuredClone(result);}
 function snapshot(){return JSON.stringify(project());}
 function reset(){current=null;savedSnapshot='';$('storedCurrent').textContent='Novo relatório';$('copyStoredReport').hidden=true;}
 function askDiscard(){return !equipments.length||snapshot()===savedSnapshot||confirm('Há dados no editor que não foram salvos na base. Deseja abrir outro relatório e descartar esses dados?');}
 function lock(value){busy=value;document.querySelector('main').inert=value;}
 async function api(url,options){const r=await fetch('/api/vibration-reports'+url,{cache:'no-store',...options});if(!r.ok){const data=await r.json().catch(()=>({}));throw Error(data.error||'Não foi possível acessar os relatórios.');}return r;}
 async function list(){
  const request=++listRequest;$('storedListStatus').textContent='Carregando relatórios…';
  try{const data=await (await api('?q='+encodeURIComponent($('storedSearch').value)+'&offset='+offset)).json();if(request!==listRequest)return;
   $('storedReports').innerHTML=data.reports.length?`<table><thead><tr><th>Cliente / Relatório</th><th>OS</th><th>Última atualização</th><th>Ações</th></tr></thead><tbody>${data.reports.map(r=>`<tr><td><b>${escapeHtml(r.clients)}</b><br>${escapeHtml(r.title)}</td><td>${escapeHtml(r.service_order||'—')}</td><td>${escapeHtml(new Date(r.updated_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}<br><small>${escapeHtml(r.updated_by)}</small></td><td class="v-actions-cell"><div class="v-row-actions"><button type="button" class="btn secondary v-action" data-open-report="${escapeHtml(r.id)}">${actionIcon('edit')}Editar</button><button type="button" class="btn secondary v-action v-action-pdf" data-pdf-report="${escapeHtml(r.id)}">${actionIcon('pdf')}Gerar PDF</button></div></td></tr>`).join('')}</tbody></table>`:'Nenhum relatório encontrado.';
   $('storedPrevious').disabled=offset===0;$('storedNext').disabled=!data.hasMore;$('storedListStatus').textContent=data.reports.length?'Relatórios '+(offset+1)+' a '+(offset+data.reports.length):'';
  }catch(e){if(request===listRequest)$('storedListStatus').textContent=e.message;}
 }
 async function uploadData(data){
  if(imageCache.has(data))return imageCache.get(data);
  let blob=await (await fetch(data)).blob();
  // Large source screenshots are resized only for database transport.
  if(blob.size>2900000){
   const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');
   const scale=Math.min(1,3000/Math.max(image.naturalWidth,image.naturalHeight));
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [.95,.85,.7,.5]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob&&blob.size<=2900000)break;}
  }
  if(!blob||blob.size>2900000)throw Error('Uma imagem está muito grande. Reduza seu tamanho e tente novamente.');
  const form=new FormData();form.set('file',blob,'espectro.'+(blob.type==='image/png'?'png':blob.type==='image/jpeg'?'jpg':'webp'));
  const {id}=await (await api('',{method:'POST',body:form})).json();imageCache.set(data,id);return id;
 }
 async function save(copy=false){
  if(busy)return;if(pendingSpectrumUploads){$('storedSaveStatus').textContent='Aguarde o carregamento dos espectros antes de salvar.';return;}if(!equipments.length){$('storedSaveStatus').textContent='Importe as medições antes de salvar.';return;}
  if(!reportCustomer){$('storedSaveStatus').textContent='Selecione um cliente cadastrado antes de salvar.';tab(true);$('vCustomerPicker').open=true;return;}
  lock(true);$('storedSaveStatus').textContent='Salvando relatório e espectros…';
  try{
   const doc=project();let count=0;
   for(const e of doc.equipments)for(const c of e.components)for(const p of c.points)for(const [type] of spectrumTypes){
    const im=p.spectra?.[type];if(!im)continue;
    im.assetId=await uploadData(im.data);delete im.data;$('storedSaveStatus').textContent='Salvando relatório · '+(++count)+' espectro(s) preparado(s)…';
   }
   const row=await (await api('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:copy?null:current?.id,version:copy?null:current?.version,document:doc})})).json();
   if(row.customer){reportCustomer=row.customer;showCustomer();render();}
   current=row;savedSnapshot=snapshot();$('storedCurrent').textContent='Relatório salvo · versão '+row.version;$('copyStoredReport').hidden=false;$('storedSaveStatus').textContent='Relatório salvo na base com sucesso.';
   offset=0;await list();
  }catch(e){$('storedSaveStatus').textContent=e.message;}finally{lock(false);}
 }
 async function open(id,pdf=false){
  if(busy||!askDiscard())return;
  // Reserve the preview window while still inside the user's click.
  const preview=pdf?window.open('','_blank'):null;
  if(pdf&&!preview){$('storedSaveStatus').textContent='Permita pop-ups para gerar o PDF.';return;}
  if(preview)preview.document.body.textContent='Carregando relatório…';
  lock(true);$('storedSaveStatus').textContent='Abrindo relatório e espectros…';
  try{
   const row=await (await api('?id='+encodeURIComponent(id))).json(),doc=row.document;
   const refs=[];
   for(const e of doc.equipments)for(const c of e.components)for(const p of c.points)for(const [t] of spectrumTypes)if(p.spectra?.[t])refs.push(p.spectra[t]);
   const loaded=new Map();
   for(const im of refs){
    if(!loaded.has(im.assetId)){
     const blob=await (await api('?image='+encodeURIComponent(im.assetId))).blob();
     const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
     loaded.set(im.assetId,data);imageCache.set(data,im.assetId);
    }
    im.data=loaded.get(im.assetId);
   }
   await $('openProject').onchange({target:{files:[new File([JSON.stringify(doc)],'relatorio.json')],value:''}});
   tab(true);showCustomer();
   current={id:row.id,version:row.version};savedSnapshot=snapshot();$('copyStoredReport').hidden=false;$('storedCurrent').textContent='Relatório salvo · versão '+row.version;$('storedSaveStatus').textContent='Relatório aberto. Edite os dados e clique em Salvar na base.';
   if(preview){
    const items=equipments.filter(e=>e.selected);if(!items.length)throw Error('Selecione pelo menos um equipamento para gerar o PDF.');
    buildReport(items);const css=document.querySelector('style').textContent;
    preview.document.open();preview.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(reportFilename(items))}</title><style>${css}.report{display:block!important}</style></head><body><div class="screen" style="padding:16px;text-align:right"><button class="btn" onclick="Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.decode().catch(()=>{}))]).then(()=>print())">Imprimir / Salvar PDF</button></div>${$('report').outerHTML}</body></html>`);preview.document.close();
   }
  }catch(e){if(preview)preview.close();$('storedSaveStatus').textContent=e.message;}finally{lock(false);}
 }
 $('inspectionPlan').onclick=()=>{if(!current||snapshot()!==savedSnapshot){$('storedSaveStatus').textContent='Salve o relatório na base antes de vincular a coleta ao plano de inspeção.';return;}window.top.location.href='/equipamentos/inspecoes?report='+encodeURIComponent(current.id);};
 $('saveStoredReport').onclick=()=>save();$('copyStoredReport').onclick=()=>save(true);
 $('searchStoredReports').onclick=()=>{offset=0;void list();};
 $('storedSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();offset=0;void list();}};
 $('storedPrevious').onclick=()=>{offset=Math.max(0,offset-50);void list();};
 $('storedNext').onclick=()=>{offset+=50;void list();};
 $('storedReports').onclick=e=>{const edit=e.target.closest('[data-open-report]'),pdf=e.target.closest('[data-pdf-report]');if(edit)void open(edit.dataset.openReport);if(pdf)void open(pdf.dataset.pdfReport,true);};
 const clear=$('clear').onclick;
 $('clear').onclick=()=>{if(!askDiscard())return;clear();reset();reportCustomer=null;showCustomer();$('storedSaveStatus').textContent='';};
 $('newStoredReport').onclick=()=>{if(!askDiscard())return;clear();for(const key of ['serviceOrder','technician','collector','general'])$(key).value='';$('title').value='Relatório Técnico de Análise de Vibrações';$('issued').value=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});reset();reportCustomer=null;showCustomer();tab(true);$('storedSaveStatus').textContent='Novo relatório. Selecione o cliente e importe as medições para começar.';};
 $('openProject').addEventListener('change',()=>reset());
 reset();showCustomer();tab(false);void list();
 const inspectionReport=new URLSearchParams(location.search).get('report');if(inspectionReport&&/^[0-9a-f-]{36}$/i.test(inspectionReport))void open(inspectionReport);
})();
