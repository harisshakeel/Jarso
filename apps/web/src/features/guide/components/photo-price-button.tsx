"use client";

import {
  guideCopy,
  MAX_PHOTO_BYTES,
  PHOTO_MAX_SIDE,
  PHOTO_TYPES,
  type PhotoPriceResult,
} from "@jarso/core/guide";
import { CameraIcon } from "lucide-react";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { readPriceFromPhotoAction } from "../server/actions";

/** JPEG qualities tried in turn until the photo fits under MAX_PHOTO_BYTES. */
const QUALITIES = [0.85, 0.7, 0.55, 0.4];
/** The photo read has its own 20 s deadline on the server; this leaves room for the upload. */
const READ_TIMEOUT_MS = 35_000;

function bytesOf(dataUrl: string): number {
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((data.length * 3) / 4);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** The photo decoded for drawing, or null where the browser can't. */
async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        done: () => bitmap.close(),
      };
    } catch {
      // Some formats only decode through an <img>; try that next.
    }
  }
  if (typeof Image === "undefined" || typeof URL?.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Photo did not load"));
      image.src = url;
    });
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    done: () => URL.revokeObjectURL(url),
  };
}

/**
 * The photo as a JPEG data URL, at most PHOTO_MAX_SIDE on its longest side and MAX_PHOTO_BYTES,
 * drawn on a canvas in the browser so a camera photo uploads in a moment. Where there is no
 * canvas, a photo already small enough is sent as it is. Null when it can't be made to fit.
 */
export async function shrinkPhoto(file: File): Promise<string | null> {
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  const context = canvas?.getContext?.("2d") ?? null;
  if (!canvas || !context) {
    const fits =
      (PHOTO_TYPES as readonly string[]).includes(file.type) && file.size <= MAX_PHOTO_BYTES;
    return fits ? readAsDataUrl(file) : null;
  }
  const photo = await decode(file);
  if (!photo || photo.width === 0 || photo.height === 0) return null;
  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(photo.width, photo.height));
    canvas.width = Math.max(1, Math.round(photo.width * scale));
    canvas.height = Math.max(1, Math.round(photo.height * scale));
    context.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
  } finally {
    photo.done();
  }
  for (const quality of QUALITIES) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.startsWith("data:image/jpeg") && bytesOf(url) <= MAX_PHOTO_BYTES) return url;
  }
  return null;
}

/**
 * "Snap a price" (demo 3, photo price check): the camera or a photo of a price tag or receipt,
 * shrunk in the browser and read on the server. A price that was found comes back through
 * `onResult` with a ready question for Jarso and a goal the child could make; a photo without
 * one says so here and still calls `onResult` (with `found: false`) so the page can reset.
 * The photo is never stored.
 */
export function PhotoPriceButton({
  onResult,
  onPendingChange,
  disabled = false,
  compact = false,
  className,
}: {
  onResult: (result: PhotoPriceResult) => void;
  /** For the page to hold its composer while a photo is read. */
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  /** Icon only, for a composer row; the name stays as its accessible label. */
  compact?: boolean;
  className?: string;
}) {
  const copy = guideCopy.photo;
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared at once, so picking the same photo again still counts as a change.
    event.target.value = "";
    if (!file || pending) return;
    setMessage(null);
    setPending(true);
    onPendingChange?.(true);
    try {
      const image = await shrinkPhoto(file).catch(() => null);
      if (!image) {
        setMessage(copy.notPhoto);
        return;
      }
      const result = await runOnline(() => readPriceFromPhotoAction(null, { image }), {
        timeoutMs: READ_TIMEOUT_MS,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      if (!result.data.found) {
        setMessage(result.data.reason === "other_currency" ? copy.otherCurrency : copy.none);
      }
      onResult(result.data);
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <div className={cn("grid justify-items-start gap-1", className)}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={copy.button}
        hidden
        onChange={onChange}
      />
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "default"}
        aria-label={compact ? copy.button : undefined}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
        disabled={disabled}
        loading={pending}
      >
        <CameraIcon aria-hidden />
        {compact ? null : copy.button}
      </Button>
      <span id={hintId} className="sr-only">
        {copy.hint}
      </span>
      {pending ? (
        <p role="status" className="flex items-center gap-2 text-ink-2 text-sm">
          <span aria-hidden className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
          {copy.reading}
        </p>
      ) : message ? (
        <p role="status" className="text-ink-2 text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
