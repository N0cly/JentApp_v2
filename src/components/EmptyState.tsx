/** État vide d'un onglet en M1 : une phrase, sans action. */
export function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex grow items-center justify-center px-5 pb-8">
      <p className="text-body text-center text-ink-muted">{children}</p>
    </div>
  );
}
