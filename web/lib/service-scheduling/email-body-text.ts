/** Escape configured plain text before passing it to the rich text editor. */
export function emailTextHtml(text:string){
 const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 return text.replace(/\r\n?/g,'\n').split(/\n\n/).map(line=>'<p>'+escape(line).replace(/\n/g,'<br>')+'</p>').join('');
}
export function validEmailLink(value:string){
 try{const url=new URL(value);return ['https:','http:','mailto:','tel:'].includes(url.protocol);}catch{return false;}
}
