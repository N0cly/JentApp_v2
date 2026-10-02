import { readPhoto } from "@/server/avatars";

// Photos de profil : nom aléatoire et immuable, donc cache long.
export async function GET(_: Request, { params }: RouteContext<"/avatars/[file]">) {
  const { file } = await params;
  const photo = await readPhoto(file);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
