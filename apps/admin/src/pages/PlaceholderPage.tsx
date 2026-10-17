import { Card } from '@podbor/ui/components/card';

/** Заглушка раздела до его задачи: ссылка в меню уже работает, а содержимое появится позже. */
export function PlaceholderPage({ title, task }: { title: string; task: string }) {
  return (
    <Card className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-title font-semibold">{title}</h1>
      <p className="text-body text-muted-foreground">Раздел появится в {task}.</p>
    </Card>
  );
}
