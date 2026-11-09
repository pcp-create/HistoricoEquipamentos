import 'server-only';
import sanitizeHtml from 'sanitize-html';
/** Only formatting and safe links may leave the portal as email HTML. */
export function cleanEmailBodyHtml(value:unknown){
 if(value===undefined)return undefined;
 if(typeof value!=='string'||value.length>100000)throw Error('A mensagem formatada excede o limite permitido.');
 const html=sanitizeHtml(value,{
  allowedTags:['p','br','div','span','strong','b','em','i','u','s','strike','a','ul','ol','li','blockquote'],
  allowedAttributes:{'*':['style'],a:['href','target','rel'],ol:['start']},
  allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false,
  allowedStyles:{'*':{
   'color':[/^#[0-9a-f]{3,8}$/i,/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
   'font-family':[/^(?:Arial|Georgia|Verdana|monospace|sans-serif|serif)(?:,\s*(?:sans-serif|serif))?$/i],
   'font-size':[/^(?:12|14|18|24)px$/],
   'text-align':[/^(?:left|right|center|justify)$/],
   'font-weight':[/^(?:bold|normal|[1-9]00)$/],
   'font-style':[/^(?:italic|normal)$/],
   'text-decoration':[/^(?:underline|line-through|none)$/],
  }},
  transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,target:'_blank',rel:'noopener noreferrer'}})},
 });
 if(!sanitizeHtml(html,{allowedTags:[],allowedAttributes:{}}).replace(/(?:&nbsp;|&#160;|\s)/g,''))throw Error('Informe o texto da mensagem.');
 return html;
}
export function emailBodyHtml(value:unknown){
 const html=cleanEmailBodyHtml(value);if(html===undefined)return undefined;
 return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#263b50">'+html+'</div></body></html>';
}
