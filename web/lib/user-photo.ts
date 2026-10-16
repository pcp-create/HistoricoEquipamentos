import 'server-only';
import sharp from 'sharp';
export async function normalizeUserPhoto(input:Buffer) {
 if(!input.length||input.length>2*1024*1024)throw Error('Envie uma foto de até 2 MB.');
 const image=sharp(input,{limitInputPixels:20000000,animated:false});
 const metadata=await image.metadata();
 if(!['jpeg','png','webp'].includes(metadata.format||''))throw Error('Use uma imagem JPG, PNG ou WebP.');
 const thumbnail=image.rotate().resize(256,256,{fit:'cover'});
 return metadata.hasAlpha
  ? thumbnail.png().toBuffer()
  : thumbnail.jpeg({quality:85}).toBuffer();
}

// Legacy photos remain JPEG; new transparent photos are stored as PNG.
export function userPhotoContentType(image: Buffer) {
 return image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  ? 'image/png' : 'image/jpeg';
}
