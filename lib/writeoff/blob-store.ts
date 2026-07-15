import { put } from "@vercel/blob";
import { redis } from "@/lib/cloud";

/** 감액 시트(.xlsx) 클라우드 저장 (Vercel Blob) + URL을 Redis에 기록. */

const urlKey = (slug: string) => `slab:sheeturl:${slug}`;

export async function putSheet(slug: string, buf: Buffer): Promise<void> {
  const { url } = await put(`sheets/${slug}.xlsx`, buf, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await redis().set(urlKey(slug), url);
}

export async function hasSheetBlob(slug: string): Promise<boolean> {
  return Boolean(await redis().get(urlKey(slug)));
}

export async function getSheetBuffer(slug: string): Promise<Buffer | null> {
  const url = await redis().get<string>(urlKey(slug));
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}
