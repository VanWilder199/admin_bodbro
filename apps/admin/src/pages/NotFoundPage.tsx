import { Card } from '@podbor/ui/components/card';
import { Button } from '@podbor/ui/components/ui/button';
import { Link } from 'react-router-dom';

/** 404 внутри layout: меню остаётся, админ может перейти в нужный раздел. */
export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-sm space-y-4 p-6 text-center">
      <h1 className="text-title font-semibold">Страница не найдена</h1>
      <p className="text-body text-muted-foreground">Такого адреса в админке нет.</p>
      <Button asChild block>
        <Link to="/moderation">К модерации</Link>
      </Button>
    </Card>
  );
}
