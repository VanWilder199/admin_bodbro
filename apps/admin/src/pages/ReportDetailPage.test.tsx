import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import type { AdminReportDetail } from '@/api/types';
import { mail, uuid } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { server } from '@/test/server';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';
import { REPORT_STALE_MS } from './ReportDetailPage';

function renderReport(id: string, { from }: { from?: string } = {}) {
  storeSession();
  const user = userEvent.setup();
  const utils = renderRoutes(appRoutes, from ?? `/reports/${id}`);
  return { user, ...utils };
}

const location = () => screen.getByTestId('location').textContent;
const side = () => screen.findByRole('complementary', { name: 'Данные отчёта' });
const withDetail = (detail: AdminReportDetail) => server.use(http.get(`/api/admin/reports/${detail.report.id}`, () => HttpResponse.json(detail)));

describe('просмотр отчёта', () => {
  it('открывается по прямой ссылке: шапка из ответа, разделы, заключение', async () => {
    // машина и подборщик приходят вместе с отчётом (BE-2), поэтому шапка есть и у отчёта, которого нет в очереди
    renderReport(uuid(404));
    expect(await screen.findByRole('heading', { level: 1, name: 'Skoda Octavia 2017' })).toBeInTheDocument();
    expect(screen.getByText('Подборщик: Мария Лисицына')).toBeInTheDocument();
    // названия разделов показаны в сетке и в стоп-факторах, поэтому ищем «хотя бы одно»
    expect(screen.getAllByText('Кузов').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ЛКП').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Салон').length).toBeGreaterThan(0);
    expect(screen.getByText('Заключение подборщика')).toBeInTheDocument();
    expect(screen.getByText('Опубликован ранее.')).toBeInTheDocument();
  });

  it('цена в копейках показывается в рублях, а не «500000»', async () => {
    renderReport(uuid(401));
    const panel = within(await side());
    expect(panel.getByText(/5\s?000 BYN/)).toBeInTheDocument();
    expect(screen.queryByText(/500\s?000/)).not.toBeInTheDocument();
  });

  it('шапка отчёта из очереди: машина и VIN', async () => {
    renderReport(uuid(401));
    expect(await screen.findByRole('heading', { level: 1, name: 'Volkswagen Passat 2017' })).toBeInTheDocument();
    expect(screen.getByText('VIN WVWZZZ3CZHE123456')).toBeInTheDocument();
    expect(screen.getByText(/следы воды в салоне/)).toBeInTheDocument();
  });

  it('открывается и удалённый отчёт, и опубликованный', async () => {
    const first = renderReport(uuid(405));
    await side();
    first.unmount();
    renderReport(uuid(404));
    expect(await side()).toBeInTheDocument();
  });

  it('кнопка «К очереди» ведёт на /moderation', async () => {
    const { user } = renderReport(uuid(401));
    await side();
    await user.click(screen.getByRole('link', { name: /К очереди/ }));
    await waitFor(() => expect(location()).toBe('/moderation'));
  });

  it('карточка кешируется на 30 минут, а не перечитывается как очередь', async () => {
    const { queryClient } = renderReport(uuid(401));
    await side();
    const query = queryClient.getQueryCache().find({ queryKey: queryKeys.report(uuid(401)) })!;
    expect(query.observers[0]!.options.staleTime).toBe(REPORT_STALE_MS);
    expect(REPORT_STALE_MS).toBe(30 * 60_000);
  });

  it('скелетон, пока грузится', async () => {
    // ответ с задержкой: при нулевой задержке скелетон успевал исчезнуть до проверки
    server.use(
      http.get(`/api/admin/reports/${uuid(401)}`, async () => {
        await delay(150);
        return HttpResponse.json(db.reports[uuid(401)]);
      }),
    );
    renderReport(uuid(401));
    expect(await screen.findByLabelText('Загрузка отчёта')).toBeInTheDocument();
    await side();
    expect(screen.queryByLabelText('Загрузка отчёта')).not.toBeInTheDocument();
  });
});

describe('не найден', () => {
  it('REPORT_NOT_FOUND → «Отчёт не найден» со ссылкой на очередь, без повторов запроса', async () => {
    const requests = recordRequests(server);
    const { user } = renderReport(uuid(999));

    expect(await screen.findByText('Отчёт не найден')).toBeInTheDocument();
    expect(requests.filter((r) => r.startsWith('GET /api/admin/reports/0'))).toHaveLength(1);

    await user.click(screen.getByRole('link', { name: 'К очереди' }));
    await waitFor(() => expect(location()).toBe('/moderation'));
  });

  it('невалидный UUID в адресе (400 формы B) → тот же экран', async () => {
    renderReport('abc');
    expect(await screen.findByText('Отчёт не найден')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К очереди' })).toBeInTheDocument();
  });

  it('меню остаётся рабочим на экране «не найден»', async () => {
    renderReport(uuid(999));
    await screen.findByText('Отчёт не найден');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });
});

describe('ошибки загрузки', () => {
  it('5xx → блок «Повторить», повтор открывает отчёт', async () => {
    mockControl.failOnce('GET /admin/reports/:id', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderReport(uuid(401));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ошибка сервера. Попробуйте позже');
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await side()).toBeInTheDocument();
  });

  it('сеть недоступна → понятное сообщение', async () => {
    mockControl.failOnce('GET /admin/reports/:id', { kind: 'network' });
    renderReport(uuid(401));
    expect(await screen.findByText('Нет связи с сервером. Проверьте интернет и повторите.')).toBeInTheDocument();
  });
});

describe('статус и баннеры', () => {
  it('обычный отчёт на модерации: статус «На модерации», баннеров нет', async () => {
    renderReport(uuid(401));
    const panel = within(await side());
    expect(panel.getByText('На модерации')).toBeInTheDocument();
    expect(screen.queryByText(/Повторная отправка/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Удалён/)).not.toBeInTheDocument();
  });

  it('удалённый отчёт: баннер с датой и причиной, чип «Удалён» вместо статуса', async () => {
    renderReport(uuid(405));
    expect(await screen.findByText(/^Удалён 25 сентября 2026/)).toBeInTheDocument();
    expect(screen.getByText('Причина: Дубликат отчёта по этой машине')).toBeInTheDocument();
    const panel = within(await side());
    expect(panel.getAllByText('Удалён').length).toBeGreaterThan(0);
    expect(panel.queryByText('Опубликован')).not.toBeInTheDocument();
  });

  it('повторная отправка: pending_review + последнее решение «на доработку» → баннер с прошлой причиной', async () => {
    renderReport(uuid(402));
    expect(await screen.findByText('Повторная отправка после доработки')).toBeInTheDocument();
    expect(screen.getByText(/Нет фото VIN-таблички, добавьте и отправьте повторно/, { selector: '[role="status"] *' })).toBeInTheDocument();
  });

  it('статус revision_required без удаления — просто чип «На доработке»', async () => {
    const detail = db.reports[uuid(401)]!;
    detail.report.status = 'revision_required';
    renderReport(uuid(401));
    expect(within(await side()).getByText('На доработке')).toBeInTheDocument();
    expect(screen.queryByText('Повторная отправка после доработки')).not.toBeInTheDocument();
  });

  it('неизвестный раздел отчёта не прячется, а помечается баннером', async () => {
    const detail = structuredClone(db.reports[uuid(401)]!);
    detail.report.sections[0]!.sectionKey = 'TRUNK_NEW';
    withDetail(detail);
    renderReport(uuid(401));
    expect(await screen.findByText('В отчёте есть неизвестные разделы')).toBeInTheDocument();
    expect(screen.getByText(/TRUNK_NEW/)).toBeInTheDocument();
  });
});

describe('история модерации', () => {
  it('новые записи сверху; approve без причины, у revise причина текстом', async () => {
    const detail = structuredClone(db.reports[uuid(402)]!);
    detail.history = [
      { adminId: uuid(900), adminEmail: '[Email1]', action: 'revise', reason: 'Нет фото VIN-таблички', createdAt: '2026-09-18T11:02:00Z' },
      { adminId: uuid(900), adminEmail: '[Email1]', action: 'approve', reason: null, createdAt: '2026-09-20T09:00:00Z' },
    ];
    withDetail(detail);
    renderReport(uuid(402));

    const panel = within(await side());
    const items = panel.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Одобрен');
    expect(items[1]).toHaveTextContent('Возвращён на доработку');
    expect(items[1]).toHaveTextContent('Нет фото VIN-таблички');
    expect(items[0]!.querySelector('p.rounded-control')).toBeNull(); // у approve блока причины нет
  });

  it('пустая история → «Решений пока не было»', async () => {
    renderReport(uuid(401));
    expect(within(await side()).getByText('Решений пока не было.')).toBeInTheDocument();
  });

  it('админ показан email-ом, id — в подсказке', async () => {
    renderReport(uuid(405));
    const panel = within(await side());
    const who = panel.getAllByTitle(uuid(900));
    expect(who.length).toBeGreaterThan(0);
    expect(who[0]).toHaveTextContent(mail('admin'));
  });

  it('многострочная причина сохраняет переносы', async () => {
    const detail = structuredClone(db.reports[uuid(405)]!);
    detail.history[0]!.reason = 'строка 1\nстрока 2';
    withDetail(detail);
    renderReport(uuid(405));
    const reason = (await within(await side()).findByText(/строка 1/)) as HTMLElement;
    expect(reason.className).toContain('whitespace-pre-wrap');
  });
});

describe('подборщик (приходит вместе с отчётом)', () => {
  const withInspectorStatus = (status: 'pending' | 'verified' | 'banned') => {
    const detail = structuredClone(db.reports[uuid(401)]!);
    detail.inspector.status = status;
    withDetail(detail);
  };

  it('верифицированный: имя ссылкой, без предупреждений', async () => {
    renderReport(uuid(401));
    const panel = within(await side());
    expect(panel.getByRole('link', { name: 'Олег Кравец' })).toBeInTheDocument();
    expect(panel.queryByText(/не верифицирован|заблокирован/)).not.toBeInTheDocument();
  });

  it('pending → предупреждение «не верифицирован»', async () => {
    withInspectorStatus('pending');
    renderReport(uuid(401));
    expect(await within(await side()).findByText('Подборщик не верифицирован')).toBeInTheDocument();
  });

  it('забаненный подборщик → «Подборщик заблокирован»', async () => {
    withInspectorStatus('banned');
    renderReport(uuid(401));
    expect(await within(await side()).findByText('Подборщик заблокирован')).toBeInTheDocument();
  });

  it('ссылка ведёт в список подборщиков с поиском по email', async () => {
    renderReport(uuid(401));
    const link = within(await side()).getByRole('link', { name: 'Олег Кравец' });
    expect(link.getAttribute('href')).toBe(`/inspectors?q=${encodeURIComponent(mail('oleg.kravets'))}`);
  });

  it('списки подборщиков не запрашиваются ради карточки', async () => {
    const requests = recordRequests(server);
    renderReport(uuid(401));
    await side();
    expect(requests.filter((r) => r.includes('/api/admin/inspectors/'))).toEqual([]);
  });
});

describe('контекст машины и покупателей (BE-2)', () => {
  it('машина: название, VIN и ссылка на av.by в новой вкладке', async () => {
    renderReport(uuid(401));
    const panel = within(await side());
    expect(panel.getByText('Volkswagen Passat 2017')).toBeInTheDocument();
    const link = panel.getByRole('link', { name: /Объявление на av\.by/ });
    expect(link).toHaveAttribute('href', 'https://cars.av.by/volkswagen/passat/100000201');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('без ссылки на объявление — ссылки нет', async () => {
    renderReport(uuid(403));
    expect(within(await side()).queryByRole('link', { name: /av\.by/ })).not.toBeInTheDocument();
  });

  it('даты создания и отправки, число ждущих и оплативших', async () => {
    renderReport(uuid(401));
    const panel = within(await side());
    expect(panel.getByText(/Создан: 26 сентября 2026/)).toBeInTheDocument();
    expect(panel.getByText(/Отправлен на модерацию: 27 сентября 2026/)).toBeInTheDocument();
    expect(panel.getByText('Ждут отчёт: 3')).toBeInTheDocument();
    expect(panel.getByText('Оплатили: 0')).toBeInTheDocument();
  });

  it('удалённый отчёт: дата удаления из deletedAt', async () => {
    renderReport(uuid(405));
    expect(await within(await side()).findByText(/Удалён: 25 сентября 2026/)).toBeInTheDocument();
  });

  it('удалённым отчёт считается по deletedAt, а не по журналу', async () => {
    const detail = structuredClone(db.reports[uuid(401)]!);
    detail.history = [{ adminId: uuid(900), adminEmail: 'admin@example.com', action: 'delete', reason: 'в журнале, но deletedAt нет', createdAt: '2026-09-25T14:00:00Z' }];
    withDetail(detail);
    renderReport(uuid(401));
    await side();
    expect(screen.queryByText(/^Удалён 25 сентября/)).not.toBeInTheDocument();
    expect(screen.getByTestId('moderation-actions')).toBeInTheDocument();
  });
});

describe('медиа (ADM-11)', () => {
  const imageSources = () => Array.from(document.querySelectorAll('img')).map((img) => decodeURIComponent(img.getAttribute('src') ?? ''));

  it('фото открываются по presigned url из ответа, а не плейсхолдеры', async () => {
    renderReport(uuid(401));
    await side();
    const real = imageSources().filter((src) => src.includes('odometer.jpg'));
    expect(real.length).toBeGreaterThan(0);
    expect(real[0]).toContain('<svg'); // data-URI из фикстуры
    expect(real[0]).not.toContain('Превью недоступно');
  });

  it('видео в pending (url == null) — плейсхолдер «не обработано», тега <video> нет', async () => {
    renderReport(uuid(401));
    await side();
    expect(imageSources().some((src) => src.includes('Видео') && src.includes('walkaround.mp4') && src.includes('не обработано'))).toBe(true);
    expect(document.querySelector('video')).toBeNull();
  });

  it('готовое видео с url играет в <video>', async () => {
    const detail = structuredClone(db.reports[uuid(401)]!);
    detail.report.globalMedia[1] = { ...detail.report.globalMedia[1]!, status: 'ready', url: 'https://cdn.example/walkaround.mp4' };
    withDetail(detail);
    renderReport(uuid(401));
    await side();
    expect(document.querySelector('video')).toHaveAttribute('src', 'https://cdn.example/walkaround.mp4');
  });

  it('ни один запрос не уходит на S3: картинки в тестах — data-URI', async () => {
    const requests = recordRequests(server);
    renderReport(uuid(401));
    await side();
    expect(requests.every((r) => r.includes('/api/'))).toBe(true);
  });

  it('ошибка загрузки картинки (протухла ссылка) → карточка перечитывается', async () => {
    const requests = recordRequests(server);
    renderReport(uuid(401));
    await side();
    const before = requests.filter((r) => r === `GET /api/admin/reports/${uuid(401)}`).length;

    act(() => {
      document.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    await waitFor(() => expect(requests.filter((r) => r === `GET /api/admin/reports/${uuid(401)}`).length).toBe(before + 1));
  });

  it('десяток ошибок подряд даёт один перезапрос, а не лавину', async () => {
    const requests = recordRequests(server);
    renderReport(uuid(401));
    await side();
    const before = requests.filter((r) => r === `GET /api/admin/reports/${uuid(401)}`).length;

    act(() => {
      for (const img of document.querySelectorAll('img')) img.dispatchEvent(new Event('error'));
    });

    await waitFor(() => expect(requests.filter((r) => r === `GET /api/admin/reports/${uuid(401)}`).length).toBe(before + 1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(requests.filter((r) => r === `GET /api/admin/reports/${uuid(401)}`).length).toBe(before + 1);
  });

  it('отчёт без медиа показывается без галерей', async () => {
    const detail = structuredClone(db.reports[uuid(401)]!);
    detail.report.globalMedia = [];
    detail.report.sections.forEach((s) => (s.media = []));
    withDetail(detail);
    renderReport(uuid(401));
    await side();
    expect(screen.queryByText('Видео и общие фото')).not.toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });
});
