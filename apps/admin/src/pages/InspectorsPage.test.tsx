import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import type { InspectorDto } from '@/api/types';
import { MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { uuid } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { server } from '@/test/server';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';
import { tabFromParam } from './InspectorsPage';

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === MOBILE_QUERY ? mobile : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  setViewport(false);
  sessionStorage.clear();
});

function renderPage(route = '/inspectors') {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(appRoutes, route) };
}

const location = () => screen.getByTestId('location').textContent;
const table = () => screen.findByRole('table');
const bodyRows = async () => within((await table()).querySelector('tbody')!).getAllByRole('row');
const names = async () => (await bodyRows()).map((r) => within(r).getAllByRole('cell')[0]!.textContent);
const tab = (name: string) => screen.getByRole('tab', { name });
const menuCount = (label: string) => within(screen.getByRole('navigation', { name: 'Основное меню' }).querySelector(`a[href="/${label}"]`) as HTMLElement);
const reasonField = () => screen.getByLabelText('Причина') as HTMLTextAreaElement;
const rowOf = async (name: string) => (await bodyRows()).find((r) => r.textContent?.includes(name))!;
const GOOD_REASON = 'Выдавал чужие отчёты за свои, жалобы покупателей';

describe('вкладки', () => {
  it('по умолчанию «Ожидают»: запрос с ?status=pending, только pending-подборщики', async () => {
    const requests = recordRequests(server);
    renderPage();
    expect(await names()).toEqual(['Анна Сидорова', 'Иван Петров']); // по ФИО, а не в порядке бэкенда
    expect(tab('Ожидают')).toHaveAttribute('aria-selected', 'true');
    expect(requests.some((r) => r === 'GET /api/admin/inspectors')).toBe(true);
  });

  it('переключение пишет ?status=, «Все» — тоже и уходит на бэкенд без параметра', async () => {
    const { user } = renderPage();
    await table();

    await user.click(tab('Верифицированы'));
    await waitFor(() => expect(location()).toBe('/inspectors?status=verified'));
    expect(await names()).toEqual(['Мария Лисицына', 'Олег Кравец']);

    await user.click(tab('Забанены'));
    await waitFor(() => expect(location()).toBe('/inspectors?status=banned'));
    expect(await names()).toEqual(['Денис Волков']);

    const requests = recordRequests(server);
    await user.click(tab('Все'));
    await waitFor(() => expect(location()).toBe('/inspectors?status=all'));
    expect(await names()).toHaveLength(5);
    expect(requests).toContain('GET /api/admin/inspectors'); // без query-параметра
  });

  it('вкладка берётся из адреса; незнакомое значение — «Ожидают»', async () => {
    renderPage('/inspectors?status=banned');
    expect(await names()).toEqual(['Денис Волков']);
    expect(tab('Забанены')).toHaveAttribute('aria-selected', 'true');
  });

  it('tabFromParam: мусор и пустота дают вкладку по умолчанию', () => {
    expect(tabFromParam('verified')).toBe('verified');
    expect(tabFromParam('all')).toBe('all');
    expect(tabFromParam('hacker')).toBe('pending');
    expect(tabFromParam(null)).toBe('pending');
  });

  it('смена вкладки сбрасывает страницу, но сохраняет поиск', async () => {
    const { user } = renderPage('/inspectors?status=all&q=ов&page=2');
    await table();
    await user.click(tab('Ожидают'));
    await waitFor(() => expect(location()).toBe('/inspectors?status=pending&q=%D0%BE%D0%B2'));
  });
});

describe('таблица', () => {
  it('колонки: ФИО, телефон со ссылкой tel:, email с mailto:, Telegram с tg://, статус', async () => {
    renderPage('/inspectors?status=verified');
    const row = await rowOf('Олег Кравец');
    const cells = within(row).getAllByRole('cell');

    expect(within(cells[1]!).getByRole('link')).toHaveAttribute('href', 'tel:+375291000103');
    expect(within(cells[1]!).getByRole('link')).toHaveTextContent('+375 29 100-01-03');
    expect(within(cells[2]!).getByRole('link')).toHaveAttribute('href', 'mailto:oleg.kravets@example.com');
    expect(within(cells[3]!).getByRole('link')).toHaveAttribute('href', 'tg://user?id=100000103');
    expect(cells[4]).toHaveTextContent('Верифицирован');
  });

  it('сортировка по клику: ФИО по убыванию', async () => {
    const { user } = renderPage();
    await table();
    const header = screen.getByRole('columnheader', { name: /ФИО/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending'); // сортировка по умолчанию — по ФИО
    await user.click(within(header).getByRole('button'));
    expect(await names()).toEqual(['Иван Петров', 'Анна Сидорова']);
  });

  it('поиск по ФИО, телефону и email без запроса к бэкенду; значение — в ?q=', async () => {
    const { user } = renderPage('/inspectors?status=all');
    await table();
    const requests = recordRequests(server);

    await user.type(screen.getByRole('searchbox', { name: 'Поиск по подборщикам' }), 'лисиц');
    await waitFor(() => expect(location()).toContain('q='));
    await waitFor(async () => expect(await names()).toEqual(['Мария Лисицына']));

    // поиск уходит в URL с задержкой (debounce), поэтому результат ждём, а не читаем сразу
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '100-01-05'); // телефон в том виде, в каком он показан на экране
    await waitFor(async () => expect(await names()).toEqual(['Денис Волков']));

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '375291000103'); // и в том виде, в каком он хранится
    await waitFor(async () => expect(await names()).toEqual(['Олег Кравец']));
    expect(requests.filter((r) => r === 'GET /api/admin/inspectors')).toEqual([]);
  });

  it('поиск по email', async () => {
    renderPage('/inspectors?status=all&q=denis.volkov');
    expect(await names()).toEqual(['Денис Волков']);
  });
});

describe('кнопки по статусу', () => {
  it('pending: «Верифицировать» и «Забанить»', async () => {
    renderPage();
    const row = within(await rowOf('Иван Петров'));
    expect(row.getByRole('button', { name: 'Верифицировать Иван Петров' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Забанить Иван Петров' })).toBeInTheDocument();
  });

  it('verified: только «Забанить»', async () => {
    renderPage('/inspectors?status=verified');
    const row = within(await rowOf('Олег Кравец'));
    expect(row.queryByRole('button', { name: /Верифицировать/ })).not.toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Забанить Олег Кравец' })).toBeInTheDocument();
  });

  it('banned: кнопок нет совсем', async () => {
    renderPage('/inspectors?status=banned');
    expect(within(await rowOf('Денис Волков')).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('верификация', () => {
  it('диалог с ФИО и телефоном → 200 → запись уходит из «Ожидают», счётчик в меню уменьшается, тост', async () => {
    const { user, queryClient } = renderPage();
    await waitFor(() => expect(menuCount('inspectors').getByTestId('nav-count')).toHaveTextContent('2'));

    await user.click(within(await rowOf('Иван Петров')).getByRole('button', { name: /Верифицировать/ }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/Иван Петров, \+375 29 100-01-01/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Верифицировать' }));

    await waitFor(() => expect(db.inspectors.find((i) => i.id === uuid(101))?.status).toBe('verified'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await names()).toEqual(['Анна Сидорова']);
    expect(await screen.findByText('Иван Петров верифицирован')).toBeInTheDocument();
    // в кеше «Все» лежит свежий DTO из ответа, а в меню на один ожидающий меньше
    expect(queryClient.getQueryData<InspectorDto[]>(queryKeys.inspectors('pending'))?.map((i) => i.id)).toEqual([uuid(102)]);
    await waitFor(() => expect(menuCount('inspectors').getByTestId('nav-count')).toHaveTextContent('1'));
  });

  it('«Отмена» — без запроса', async () => {
    const { user } = renderPage();
    const requests = recordRequests(server);
    await user.click(within(await rowOf('Иван Петров')).getByRole('button', { name: /Верифицировать/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.filter((r) => r.startsWith('POST'))).toEqual([]);
  });

  it('двойной клик по «Верифицировать» — один запрос', async () => {
    server.use(
      http.post(`/api/admin/inspectors/${uuid(101)}/verify`, async () => {
        await delay(100);
        const inspector = db.inspectors.find((i) => i.id === uuid(101))!;
        inspector.status = 'verified';
        return HttpResponse.json(inspector);
      }),
    );
    const requests = recordRequests(server);
    const { user } = renderPage();
    await user.click(within(await rowOf('Иван Петров')).getByRole('button', { name: /Верифицировать/ }));
    await user.dblClick(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Верифицировать' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.filter((r) => r === `POST /api/admin/inspectors/${uuid(101)}/verify`)).toHaveLength(1);
  });

  it('409 INSPECTOR_NOT_PENDING → тост-предупреждение, диалог закрыт, список обновлён', async () => {
    const { user } = renderPage();
    await user.click(within(await rowOf('Иван Петров')).getByRole('button', { name: /Верифицировать/ }));
    await screen.findByRole('dialog');

    db.inspectors.find((i) => i.id === uuid(101))!.status = 'verified'; // другой админ успел раньше
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Верифицировать' }));

    expect(await screen.findByText('Подборщик уже не ожидает верификации')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(async () => expect(await names()).toEqual(['Анна Сидорова']));
  });

  it('сеть упала → тост-ошибка, диалог остаётся, повтор проходит', async () => {
    mockControl.failOnce('POST /admin/inspectors/:id/verify', { kind: 'network' });
    const { user } = renderPage();
    await user.click(within(await rowOf('Иван Петров')).getByRole('button', { name: /Верифицировать/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Верифицировать' }));

    expect(await screen.findByText('Нет связи с сервером. Попробуйте ещё раз')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Верифицировать' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('бан', () => {
  async function openBan(name = 'Иван Петров', route?: string) {
    const ctx = renderPage(route);
    await ctx.user.click(within(await rowOf(name)).getByRole('button', { name: new RegExp(`Забанить ${name}`) }));
    await screen.findByRole('dialog');
    return ctx;
  }
  const submit = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Забанить' });
  const understood = () => screen.getByRole('checkbox', { name: 'Понимаю, что разбана нет' });

  it('диалог честно перечисляет последствия', async () => {
    await openBan();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Подборщик больше не сможет создавать новые отчёты.')).toBeInTheDocument();
    expect(dialog.getByText(/Уже опубликованные отчёты продолжат продаваться/)).toBeInTheDocument();
    expect(dialog.getByText(/черновики он по-прежнему сможет редактировать/)).toBeInTheDocument();
    expect(dialog.getByText('Разбанить через админку нельзя.')).toBeInTheDocument();
  });

  it('кнопка активна только при отметке «Понимаю, что разбана нет» и причине от 10 символов', async () => {
    const { user } = await openBan();
    expect(submit()).toBeDisabled();

    await user.type(reasonField(), GOOD_REASON);
    expect(submit()).toBeDisabled(); // причина есть, отметки нет

    await user.click(understood());
    expect(submit()).toBeEnabled();

    await user.clear(reasonField());
    await user.type(reasonField(), 'коротко');
    expect(submit()).toBeDisabled(); // отметка есть, причина короткая
  });

  it('тело запроса — { reason }, а не { reasonText }; статус banned, тост', async () => {
    let body: unknown;
    server.use(
      http.post(`/api/admin/inspectors/${uuid(101)}/ban`, async ({ request }) => {
        body = await request.json();
        const inspector = db.inspectors.find((i) => i.id === uuid(101))!;
        inspector.status = 'banned';
        return HttpResponse.json(inspector);
      }),
    );
    const { user } = await openBan();
    await user.type(reasonField(), `  ${GOOD_REASON}  `);
    await user.click(understood());
    await user.click(submit());

    await waitFor(() => expect(body).toEqual({ reason: GOOD_REASON }));
    expect(await screen.findByText('Иван Петров заблокирован')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await names()).toEqual(['Анна Сидорова']);
  });

  it('забанить можно и верифицированного', async () => {
    const { user, queryClient } = await openBan('Олег Кравец', '/inspectors?status=verified');
    await user.type(reasonField(), GOOD_REASON);
    await user.click(understood());
    await user.click(submit());

    await waitFor(() => expect(db.inspectors.find((i) => i.id === uuid(103))?.status).toBe('banned'));
    await waitFor(() => expect(queryClient.getQueryData<InspectorDto[]>(queryKeys.inspectors('verified'))?.map((i) => i.id)).not.toContain(uuid(103)));
  });

  it('отметка не переживает закрытие диалога: при следующем открытии подтверждать заново', async () => {
    const { user } = await openBan();
    await user.click(understood());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(await rowOf('Иван Петров')).getByRole('button', { name: /Забанить/ }));
    await screen.findByRole('dialog');
    expect(understood()).not.toBeChecked();
  });

  it('черновик причины хранится по draft:ban:<id> и возвращается при повторном открытии', async () => {
    const { user } = await openBan();
    await user.type(reasonField(), 'недописанная причина бана');
    expect(sessionStorage.getItem(`draft:ban:${uuid(101)}`)).toBe('недописанная причина бана');

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(within(await rowOf('Иван Петров')).getByRole('button', { name: /Забанить/ }));
    await screen.findByRole('dialog');
    expect(reasonField().value).toBe('недописанная причина бана');
  });

  it('после успеха черновик стирается', async () => {
    const { user } = await openBan();
    await user.type(reasonField(), GOOD_REASON);
    await user.click(understood());
    await user.click(submit());
    await waitFor(() => expect(sessionStorage.getItem(`draft:ban:${uuid(101)}`)).toBeNull());
  });

  it('400 по полю reason → ошибка у поля, диалог и текст остаются', async () => {
    mockControl.failOnce('POST /admin/inspectors/:id/ban', { kind: 'validation', errors: ['reason: must not be blank'] });
    const { user } = await openBan();
    await user.type(reasonField(), GOOD_REASON);
    await user.click(understood());
    await user.click(submit());

    expect(await screen.findByText('must not be blank')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(reasonField().value).toBe(GOOD_REASON);
  });

  it('409 INSPECTOR_ALREADY_BANNED → тост, диалог закрыт, список обновлён', async () => {
    const { user } = await openBan();
    await user.type(reasonField(), GOOD_REASON);
    await user.click(understood());

    db.inspectors.find((i) => i.id === uuid(101))!.status = 'banned'; // коллега забанил раньше
    await user.click(submit());

    expect(await screen.findByText('Подборщик уже забанен')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(async () => expect(await names()).toEqual(['Анна Сидорова']));
    expect(sessionStorage.getItem(`draft:ban:${uuid(101)}`)).toBeNull();
  });
});

describe('пустые состояния и ошибки', () => {
  it.each([
    ['pending', 'Новых заявок нет'],
    ['verified', 'Верифицированных подборщиков пока нет'],
    ['banned', 'Забаненных подборщиков нет'],
    ['all', 'Подборщиков пока нет'],
  ])('пустая вкладка %s → «%s»', async (status, title) => {
    server.use(http.get('/api/admin/inspectors', () => HttpResponse.json([])));
    renderPage(`/inspectors?status=${status}`);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('ничего не найдено по поиску → сообщение и «Сбросить поиск»', async () => {
    const { user } = renderPage('/inspectors?q=qqq');
    expect(await screen.findByText('Ничего не найдено по «qqq»')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сбросить поиск' }));
    expect(await table()).toBeInTheDocument();
  });

  it('ошибка загрузки → «Повторить»', async () => {
    mockControl.failOnce('GET /admin/inspectors', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ошибка сервера. Попробуйте позже');
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await table()).toBeInTheDocument();
  });

  it('скелетон, пока грузится', async () => {
    server.use(
      http.get('/api/admin/inspectors', async () => {
        await delay(150);
        return HttpResponse.json([]);
      }),
    );
    renderPage();
    expect(await screen.findByLabelText('Загрузка подборщиков')).toBeInTheDocument();
  });
});

describe('телефон (< 768px)', () => {
  beforeEach(() => setViewport(true));

  it('вместо таблицы — карточки с контактами и кнопками', async () => {
    renderPage();
    expect(await screen.findByText('Иван Петров')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Верифицировать Иван Петров' })).toBeInTheDocument();
    expect(screen.getByText(/\+375 29 100-01-01 · ivan\.petrov@example\.com/)).toBeInTheDocument();
  });

  it('верификация работает и в списке', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Верифицировать Иван Петров' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Верифицировать' }));
    await waitFor(() => expect(db.inspectors.find((i) => i.id === uuid(101))?.status).toBe('verified'));
  });

  it('у забаненного кнопок нет', async () => {
    renderPage('/inspectors?status=banned');
    expect(await screen.findByText('Денис Волков')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Забанить|Верифицировать/ })).not.toBeInTheDocument();
  });
});

describe('связь с карточкой отчёта', () => {
  it('ссылка из карточки (?q=<id>) находит подборщика после перехода', async () => {
    // карточка отчёта ссылается на /inspectors?q=<email или id>: поиск идёт и по email — проверяем сквозь страницу
    renderPage('/inspectors?status=all&q=oleg.kravets');
    expect(await names()).toEqual(['Олег Кравец']);
  });

  it('открытая страница не мешает счётчикам в меню: запрос pending-списка общий', async () => {
    const requests = recordRequests(server);
    renderPage();
    await table();
    // меню и вкладка «Ожидают» читают один ключ — запрос на pending ушёл один раз
    expect(requests.filter((r) => r === 'GET /api/admin/inspectors')).toHaveLength(1);
    await act(async () => {});
  });
});
