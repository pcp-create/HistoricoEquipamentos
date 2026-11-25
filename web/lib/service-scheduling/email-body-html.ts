import 'server-only';
import sanitizeHtml from 'sanitize-html';
/** Only formatting and safe links may leave the portal as email HTML. */
export function cleanEmailBodyHtml(value:unknown){
 if(value===undefined)return undefined;
 if(typeof value!=='string'||value.length>900000)throw Error('A mensagem formatada excede o limite permitido.');
 const html=sanitizeHtml(value,{
  allowedTags:['p','br','div','span','strong','b','em','i','u','s','strike','a','ul','ol','li','blockquote','img'],
  allowedAttributes:{'*':['style'],a:['href','target','rel'],ol:['start'],img:['src','alt','width']},
  allowedSchemes:['http','https','mailto','tel'],allowedSchemesByTag:{img:['data']},allowProtocolRelative:false,
  allowedStyles:{'*':{
   'color':[/^#[0-9a-f]{3,8}$/i,/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
   'font-family':[/^(?:Arial|Georgia|Verdana|monospace|sans-serif|serif)(?:,\s*(?:sans-serif|serif))?$/i],
   'font-size':[/^(?:12|14|18|24)px$/],
   'text-align':[/^(?:left|right|center|justify)$/],
   'font-weight':[/^(?:bold|normal|[1-9]00)$/],
   'font-style':[/^(?:italic|normal)$/],
   'text-decoration':[/^(?:underline|line-through|none)$/],
  }},
  exclusiveFilter:frame=>frame.tag==='img'&&!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/i.test(frame.attribs.src||''),
  transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}}),img:(_tag,attrs)=>{const width=attrs.width;if(width&&(!/^\d+$/.test(width)||Number(width)<40||Number(width)>1200)){const {width:_width,...safe}=attrs;return {tagName:'img',attribs:safe};}return {tagName:'img',attribs:attrs};}},
 });
 if(!sanitizeHtml(html,{allowedTags:[],allowedAttributes:{}}).replace(/(?:&nbsp;|&#160;|\s)/g,''))throw Error('Informe o texto da mensagem.');
 return html;
}
export function emailBodyHtml(value:unknown){
 const html=cleanEmailBodyHtml(value);if(html===undefined)return undefined;
 return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#263b50">'+html+'</div></body></html>';
}
