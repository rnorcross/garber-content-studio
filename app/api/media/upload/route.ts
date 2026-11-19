import { handleUpload, handleUploadPresigned, type HandleUploadBody } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { getUser } from '@/lib/auth';
import { ALLOWED_TYPES, MAX_BYTES, storageMode } from '@/lib/storage';

async function check(pathname: string) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');
  if (!/^(dealers|group|body-shop)\//.test(pathname)) throw new Error('Bad upload path');
}

/** A body shop site's own files (body-shop/<slug>/assets/…) keep their exact names and can be replaced. */
const suffix = (pathname: string) => (/^body-shop\/[a-z0-9-]+\/assets\//.test(pathname)
  ? { addRandomSuffix: false, allowOverwrite: true }
  : { addRandomSuffix: true });

// Lets the browser upload straight to Vercel Blob (no 4.5 MB serverless body limit,
// so large photos and videos work). Newer stores (OIDC) get a presigned PUT URL;
// stores with a read-write token get a short-lived client token.
export async function POST(req: Request) {
  const body = await req.json();
  try {
    if (storageMode() === 'blob-presigned') {
      const result = await handleUploadPresigned({
        body,
        request: req,
        // only used to verify upload-completed callbacks, which this app doesn't use
        webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'unused',
        getSignedToken: async (pathname) => {
          await check(pathname);
          const token = await issueSignedToken({
            pathname, operations: ['put'], allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES,
            validUntil: Date.now() + 15 * 60 * 1000,
          });
          return { token, urlOptions: { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES, ...suffix(pathname) } };
        },
      });
      return Response.json(result);
    }
    const result = await handleUpload({
      body: body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        await check(pathname);
        return { allowedContentTypes: ALLOWED_TYPES, maximumSizeInBytes: MAX_BYTES, ...suffix(pathname) };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
