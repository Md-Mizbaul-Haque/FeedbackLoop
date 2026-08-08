"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const AVATAR_SIZE = 256;
const SIGNED_URL_TTL_SECONDS = 3600;
const REFRESH_BEFORE_MS = 10 * 60 * 1000;

export const AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const AVATAR_MAX_SIZE = 2 * 1024 * 1024;

export function isStorageAvatarPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[^/]+\/[^/]+\.\w+$/.test(value)
  );
}

export function getAvatarStoragePath(userId: string): string {
  return `${userId}/avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
}

export async function resizeAvatar(file: File, maxSize = AVATAR_SIZE): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read the image file."));
      img.src = objectUrl;
    });

    const scale = Math.min(maxSize / image.width, maxSize / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser.");

    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob) throw new Error("Could not process the image.");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function useAvatarUrl(user: User | null): string | null {
  const meta = user?.user_metadata?.avatar_url;
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(
    null,
  );

  const isExternalUrl =
    typeof meta === "string" && /^https?:\/\//i.test(meta);
  const isStoragePath = isStorageAvatarPath(meta);

  useEffect(() => {
    if (!isStoragePath || typeof meta !== "string") return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const resolve = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(meta, SIGNED_URL_TTL_SECONDS);

      if (disposed) return;
      if (!error && data) setSigned({ path: meta, url: data.signedUrl });
      timer = setTimeout(
        resolve,
        SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_BEFORE_MS,
      );
    };

    resolve();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [isStoragePath, meta]);

  if (isExternalUrl && typeof meta === "string") return meta;
  return signed && signed.path === meta ? signed.url : null;
}
