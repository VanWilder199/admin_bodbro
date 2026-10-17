import type { ReactNode } from 'react';

/** Подпись над полем формы: поле `Input` из packages/ui подписей не содержит. */
export function FormLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block px-1 text-caption font-semibold text-muted-foreground">
      {children}
    </label>
  );
}
