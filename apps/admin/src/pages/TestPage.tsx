import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@podbor/ui/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@podbor/ui/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@podbor/ui/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@podbor/ui/components/ui/table';
import { Textarea } from '@podbor/ui/components/ui/textarea';
import { ReportView } from '@podbor/ui';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { mockHeader, mockReport } from '../mocks/report';

/*
 * Песочница каркаса: проверяет, что токены, шрифт и новые shadcn-примитивы
 * (Dialog, Tabs, Table, DropdownMenu, Textarea, Toaster) работают в приложении,
 * и что ReportView из @podbor/ui рендерится на моках.
 */
export function TestPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <section className="space-y-4">
        <h1 className="text-title font-semibold">Тест каркаса админки</h1>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => toast.success('Toaster работает')}>Toast</Button>
          <Button variant="secondary">Secondary</Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Вернуть на доработку</DialogTitle>
                <DialogDescription>Подборщик получит причину в Telegram.</DialogDescription>
              </DialogHeader>
              <Textarea placeholder="Причина" />
              <DialogFooter>
                <Button>Отправить</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Действия">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Подтвердить</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Заблокировать</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Ожидают</TabsTrigger>
            <TabsTrigger value="verified">Подтверждены</TabsTrigger>
            <TabsTrigger value="banned">Заблокированы</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            <div className="rounded-card bg-card p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Имя</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Иван Петров</TableCell>
                    <TableCell>ivan@example.com</TableCell>
                    <TableCell>
                      <Badge tone="warn">pending</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="verified">Список подтверждённых</TabsContent>
          <TabsContent value="banned">Список заблокированных</TabsContent>
        </Tabs>
      </section>

      <ReportView report={mockReport} header={mockHeader} showPrice />
    </main>
  );
}
