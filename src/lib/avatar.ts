"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const AVATAR_SIZE = 256;
const SIGNED_URL_TTL_SECONDS = 3600;
const REFRESH_BEFORE_MS = 10 * 60 * 1000;
/**
 * Signed URLs are valid for SIGNED_URL_TTL_SECONDS. Treat a cached URL as
 * fresh for almost its whole lifetime so revisiting a page (or switching
 * between the header and profile, which both render the avatar) doesn't
 * re-fetch it. react-query shows the cached URL immediately and refreshes
 * in the background once stale.
 */
const SIGNED_URL_STALE_MS = (SIGNED_URL_TTL_SECONDS - REFRESH_BEFORE_MS / 1000) * 1000;
/** Keep the cached URL around for the full signed-URL lifetime, even while
 * no component is mounted (e.g. navigating away from /profile). */
const SIGNED_URL_GC_MS = SIGNED_URL_TTL_SECONDS * 1000;

const avatarUrlQueryKey = (path: string) => ["avatar", "signed-url", path] as const;

interface SignedAvatar {
  path: string;
  url: string;
}

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
  const isExternalUrl =
    typeof meta === "string" && /^https?:\/\//i.test(meta);
  const isStoragePath = isStorageAvatarPath(meta);
  const path = isStoragePath && typeof meta === "string" ? meta : "";

  const { data: signed, refetch } = useQuery({
    queryKey: avatarUrlQueryKey(path),
    queryFn: async (): Promise<SignedAvatar | null> => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data) return null;
      return { path, url: data.signedUrl };
    },
    enabled: isStoragePath && path !== "",
    staleTime: SIGNED_URL_STALE_MS,
    gcTime: SIGNED_URL_GC_MS,
  });

  // While a page stays open past the signed URL's TTL, refresh it just
  // before it expires so the avatar never breaks mid-session.
  useEffect(() => {
    if (!isStoragePath || path === "") return;
    const timer = setTimeout(() => {
      refetch();
    }, SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_BEFORE_MS);
    return () => clearTimeout(timer);
  }, [isStoragePath, path, refetch]);

  if (isExternalUrl && typeof meta === "string") return meta;
  return signed?.path === path && signed.url ? signed.url : null;
}
