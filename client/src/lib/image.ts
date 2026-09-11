const MAX_EDGE = 1600;
const THUMB_EDGE = 320;
const TARGET_BYTES = 400_000;
const MIN_QUALITY = 0.5;

type Decoded = { source: CanvasImageSource; width: number; height: number; cleanup: () => void };

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      // Modern browsers apply EXIF rotation for us when asked.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch {
      // Fall through to the <img> path (older Safari, some HEIC edge cases).
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

function drawToCanvas(source: CanvasImageSource, width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported on this device");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/jpeg", quality);
  });
}

/**
 * Re-encodes any photo (including iOS HEIC) to a compressed JPEG capped at
 * ~1600px and ~400KB, stepping quality down until it fits.
 */
export async function compressImage(file: Blob, options: { maxEdge?: number; targetBytes?: number } = {}): Promise<{ blob: Blob; width: number; height: number }> {
  const maxEdge = options.maxEdge ?? MAX_EDGE;
  const targetBytes = options.targetBytes ?? TARGET_BYTES;
  const decoded = await decode(file);
  try {
    const canvas = drawToCanvas(decoded.source, decoded.width, decoded.height, maxEdge);
    let quality = 0.82;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > targetBytes && quality > MIN_QUALITY) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, quality);
    }
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    decoded.cleanup();
  }
}

export async function makeThumbnail(file: Blob): Promise<Blob> {
  const { blob } = await compressImage(file, { maxEdge: THUMB_EDGE, targetBytes: 60_000 });
  return blob;
}
