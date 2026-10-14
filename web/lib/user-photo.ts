import 'server-only';
import sharp from 'sharp';
export async function normalizeUserPhoto(input:Buffer) {
 if(!input.length||input.length>2*1024*1024)throw Error('Envie uma foto de até 2 MB.');
 const image=sharp(input,{limitInputPixels:20000000,animated:false});
 const metadata=await image.metadata();
 if(!['jpeg','png','webp'].includes(metadata.format||''))throw Error('Use uma imagem JPG, PNG ou WebP.');
 return image.rotate().resize(256,256,{fit:'cover'}).jpeg({quality:85}).toBuffer();
}
