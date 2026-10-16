"use client";
import {useLayoutEffect,useRef,type TextareaHTMLAttributes} from 'react';

export default function AutoResizeTextarea(props:TextareaHTMLAttributes<HTMLTextAreaElement>){
 const ref=useRef<HTMLTextAreaElement>(null);
 function resize(){
  const element=ref.current;
  if(!element||!element.getClientRects().length||!element.clientWidth)return;
  element.style.height='auto';
  const css=getComputedStyle(element);
  const borders=css.boxSizing==='border-box'?parseFloat(css.borderTopWidth)+parseFloat(css.borderBottomWidth):-(parseFloat(css.paddingTop)+parseFloat(css.paddingBottom));
  element.style.height=Math.ceil(element.scrollHeight+borders)+'px';
 }
 useLayoutEffect(resize,[props.value,props.defaultValue]);
 useLayoutEffect(()=>{
  const element=ref.current;if(!element)return;
  let previousWidth=-1;
  const observer=new ResizeObserver(()=>{
   const width=element.getBoundingClientRect().width;
   if(width!==previousWidth){previousWidth=width;resize();}
  });
  observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 return <textarea {...props} ref={ref} style={{...props.style,overflowY:'hidden',resize:'none'}} onChange={event=>{resize();props.onChange?.(event)}}/>;
}
