import type { ReactNode } from 'react';

/** Пустое состояние списка: заголовок и, при необходимости, пояснение. */
export function EmptyState({ title, hint, icon }: { title: string; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-card p-10 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <p className="text-body font-semibold text-foreground">{title}</p>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}
