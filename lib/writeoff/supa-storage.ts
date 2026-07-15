import { getServiceClient } from "@/lib/db/client";

/** 감액 시트(.xlsx) Supabase Storage 저장 (버킷 'sheets'). */

const BUCKET = "sheets";
const obj = (slug: string) => `${slug}.xlsx`;
const CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function ensureBucket(c: NonNullable<ReturnType<typeof getServiceClient>>) {
  const { data } = await c.storage.listBuckets();
  if (!data?.some((b) => b.name === BUCKET)) {
    await c.storage.createBucket(BUCKET, { public: false });
  }
}

export async function putSheet(slug: string, buf: Buffer): Promise<void> {
  const c = getServiceClient();
  if (!c) throw new Error("Supabase 미설정");
  await ensureBucket(c);
  const { error } = await c.storage.from(BUCKET).upload(obj(slug), buf, { upsert: true, contentType: CT });
  if (error) throw error;
}

export async function hasSheetBlob(slug: string): Promise<boolean> {
  const c = getServiceClient();
  if (!c) return false;
  const { data } = await c.storage.from(BUCKET).list("", { search: obj(slug) });
  return Boolean(data?.some((f) => f.name === obj(slug)));
}

export async function getSheetBuffer(slug: string): Promise<Buffer | null> {
  const c = getServiceClient();
  if (!c) return null;
  const { data, error } = await c.storage.from(BUCKET).download(obj(slug));
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
