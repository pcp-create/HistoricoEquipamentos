import {visitPhotoNote} from '@/lib/tasks/visit-photo-note';
export default function TaskNoteDescription({description}:{description:string}){
 const {text,photos}=visitPhotoNote(description||'');
 return <>{text&&<p>{text}</p>}{photos.length>0&&<div className="task-visit-photos" aria-label="Fotos da visita">{photos.map((path,index)=><a key={path} href={path} target="_blank" rel="noreferrer" title={`Abrir foto ${index+1} da visita`}><img src={path} alt={`Foto ${index+1} da visita`} loading="lazy" width={150} height={112}/></a>)}</div>}</>;
}
