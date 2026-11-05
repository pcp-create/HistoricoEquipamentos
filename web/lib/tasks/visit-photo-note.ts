/** Convert only authenticated, local visit-photo references; never render arbitrary URLs or HTML. */
export function visitPhotoNote(description:string){
 const photos:string[]=[];
 const text=description.replace(/(?:Foto da visita:\s*)?(\/api\/visits\/photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![a-z0-9/-])/gi,(_match,path:string)=>{if(!photos.includes(path))photos.push(path);return '';}).replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n').trim();
 return {text,photos};
}
