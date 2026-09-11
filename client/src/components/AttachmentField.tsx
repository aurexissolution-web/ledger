import { attachmentUrl, downloadUrl, thumbUrl, uploadAttachment, uploadThumbnail, type AttachmentKind } from "@/lib/attachments";
import { compressImage, makeThumbnail } from "@/lib/image";
import { trpc } from "@/lib/trpc";
import { Camera, FileText, Loader2, Upload, X } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Progress } from "./ui/progress";

type PendingUpload = { key: string; name: string; progress: number; error: string | null };

const MAX_PDF_BYTES = 5_000_000;

export function AttachmentField({ kind, value, onChange, label, max = 8, compact = false }: { kind: AttachmentKind; value: number[]; onChange: (ids: number[]) => void; label?: string; max?: number; compact?: boolean }) {
  const utils = trpc.useUtils();
  const filesQuery = trpc.attachments.byIds.useQuery({ ids: value }, { enabled: value.length > 0 });
  const deleteAttachment = trpc.attachments.delete.useMutation();
  const files = filesQuery.data ?? [];
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const uploadedThisSession = useRef<Set<number>>(new Set());
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const remainingSlots = Math.max(0, max - value.length - pending.length);

  const processFile = async (file: File) => {
    if (value.length + pending.length >= max) return;
    const key = `${file.name}-${Date.now()}-${Math.random()}`;
    setPending(rows => [...rows, { key, name: file.name, progress: 0, error: null }]);
    const setRow = (changes: Partial<PendingUpload>) => setPending(rows => rows.map(row => (row.key === key ? { ...row, ...changes } : row)));

    try {
      let id: number;
      if (file.type === "application/pdf") {
        if (file.size > MAX_PDF_BYTES) throw new Error("PDFs must be under 5 MB");
        id = await uploadAttachment(file, { kind, name: file.name || "document.pdf" }, fraction => setRow({ progress: fraction * 100 }));
      } else {
        const compressed = await compressImage(file);
        id = await uploadAttachment(compressed.blob, { kind, name: file.name || "photo.jpg", width: compressed.width, height: compressed.height }, fraction => setRow({ progress: fraction * 100 }));
        makeThumbnail(compressed.blob).then(thumb => uploadThumbnail(id, thumb)).catch(() => {});
      }
      uploadedThisSession.current.add(id);
      onChange([...value, id]);
      setPending(rows => rows.filter(row => row.key !== key));
    } catch (error) {
      setRow({ error: error instanceof Error ? error.message : "Upload failed" });
      setTimeout(() => setPending(rows => rows.filter(row => row.key !== key)), 4000);
    }
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []).slice(0, remainingSlots);
    event.target.value = "";
    for (const file of picked) {
      if (file.type !== "application/pdf" && !file.type.startsWith("image/")) { toast.error(`${file.name}: only photos and PDFs are supported`); continue; }
      void processFile(file);
    }
  };

  const removeFile = (id: number) => {
    onChange(value.filter(v => v !== id));
    if (uploadedThisSession.current.has(id)) {
      uploadedThisSession.current.delete(id);
      deleteAttachment.mutate({ id }, { onSettled: () => utils.attachments.byIds.invalidate() });
    }
  };

  const gap = compact ? "gap-2" : "gap-3";

  return (
    <div className="space-y-2">
      {label ? <p className="text-sm font-semibold">{label}</p> : null}
      <div className={`flex flex-wrap ${gap}`}>
        {files.map(file => (
          <AttachmentThumb key={file.id} id={file.id} name={file.fileName} mime={file.mimeType} hasThumb={file.hasThumb} compact={compact} onOpen={() => (file.mimeType === "application/pdf" ? window.open(downloadUrl(file.id), "_blank") : setLightbox(file.id))} onRemove={() => removeFile(file.id)} />
        ))}
        {pending.map(row => (
          <div key={row.key} className={`relative grid ${compact ? "h-16 w-16" : "h-20 w-20"} place-items-center rounded-xl border border-dashed ${row.error ? "border-[#e0a08c] bg-[#fff4ef]" : "border-[#cfcabb] bg-[#f7f6f0]"} p-1.5 text-center`}>
            {row.error ? <p className="text-[10px] leading-tight text-[#b34d2e]">{row.error}</p> : (
              <div className="w-full space-y-1.5"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /><Progress value={row.progress} className="h-1" /></div>
            )}
          </div>
        ))}
        {remainingSlots > 0 ? (
          <div className={`flex ${gap}`}>
            <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => cameraInput.current?.click()}><Camera className={compact ? "h-3.5 w-3.5" : "mr-1 h-4 w-4"} />{compact ? null : "Take photo"}</Button>
            <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={() => fileInput.current?.click()}><Upload className={compact ? "h-3.5 w-3.5" : "mr-1 h-4 w-4"} />{compact ? null : "Upload"}</Button>
          </div>
        ) : null}
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePick} />
      <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handlePick} />
      <p className="text-xs text-muted-foreground">{value.length}/{max} attached</p>

      <Dialog open={lightbox !== null} onOpenChange={open => { if (!open) setLightbox(null); }}>
        <DialogContent className="max-w-2xl border-[#ddd8cc] bg-[#fffefa] p-2">
          {lightbox !== null ? <img src={attachmentUrl(lightbox)} alt="Attachment" className="max-h-[80vh] w-full rounded-xl object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttachmentThumb({ id, name, mime, hasThumb, compact, onOpen, onRemove }: { id: number; name: string; mime: string; hasThumb: boolean; compact: boolean; onOpen: () => void; onRemove: () => void }) {
  const size = compact ? "h-16 w-16" : "h-20 w-20";
  return (
    <div className={`group relative ${size} shrink-0 overflow-hidden rounded-xl border border-[#e3dfd2] bg-[#f7f6f0]`}>
      <button type="button" onClick={onOpen} className="block h-full w-full" aria-label={`Open ${name}`}>
        {mime === "application/pdf" ? (
          <span className="grid h-full w-full place-items-center text-[#9f442c]"><FileText className={compact ? "h-5 w-5" : "h-6 w-6"} /></span>
        ) : (
          <img src={hasThumb ? thumbUrl(id) : attachmentUrl(id)} alt={name} className="h-full w-full object-cover" loading="lazy" />
        )}
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
