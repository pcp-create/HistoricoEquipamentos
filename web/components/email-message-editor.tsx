"use client";
import ActionNotice from "./action-notice";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {Node,mergeAttributes} from '@tiptap/core';
import {TextStyleKit} from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import {Bold,Italic,Underline,Strikethrough,Link,Unlink,List,ListOrdered,IndentDecrease,IndentIncrease,Quote,RemoveFormatting,Undo2,Redo2,ImagePlus} from 'lucide-react';
import {emailTextHtml,validEmailLink} from '@/lib/service-scheduling/email-body-text';
const EmailImage=Node.create({
 name:'emailImage',group:'block',atom:true,draggable:true,
 addAttributes(){return {src:{default:null},alt:{default:'Imagem'},width:{default:null,parseHTML:element=>{const width=Number(element.getAttribute('width'));return Number.isInteger(width)&&width>=40&&width<=1200?width:null;},renderHTML:attributes=>attributes.width?{width:attributes.width}:{} }};},
 parseHTML(){return [{tag:'img[src^="data:image/"]'}];},
 renderHTML({HTMLAttributes}){return ['img',mergeAttributes(HTMLAttributes)];},
});
export default function EmailMessageEditor({initialText,initialHtml,label='Mensagem',resetKey=0,disabled,onChange}:{initialText:string;initialHtml?:string;label?:string;resetKey?:number;disabled:boolean;onChange:(text:string,html:string)=>void}){
 const [link,setLink]=useState<{from:number;to:number;text:string;href:string}|null>(null),[linkError,setLinkError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),imageInput=useRef<HTMLInputElement>(null);
 const [imageError,setImageError]=useState('');
 const editor=useEditor({
  immediatelyRender:false,shouldRerenderOnTransaction:true,
  extensions:[StarterKit.configure({heading:false,codeBlock:false,code:false,horizontalRule:false,link:{openOnClick:false,protocols:['mailto','tel'],HTMLAttributes:{target:'_blank',rel:'noopener noreferrer'}}}),EmailImage,TextStyleKit,TextAlign.configure({types:['paragraph']})],
  content:initialHtml||emailTextHtml(initialText),editable:!disabled,
  editorProps:{attributes:{role:'textbox','aria-label':label,'aria-multiline':'true',class:'email-message-content'}},
  onUpdate:({editor})=>onChange(editor.getText({blockSeparator:'\n\n'}),editor.getHTML()),
 });
 useEffect(()=>{editor?.setEditable(!disabled,false);},[editor,disabled]);
 useEffect(()=>{if(editor)editor.commands.setContent(initialHtml||emailTextHtml(initialText),{emitUpdate:false});},[editor,resetKey]);
 const showLink=!!link;
 useEffect(()=>{if(showLink){dialog.current?.showModal();return()=>dialog.current?.close();}},[showLink]);
 if(!editor)return <div className="email-message-loading">Carregando editor…</div>;
 const button=(title:string,icon:React.ReactNode,action:()=>void,active=false,unavailable=false)=><button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled||unavailable} onMouseDown={e=>e.preventDefault()} onClick={action}>{icon}</button>;
 const openLink=()=>{if(editor.isActive('link'))editor.chain().extendMarkRange('link').run();const {from,to}=editor.state.selection;setLinkError('');setLink({from,to,text:editor.state.doc.textBetween(from,to,' '),href:editor.getAttributes('link').href||''});};
 const size=editor.getAttributes('textStyle').fontSize||'14px',font=editor.getAttributes('textStyle').fontFamily||'Arial, sans-serif';
 return <div className="email-message-field" role="group" aria-label={label}>
  <span className="email-message-label">{label}</span>
  <div className="email-message-editor" data-disabled={disabled}>
   <div className="email-format-toolbar" role="toolbar" aria-label={'Formatação: '+label}>
    <select aria-label="Fonte" title="Fonte" disabled={disabled} value={font} onChange={e=>editor.chain().focus().setFontFamily(e.target.value).run()}><option value="Arial, sans-serif">Sans Serif</option><option value="Georgia, serif">Serif</option><option value="Verdana, sans-serif">Verdana</option><option value="monospace">Monoespaçada</option></select>
    <select aria-label="Tamanho da fonte" title="Tamanho da fonte" disabled={disabled} value={size} onChange={e=>editor.chain().focus().setFontSize(e.target.value).run()}><option value="12px">Pequeno</option><option value="14px">Normal</option><option value="18px">Grande</option><option value="24px">Enorme</option></select>
    <span className="email-format-divider"/>
    {button('Negrito',<Bold size={17}/>,()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
    {button('Itálico',<Italic size={17}/>,()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
    {button('Sublinhado',<Underline size={17}/>,()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}
    {button('Tachado',<Strikethrough size={17}/>,()=>editor.chain().focus().toggleStrike().run(),editor.isActive('strike'))}
    <input type="color" aria-label="Cor do texto" title="Cor do texto" disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(editor.getAttributes('textStyle').color||'')?editor.getAttributes('textStyle').color:'#263b50'} onChange={e=>editor.chain().focus().setColor(e.target.value).run()}/>
    <span className="email-format-divider"/>
    <select aria-label="Alinhamento" title="Alinhamento" disabled={disabled} value={editor.getAttributes('paragraph').textAlign||'left'} onChange={e=>editor.chain().focus().setTextAlign(e.target.value).run()}><option value="left">À esquerda</option><option value="center">Centralizado</option><option value="right">À direita</option><option value="justify">Justificado</option></select>
    {button('Lista numerada',<ListOrdered size={17}/>,()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList'))}
    {button('Lista com marcadores',<List size={17}/>,()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}
    {button('Diminuir recuo',<IndentDecrease size={17}/>,()=>editor.chain().focus().liftListItem('listItem').run(),false,!editor.can().liftListItem('listItem'))}
    {button('Aumentar recuo',<IndentIncrease size={17}/>,()=>editor.chain().focus().sinkListItem('listItem').run(),false,!editor.can().sinkListItem('listItem'))}
    {button('Citação',<Quote size={17}/>,()=>editor.chain().focus().toggleBlockquote().run(),editor.isActive('blockquote'))}
    <span className="email-format-divider"/>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden disabled={disabled} onChange={async e=>{
      const file=e.target.files?.[0];e.target.value='';if(!file)return;setImageError('');
      if(!['image/png','image/jpeg'].includes(file.type)||file.size>500000){setImageError('Selecione uma imagem PNG ou JPEG de até 500 KB.');return;}
      try{const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
       if(editor.getHTML().length+src.length>900000){setImageError('As imagens e o texto ultrapassam o limite da mensagem.');return;}
       editor.chain().focus().insertContent({type:'emailImage',attrs:{src,alt:file.name.slice(0,120)}}).run();
      }catch{setImageError('Não foi possível carregar a imagem.');}
    }}/>
   {button('Inserir imagem',<ImagePlus size={17}/>,()=>imageInput.current?.click())}
    {editor.isActive('emailImage')&&<label className="email-image-size">Largura da imagem <input key={editor.state.selection.from} type="number" aria-label="Largura da imagem em pixels" min={40} max={1200} step={10} disabled={disabled} defaultValue={editor.getAttributes('emailImage').width||''} placeholder="Original" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}} onBlur={e=>{const value=e.target.value,width=Number(value);if(!value)editor.commands.updateAttributes('emailImage',{width:null});else if(Number.isInteger(width)&&width>=40&&width<=1200){editor.commands.updateAttributes('emailImage',{width});setImageError('');}else setImageError('Informe uma largura entre 40 e 1.200 pixels.');}}/><span>px</span></label>}
    {button('Inserir ou editar link' ,<Link size={17}/>,openLink,editor.isActive('link'))}
    {button('Remover link',<Unlink size={17}/>,()=>editor.chain().focus().extendMarkRange('link').unsetLink().run(),false,!editor.isActive('link'))}
    {button('Remover formatação',<RemoveFormatting size={17}/>,()=>editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run())}
    {button('Desfazer',<Undo2 size={17}/>,()=>editor.chain().focus().undo().run(),false,!editor.can().undo())}
    {button('Refazer',<Redo2 size={17}/>,()=>editor.chain().focus().redo().run(),false,!editor.can().redo())}
   </div>
   <EditorContent editor={editor}/>
  </div>
  {imageError&&<ActionNotice type="error" onClose={()=>setImageError('')}>{imageError}</ActionNotice>}
  <small>{editor.getText().length.toLocaleString('pt-BR')} / 10.000 caracteres</small>
  {editor.getText().length>10000&&<p role="alert">A mensagem deve ter até 10.000 caracteres.</p>}
  {link&&createPortal(<dialog ref={dialog} className="email-link-dialog" aria-label="Inserir link" onCancel={e=>{e.preventDefault();setLink(null);}}>
   <h3>Inserir link</h3>
   <label>Texto do link<input autoFocus maxLength={1000} value={link.text} onChange={e=>setLink({...link,text:e.target.value})}/></label>
   <label>Endereço do link<input type="url" placeholder="https://" maxLength={2000} value={link.href} onChange={e=>setLink({...link,href:e.target.value})}/></label>
   {linkError&&<ActionNotice type="error" onClose={()=>setLinkError('')}>{linkError}</ActionNotice>}
   <div><button type="button" onClick={()=>setLink(null)}>Cancelar</button><button type="button" onClick={()=>{const href=link.href.trim();if(!validEmailLink(href)){setLinkError('Informe um endereço http, https, mailto ou tel válido.');return;}const chain=editor.chain().focus().setTextSelection({from:link.from,to:link.to});if(link.from!==link.to&&link.text===editor.state.doc.textBetween(link.from,link.to,' '))chain.setLink({href}).run();else chain.insertContent({type:'text',text:link.text.trim()||href,marks:[{type:'link',attrs:{href,target:'_blank',rel:'noopener noreferrer'}}]}).run();setLink(null);}}>Aplicar link</button></div>
  </dialog>,document.body)}
 </div>;
}
