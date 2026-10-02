import { AlertIcon } from "@/components/ui";

/** Erreur qui ne tient pas à un champ : au-dessus du premier champ. */
export function FormMessage({ children }: { children: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md bg-loss-soft px-4 py-3">
      <span className="flex text-loss">
        <AlertIcon size={18} />
      </span>
      <span className="text-[14px] leading-5 font-semibold">{children}</span>
    </div>
  );
}
