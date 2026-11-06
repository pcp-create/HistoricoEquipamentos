import sharp from 'sharp';

/** Resize copies for the PDF only; never replace the original checklist photos. */
export async function reportPhoto(content: Uint8Array, signature: boolean, byteBudget: number) {
  let result: Buffer = Buffer.from(content);
  for (const [size, quality] of [[1200,82],[960,70],[720,60],[480,45],[320,35]] as const) {
    const image=sharp(content).rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true});
    result=await (signature?image.png({compressionLevel:9,palette:true,colours:32,dither:0}):image.flatten({background:'#fff'}).jpeg({quality,mozjpeg:true})).toBuffer();
    if(result.length<=byteBudget)break;
  }
  return result;
}
