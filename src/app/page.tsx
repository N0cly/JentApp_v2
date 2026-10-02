import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-5">
      <h1 className="text-display">JentApp</h1>
      <Link href="/kit" className="text-label flex min-h-[44px] items-center text-brand">
        Voir le kit d&apos;interface
      </Link>
    </main>
  );
}
