import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getUser } from '@/lib/auth';
import { ALLOWED_TYPES, MAX_BYTES } from '@/lib/storage';

// Issues short-lived tokens so the browser can upload straight to Vercel Blob
// (no 4.5 MB serverless body limit, so large photos and videos work).
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getUser();
        if (!user) throw new Error('Not signed in');
        if (!/^(dealers|group)\//.test(pathname)) throw new Error('Bad upload path');
        return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
