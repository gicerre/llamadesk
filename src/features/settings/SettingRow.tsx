/** Riga di impostazione: etichetta a sinistra, controllo a destra. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</span>
        {description && (
          <span className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
            {description}
          </span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
