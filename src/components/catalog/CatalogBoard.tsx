"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  saveAchievementAction,
  saveCosmeticAction,
  setAchievementActiveAction,
  setCosmeticActiveAction,
} from "@/app/(app)/admin/catalogue/actions";
import { CheckboxField } from "@/components/CheckboxField";
import { Switch } from "@/components/Switch";
import {
  Avatar,
  BottomSheet,
  Button,
  Chip,
  FieldError,
  MedalIcon,
  Segmented,
  TextField,
} from "@/components/ui";
import type { RuleType } from "@/server/achievements/rules";
import type {
  CatalogAchievement,
  CatalogCosmetic,
  CatalogField,
  CatalogResult,
} from "@/server/catalog";

type Tab = "cosmetics" | "achievements";
type Errors = Partial<Record<CatalogField, string>>;

const tabs = [
  { value: "cosmetics", label: "Cosmétiques" },
  { value: "achievements", label: "Succès" },
] as const;

const types = [
  { value: "avatar", label: "Avatar" },
  { value: "border", label: "Bordure" },
] as const;

const ruleLabels: Record<RuleType, string> = {
  wagers_count: "Paris misés",
  single_stake: "Mise d'un coup",
  all_in: "Tapis",
  wins_count: "Paris gagnés",
  win_streak: "Série",
  broke: "À sec",
  bets_created: "Paris lancés",
  purchases_count: "Achats",
};
const RULES = Object.keys(ruleLabels) as RuleType[];

/** Interrupteur actif / désactivé (catalogue.html). */
function ActiveSwitch({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  return <Switch label={`${label} actif`} on={active} onChange={onChange} />;
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col rounded-md bg-surface px-4 [&>*+*]:border-t [&>*+*]:border-line">
      {children}
    </div>
  );
}

function CosmeticForm({ item, onDone }: { item: CatalogCosmetic | "new"; onDone: () => void }) {
  const creating = item === "new";
  const [type, setType] = useState<"avatar" | "border">(creating ? "border" : item.type);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("type", type);
    if (!creating) form.set("id", item.id);
    startTransition(async () => {
      const result: CatalogResult = await saveCosmeticAction(form);
      if (result.ok) onDone();
      else setErrors(result.fieldErrors);
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {creating && (
        <Segmented label="Type de cosmétique" options={types} value={type} onChange={setType} />
      )}
      <TextField
        label="Nom"
        name="name"
        defaultValue={creating ? "" : item.name}
        maxLength={40}
        error={errors.name}
      />
      <TextField
        label="Prix en clopes"
        name="price"
        inputMode="numeric"
        defaultValue={creating ? "0" : String(item.price)}
        error={errors.price}
      />
      {type === "border" ? (
        <TextField
          label="Couleur"
          name="color"
          placeholder="#RRGGBB"
          defaultValue={creating ? "" : (item.tintColor ?? "")}
          error={errors.color}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="cosmetic-image"
            className="text-[12px] leading-4 font-semibold text-ink-muted"
          >
            Image (JPEG, PNG ou WebP, 5 Mo au plus)
          </label>
          <input
            id="cosmetic-image"
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            aria-invalid={errors.image ? true : undefined}
            className="text-[14px] text-ink-muted"
          />
          {errors.image && <FieldError id="cosmetic-image-error">{errors.image}</FieldError>}
        </div>
      )}
      <TextField
        label="Ordre"
        name="position"
        inputMode="numeric"
        defaultValue={creating ? "0" : String(item.position)}
        error={errors.position}
      />
      <Button type="submit" disabled={pending}>
        Enregistrer
      </Button>
    </form>
  );
}

function AchievementForm({
  item,
  onDone,
}: {
  item: CatalogAchievement | "new";
  onDone: () => void;
}) {
  const creating = item === "new";
  const [rule, setRule] = useState<RuleType>(creating ? "wagers_count" : item.ruleType);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("ruleType", rule);
    if (!creating) form.set("id", item.id);
    startTransition(async () => {
      const result = await saveAchievementAction(form);
      if (result.ok) onDone();
      else setErrors(result.fieldErrors);
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] leading-4 font-semibold text-ink-muted">Règle</span>
        {creating ? (
          <div className="flex flex-wrap gap-2">
            {RULES.map((r) => (
              <Chip key={r} selected={rule === r} onClick={() => setRule(r)}>
                {ruleLabels[r]}
              </Chip>
            ))}
          </div>
        ) : (
          <span className="text-[15px] leading-5 font-semibold">{ruleLabels[rule]}</span>
        )}
      </div>
      {rule !== "broke" && (
        <TextField
          label="Seuil"
          name="value"
          inputMode="numeric"
          defaultValue={creating ? "" : String(item.ruleValue ?? "")}
          error={errors.value}
        />
      )}
      <TextField
        label="Nom"
        name="name"
        defaultValue={creating ? "" : item.name}
        maxLength={40}
        error={errors.name}
      />
      <TextField
        label="Récompense en clopes"
        name="reward"
        inputMode="numeric"
        defaultValue={creating ? "0" : String(item.reward)}
        error={errors.reward}
      />
      <TextField
        label="Ordre"
        name="position"
        inputMode="numeric"
        defaultValue={creating ? "0" : String(item.position)}
        error={errors.position}
      />
      <CheckboxField label="Caché" name="hidden" defaultChecked={!creating && item.hidden} />
      <Button type="submit" disabled={pending}>
        Enregistrer
      </Button>
    </form>
  );
}

/** Catalogue du super-admin : cosmétiques et succès, activation, formulaires en feuille. */
export function CatalogBoard({
  cosmetics,
  achievements,
  me,
}: {
  cosmetics: CatalogCosmetic[];
  achievements: CatalogAchievement[];
  /** Les bordures s'affichent autour de mon initiale, comme dans la boutique. */
  me: { username: string; image: string | null };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cosmetics");
  const [editCosmetic, setEditCosmetic] = useState<CatalogCosmetic | "new" | null>(null);
  const [editAchievement, setEditAchievement] = useState<CatalogAchievement | "new" | null>(null);
  const [, startTransition] = useTransition();

  const done = () => {
    setEditCosmetic(null);
    setEditAchievement(null);
    router.refresh();
  };
  const toggle = (run: () => Promise<void>) =>
    startTransition(async () => {
      await run();
      router.refresh();
    });

  return (
    <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
      <Segmented
        label="Partie du catalogue"
        options={tabs}
        value={tab}
        onChange={setTab}
        className="shrink-0"
      />
      {tab === "cosmetics" ? (
        <>
          <Rows>
            {cosmetics.map((c) => (
              <div key={c.id} className="flex min-h-[64px] items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditCosmetic(c)}
                  className="flex grow items-center gap-3 text-left"
                >
                  <Avatar
                    name={me.username}
                    src={c.type === "avatar" ? c.imageUrl : me.image}
                    ring={c.tintColor ?? undefined}
                    ringWidth={3}
                    size={40}
                    background="surface-raised"
                  />
                  <span className="flex flex-col">
                    <span className="text-[15px] leading-5 font-semibold">{c.name}</span>
                    <span className="font-mono text-[12px] leading-4 font-medium text-ink-subtle">
                      {c.type === "border" ? "BORDURE" : "AVATAR"} ·{" "}
                      {c.price === 0 ? "GRATUIT" : c.price}
                    </span>
                  </span>
                </button>
                <ActiveSwitch
                  label={c.name}
                  active={c.active}
                  onChange={(active) => toggle(() => setCosmeticActiveAction(c.id, active))}
                />
              </div>
            ))}
          </Rows>
          <p className="text-caption text-ink-subtle">
            Un cosmétique désactivé disparaît de la boutique ; ceux qui le possèdent le gardent.
          </p>
          <div className="grow" />
          <Button onClick={() => setEditCosmetic("new")}>Ajouter un cosmétique</Button>
        </>
      ) : (
        <>
          <Rows>
            {achievements.map((a) => (
              <div key={a.id} className="flex min-h-[64px] items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditAchievement(a)}
                  className="flex min-w-0 grow items-center gap-3 text-left"
                >
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted">
                    <MedalIcon size={20} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] leading-5 font-semibold">{a.name}</span>
                    <span className="text-caption text-ink-subtle">
                      {a.description} · +{a.reward}
                      {a.hidden && " · caché"}
                    </span>
                  </span>
                </button>
                <ActiveSwitch
                  label={a.name}
                  active={a.active}
                  onChange={(active) => toggle(() => setAchievementActiveAction(a.id, active))}
                />
              </div>
            ))}
          </Rows>
          <p className="text-caption text-ink-subtle">
            Un succès désactivé ne se débloque plus ; ceux qui l&apos;ont le gardent.
          </p>
          <div className="grow" />
          <Button onClick={() => setEditAchievement("new")}>Ajouter un succès</Button>
        </>
      )}
      <BottomSheet
        open={editCosmetic !== null}
        onClose={() => setEditCosmetic(null)}
        title={editCosmetic === "new" ? "Nouveau cosmétique" : (editCosmetic?.name ?? "")}
      >
        {editCosmetic && (
          <CosmeticForm
            key={editCosmetic === "new" ? "new" : editCosmetic.id}
            item={editCosmetic}
            onDone={done}
          />
        )}
      </BottomSheet>
      <BottomSheet
        open={editAchievement !== null}
        onClose={() => setEditAchievement(null)}
        title={editAchievement === "new" ? "Nouveau succès" : (editAchievement?.name ?? "")}
      >
        {editAchievement && (
          <AchievementForm
            key={editAchievement === "new" ? "new" : editAchievement.id}
            item={editAchievement}
            onDone={done}
          />
        )}
      </BottomSheet>
    </main>
  );
}
