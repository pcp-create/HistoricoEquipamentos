const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Reduce on the device so large camera files never reach the upload endpoint. */
export async function prepareReportPhoto(file: File): Promise<File> {
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw Error('Cada foto deve ter no máximo 20 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('Use uma foto JPEG, PNG ou WebP.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    image.src = url;
    await image.decode();
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width * height > 80000000)
      throw Error('A foto excede o limite de resolução de 80 megapixels.');
    // Keep small originals intact, including signatures. The server normalizes them.
    if (Math.max(width, height) <= 2000 && file.size <= MAX_UPLOAD_BYTES) return file;
    const scale = Math.min(1, 2000 / Math.max(width, height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Não foi possível preparar a foto neste navegador.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.8, 0.75]) {
      const blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES)
        return new File([blob], (file.name.replace(/\.[^.]+$/, '') || 'foto') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
    }
    throw Error('Não foi possível reduzir a foto com qualidade suficiente. Selecione outra imagem.');
  } catch (error) {
    if (error instanceof DOMException) throw Error('Não foi possível ler a foto. Use JPEG, PNG ou WebP.');
    throw error;
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
