'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import { api, apiBlob } from '../lib/api';
import { errorText } from '../lib/errors';
import { dateTime } from '../lib/format';
import { ErrorBox } from './ui/feedback';
import { inIosApp, nativePhoto } from '../lib/native';

export const MAX_PHOTOS = 10;

/** A phone photo shrunk to at most 1600 px and saved as JPEG (150–400 KB instead of 3–8 MB). */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('IMAGE_UNREADABLE')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k); canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally { URL.revokeObjectURL(url); }
}

/**
 * The camera / gallery button: on a phone it opens the camera straight away. In the iPhone app iOS's own
 * camera sheet opens (take a photo or pick one from the library).
 */
function PickButton({ onFiles, disabled, label }: { onFiles: (files: File[]) => void; disabled?: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  async function pick() {
    if (inIosApp()) {
      try { const file = await nativePhoto(); if (file) onFiles([file]); return; }
      catch { /* the camera failed: the file picker below still works */ }
    }
    ref.current?.click();
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple hidden aria-label={label}
        onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) onFiles(files); }} />
      <button type="button" disabled={disabled} onClick={() => void pick()}
        className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line bg-paper text-xs font-semibold text-mute transition-colors hover:border-ink hover:text-ink disabled:opacity-40">
        <Camera className="h-6 w-6" />{label}
      </button>
    </>
  );
}

/** New order: photos are taken now and uploaded once the order exists. */
export function PhotoPicker({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const [error, setError] = useState('');
  async function add(files: File[]) {
    setError('');
    const room = MAX_PHOTOS - photos.length;
    try { onChange([...photos, ...await Promise.all(files.slice(0, room).map(shrinkPhoto))]); }
    catch { setError("Rasmni ochib bo'lmadi"); }
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((p, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-xl border bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Rasm ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange(photos.filter((_, k) => k !== i))} aria-label="Rasmni olib tashlash"
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"><X className="h-4 w-4" /></button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && <PickButton onFiles={add} label="Rasmga olish" />}
      </div>
      <ErrorBox>{error}</ErrorBox>
    </div>
  );
}

/** Uploads the photos picked on the new-order screen; returns how many failed. */
export async function uploadPhotos(orderId: string, photos: string[]) {
  let failed = 0;
  for (const image of photos) {
    try { await api(`/orders/${orderId}/photos`, { method: 'POST', body: JSON.stringify({ image }) }); } catch { failed++; }
  }
  return failed;
}

type Photo = { id: string; createdAt: string };

function Thumb({ orderId, photo, onOpen }: { orderId: string; photo: Photo; onOpen: (url: string) => void }) {
  const { data: url } = useQuery({ queryKey: ['photo', orderId, photo.id], queryFn: async () => URL.createObjectURL(await apiBlob(`/orders/${orderId}/photos/${photo.id}`)), staleTime: Infinity, gcTime: 600_000 });
  return (
    <button type="button" onClick={() => url && onOpen(url)} className="relative aspect-square overflow-hidden rounded-xl border bg-paper">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={`Qabul rasmi, ${dateTime(photo.createdAt)}`} className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-black/[0.04]" />}
    </button>
  );
}

/** Order page: the intake photos, a full-screen viewer, adding more and removing one. */
export function OrderPhotos({ orderId, canAdd, canDelete }: { orderId: string; canAdd: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const { data: photos } = useQuery({ queryKey: ['photos', orderId], queryFn: () => api<Photo[]>(`/orders/${orderId}/photos`) });
  const [open, setOpen] = useState<{ url: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    addEventListener('keydown', esc); return () => removeEventListener('keydown', esc);
  }, [open]);
  if (!photos || (!photos.length && !canAdd)) return null;

  async function add(files: File[]) {
    setBusy(true); setError('');
    try {
      const room = MAX_PHOTOS - photos!.length;
      for (const f of files.slice(0, room)) await api(`/orders/${orderId}/photos`, { method: 'POST', body: JSON.stringify({ image: await shrinkPhoto(f) }) });
      await qc.invalidateQueries({ queryKey: ['photos', orderId] });
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Bu rasm o'chirilsinmi?")) return;
    try { await api(`/orders/${orderId}/photos/${id}`, { method: 'DELETE' }); setOpen(null); await qc.invalidateQueries({ queryKey: ['photos', orderId] }); }
    catch (e) { setError(errorText(e)); }
  }

  return (
    <section className="rounded-2xl border bg-white p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Qabul paytidagi holati</h2>
        <span className="text-xs text-mute">{photos.length} / {MAX_PHOTOS} ta rasm</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map(p => <Thumb key={p.id} orderId={orderId} photo={p} onOpen={url => setOpen({ url, id: p.id })} />)}
        {canAdd && photos.length < MAX_PHOTOS && (busy
          ? <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed text-xs text-mute">Yuklanmoqda…</div>
          : <PickButton onFiles={files => void add(files)} label={photos.length ? "Yana qo'shish" : 'Rasmga olish'} />)}
      </div>
      {!photos.length && <p className="mt-2 flex items-center gap-1.5 text-xs text-mute"><ImagePlus className="h-3.5 w-3.5" /> Qurilmaning tirnalgan, singan joylarini rasmga olib qo&apos;ying — keyin bahs bo&apos;lmaydi.</p>}
      <ErrorBox className="mt-2">{error}</ErrorBox>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Rasm" className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setOpen(null)}>
          <div className="flex justify-end gap-2 p-3">
            {canDelete && <button type="button" onClick={e => { e.stopPropagation(); void remove(open.id); }} className="flex h-10 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white"><Trash2 className="h-4 w-4" /> O&apos;chirish</button>}
            <button type="button" aria-label="Yopish" className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white"><X className="h-5 w-5" /></button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt="Qabul rasmi" className="mx-auto min-h-0 flex-1 object-contain p-3" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </section>
  );
}
