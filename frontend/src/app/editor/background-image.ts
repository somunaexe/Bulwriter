// Downscales/compresses an uploaded image client-side before it's stored
// as a data URI (see ProjectService.setBackground) — an uploaded movie
// poster or similar could easily be several MB and much larger than the
// editor chrome ever needs to render it at, so this caps both dimensions
// and re-encodes as JPEG rather than storing the original bytes.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_DATA_URI_LENGTH = 5_000_000; // ~5MB of base64 — matches the backend's request cap with headroom

export async function fileToBackgroundDataUri(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUri = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (dataUri.length > MAX_DATA_URI_LENGTH) {
    throw new Error('That image is too large even after compression — try a smaller one.');
  }
  return dataUri;
}
