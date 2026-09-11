export type AttachmentKind = "invoice" | "receipt";

export function attachmentUrl(id: number): string {
  return `/api/attachments/${id}/file`;
}

export function thumbUrl(id: number): string {
  return `/api/attachments/${id}/thumb`;
}

export function downloadUrl(id: number): string {
  return `/api/attachments/${id}/file?download=1`;
}

function upload(url: string, blob: Blob, contentType: string, onProgress?: (fraction: number) => void): Promise<{ id?: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = event => { if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {}); } catch { resolve({}); }
      } else {
        let message = `Upload failed (${xhr.status})`;
        try { message = JSON.parse(xhr.responseText).error ?? message; } catch { /* keep default */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(blob);
  });
}

export async function uploadAttachment(blob: Blob, meta: { kind: AttachmentKind; name: string; width?: number; height?: number }, onProgress?: (fraction: number) => void): Promise<number> {
  const params = new URLSearchParams({ kind: meta.kind, name: meta.name });
  if (meta.width) params.set("width", String(meta.width));
  if (meta.height) params.set("height", String(meta.height));
  const result = await upload(`/api/attachments/upload?${params.toString()}`, blob, blob.type || "application/octet-stream", onProgress);
  if (!result.id) throw new Error("Upload did not return a file id");
  return result.id;
}

export async function uploadThumbnail(id: number, blob: Blob): Promise<void> {
  try {
    await upload(`/api/attachments/${id}/thumb`, blob, "image/jpeg");
  } catch {
    // Thumbnails are a nice-to-have — the full image still renders if this fails.
  }
}
