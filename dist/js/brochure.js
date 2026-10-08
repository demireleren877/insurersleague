// Team brochures: an image or the first page of a PDF, scaled down and compressed in the browser
// before it goes to the room server (which keeps it outside the broadcast state).
import { t } from './i18n.js';

const MAX_EDGE = 1400, MAX_BYTES = 900_000;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';

let pdfjs = null;
function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS}pdf.min.js`;
    script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`; resolve(window.pdfjsLib); };
    script.onerror = () => { pdfjs = null; reject(Error(t('The PDF reader could not be loaded. Upload a PNG or JPG instead.', 'PDF okuyucu yüklenemedi. Bunun yerine PNG ya da JPG yükle.'))); };
    document.head.appendChild(script);
  });
  return pdfjs;
}

async function pdfFirstPage(file) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(3, MAX_EDGE / Math.max(base.width, base.height)) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function prepareBrochure(file) {
  if (file.size > 25_000_000) throw Error(t('The file must be under 25 MB.', 'Dosya 25 MB’tan küçük olmalı.'));
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf && !/^image\//.test(file.type)) throw Error(t('Upload a PNG, JPG or PDF.', 'PNG, JPG ya da PDF yükle.'));
  let source;
  try { source = isPdf ? await pdfFirstPage(file) : await createImageBitmap(file); }
  catch (error) { throw Error(error?.message?.includes('PDF') ? error.message : t('The file could not be read as an image.', 'Dosya resim olarak okunamadı.')); }
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  let blob = null;
  for (const quality of [0.86, 0.76, 0.66, 0.55, 0.45]) {
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_BYTES) break;
  }
  if (!blob) throw Error(t('The brochure could not be prepared.', 'Broşür hazırlanamadı.'));
  return { blob, w, h };
}
