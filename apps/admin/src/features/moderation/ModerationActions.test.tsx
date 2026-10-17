import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import { SESSION_STORAGE_KEY } from '@/auth/session';
import { mail, uuid } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { server } from '@/test/server';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';

function renderReport(id: string) {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(appRoutes, `/reports/${id}`) };
}

const location = () => screen.getByTestId('location').textContent;
const actions = () => screen.findByTestId('moderation-actions');
const dialog = () => screen.findByRole('dialog');
const reasonField = () => screen.getByLabelText('Причина') as HTMLTextAreaElement;

const GOOD_REASON = 'Нет фото VIN-таблички, добавьте и отправьте повторно';

beforeEach(() => sessionStorage.clear());

describe('какие кнопки видны', () => {
  it('pending_review: одобрить, вернуть и удалить', async () => {
    renderReport(uuid(401));
    const panel = within(await actions());
    expect(panel.getByRole('button', { name: /Одобрить/ })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: /Вернуть на доработку/ })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: /Удалить/ })).toBeInTheDocument();
  });

  it('published: только «Удалить»', async () => {
    renderReport(uuid(404));
    const panel = within(await actions());
    expect(panel.queryByRole('button', { name: /Одобрить/ })).not.toBeInTheDocument();
    expect(panel.queryByRole('button', { name: /Вернуть/ })).not.toBeInTheDocument();
    expect(panel.getByRole('button', { name: /Удалить/ })).toBeInTheDocument();
  });

  it.each(['revision_required', 'draft'] as const)('%s: только «Удалить»', async (status) => {
    db.reports[uuid(401)]!.report.status = status;
    renderReport(uuid(401));
    const panel = within(await actions());
    expect(panel.getAllByRole('button')).toHaveLength(1);
    expect(panel.getByRole('button', { name: /Удалить/ })).toBeInTheDocument();
  });

  it('удалённый отчёт: кнопок нет совсем, панель не рисуется', async () => {
    renderReport(uuid(405));
    await screen.findByRole('complementary', { name: 'Данные отчёта' });
    expect(screen.queryByTestId('moderation-actions')).not.toBeInTheDocument();
  });
});

describe('одобрить', () => {
  it('диалог подтверждения → 200 → тост «Опубликовано», отчёт ушёл из очереди, открылся следующий', async () => {
    const { user, queryClient } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));

    const confirm = within(await dialog());
    expect(confirm.getByText('Опубликовать отчёт?')).toBeInTheDocument();
    await user.click(confirm.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`)); // следующий по очереди
    expect(db.reports[uuid(401)]!.report.status).toBe('published');
    expect(queryClient.getQueryData<{ reportId: string }[]>(queryKeys.moderationQueue)?.map((i) => i.reportId)).not.toContain(uuid(401));
    expect(await screen.findByText('Опубликовано')).toBeInTheDocument(); // тост
  });

  it('последний отчёт в очереди → возврат в /moderation', async () => {
    db.reports[uuid(402)]!.report.status = 'published';
    db.reports[uuid(403)]!.report.status = 'published';
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));
    await user.click(within(await dialog()).getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(location()).toBe('/moderation'));
  });

  it('«Отмена» закрывает диалог без запроса', async () => {
    const requests = recordRequests(server);
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));
    await user.click(within(await dialog()).getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(screen.queryByText('Опубликовать отчёт?')).not.toBeInTheDocument());
    expect(requests.filter((r) => r.startsWith('POST'))).toEqual([]);
  });

  it('двойной клик по «Опубликовать» отправляет один запрос', async () => {
    server.use(
      http.post(`/api/admin/reports/${uuid(401)}/approve`, async () => {
        await delay(100);
        db.reports[uuid(401)]!.report.status = 'published';
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const requests = recordRequests(server);
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));
    const confirmButton = within(await dialog()).getByRole('button', { name: 'Опубликовать' });

    await user.dblClick(confirmButton);
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`));
    expect(requests.filter((r) => r === `POST /api/admin/reports/${uuid(401)}/approve`)).toHaveLength(1);
  });

  it('пока идёт запрос, диалог не закрывается: ни Escape, ни «Отмена»', async () => {
    server.use(
      http.post(`/api/admin/reports/${uuid(401)}/approve`, async () => {
        await delay(150);
        db.reports[uuid(401)]!.report.status = 'published';
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));
    await user.click(within(await dialog()).getByRole('button', { name: 'Опубликовать' }));

    await user.keyboard('{Escape}');
    expect(screen.getByText('Опубликовать отчёт?')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' })).toBeDisabled();
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`));
  });
});

describe('вернуть на доработку', () => {
  async function openRevise() {
    const ctx = renderReport(uuid(401));
    await ctx.user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    return ctx;
  }
  const submit = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Вернуть' });

  it('пустая и короткая причина → кнопка неактивна, запрос не уходит', async () => {
    const requests = recordRequests(server);
    const { user } = await openRevise();
    expect(submit()).toBeDisabled();

    await user.type(reasonField(), 'коротко');
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/не меньше 10 символов/)).toBeInTheDocument();
    expect(requests.filter((r) => r.startsWith('POST'))).toEqual([]);
  });

  it('причина из одних пробелов не проходит', async () => {
    const { user } = await openRevise();
    await user.type(reasonField(), '               ');
    expect(submit()).toBeDisabled();
  });

  it('нормальная причина → 200 → отчёт на доработке, причина в истории, открылся следующий', async () => {
    const { user } = await openRevise();
    await user.type(reasonField(), GOOD_REASON);
    expect(submit()).toBeEnabled();
    await user.click(submit());

    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`));
    expect(db.reports[uuid(401)]!.report.status).toBe('revision_required');
    expect(db.reports[uuid(401)]!.history[0]).toMatchObject({ action: 'revise', reason: GOOD_REASON });
    expect(await screen.findByText('Возвращено на доработку')).toBeInTheDocument();
  });

  it('причина уходит без пробелов по краям', async () => {
    const { user } = await openRevise();
    await user.type(reasonField(), `   ${GOOD_REASON}   `);
    await user.click(submit());
    await waitFor(() => expect(db.reports[uuid(401)]!.history[0]?.reason).toBe(GOOD_REASON));
  });

  it('счётчик символов считает набранное', async () => {
    const { user } = await openRevise();
    await user.type(reasonField(), 'abcde');
    expect(screen.getByLabelText('Длина причины')).toHaveTextContent('5/2000');
  });

  it('быстрые шаблоны вставляются в поле и дописываются к уже написанному', async () => {
    const { user } = await openRevise();
    await user.click(screen.getByRole('button', { name: 'Нет фото VIN' }));
    expect(reasonField().value).toMatch(/^Нет фото VIN-таблички/);
    expect(submit()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Размытые фото' }));
    expect(reasonField().value).toMatch(/Нет фото VIN-таблички.*\nЧасть фото размыта/s);
  });

  it('400 с ошибкой по reasonText → ошибка у поля, диалог и текст остаются', async () => {
    mockControl.failOnce('POST /admin/reports/:id/revise', { kind: 'validation', errors: ['reasonText: must not be blank'] });
    const { user } = await openRevise();
    await user.type(reasonField(), GOOD_REASON);
    await user.click(submit());

    expect(await screen.findByText('must not be blank')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(reasonField().value).toBe(GOOD_REASON);
    expect(location()).toBe(`/reports/${uuid(401)}`);
  });

  it('сеть упала → тост-ошибка, диалог и текст остаются, можно повторить', async () => {
    mockControl.failOnce('POST /admin/reports/:id/revise', { kind: 'network' });
    const { user } = await openRevise();
    await user.type(reasonField(), GOOD_REASON);
    await user.click(submit());

    expect(await screen.findByText('Нет связи с сервером. Попробуйте ещё раз')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(reasonField().value).toBe(GOOD_REASON);

    await user.click(submit()); // повтор проходит
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`));
  });
});

describe('черновик причины', () => {
  it('пишется в sessionStorage по ключу draft:revise:<id>', async () => {
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    await user.type(reasonField(), 'недописанная причина');
    expect(sessionStorage.getItem(`draft:revise:${uuid(401)}`)).toBe('недописанная причина');
  });

  it('закрыли диалог и открыли снова — текст на месте', async () => {
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    await user.type(reasonField(), 'недописанная причина');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    expect(reasonField().value).toBe('недописанная причина');
  });

  it('переживает истечение сессии и повторный вход', async () => {
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    await user.type(reasonField(), 'причина, которую я писал до выхода');

    // сессия закончилась: 401 → выход → экран входа
    act(() => {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    });
    await waitFor(() => expect(location()).toMatch(/^\/login/));
    expect(sessionStorage.getItem(`draft:revise:${uuid(401)}`)).toBe('причина, которую я писал до выхода');
  });

  it('после успешной отправки черновик стирается', async () => {
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    await user.type(reasonField(), GOOD_REASON);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Вернуть' }));
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`));
    expect(sessionStorage.getItem(`draft:revise:${uuid(401)}`)).toBeNull();
  });

  it('черновики revise и delete независимы', async () => {
    sessionStorage.setItem(`draft:delete:${uuid(401)}`, 'причина удаления');
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    expect(reasonField().value).toBe('');
  });
});

describe('удалить', () => {
  async function openDelete(id = uuid(401)) {
    const ctx = renderReport(id);
    await ctx.user.click(within(await actions()).getByRole('button', { name: /Удалить/ }));
    await dialog();
    return ctx;
  }
  const submit = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить навсегда' });
  const confirmField = () => screen.getByLabelText(/Введите «УДАЛИТЬ»/) as HTMLInputElement;

  it('без слова «УДАЛИТЬ» кнопка неактивна, даже при хорошей причине; запрос не уходит', async () => {
    const requests = recordRequests(server);
    const { user } = await openDelete();
    await user.type(reasonField(), GOOD_REASON);
    expect(submit()).toBeDisabled();

    await user.type(confirmField(), 'УДАЛИ');
    expect(submit()).toBeDisabled();
    expect(screen.getByText('Слово не совпадает')).toBeInTheDocument();
    expect(requests.filter((r) => r.startsWith('POST'))).toEqual([]);
  });

  it('слово без причины тоже не открывает кнопку', async () => {
    const { user } = await openDelete();
    await user.type(confirmField(), 'УДАЛИТЬ');
    expect(submit()).toBeDisabled();
  });

  it('причина и слово → 200 → карточка остаётся, баннер «Удалён», кнопки скрыты', async () => {
    const { user } = await openDelete();
    await user.type(reasonField(), 'Дубликат отчёта по этой машине');
    await user.type(confirmField(), 'удалить');
    await user.click(submit());

    expect(await screen.findByText(/^Удалён /)).toBeInTheDocument();
    expect(screen.getByText('Причина: Дубликат отчёта по этой машине')).toBeInTheDocument();
    expect(location()).toBe(`/reports/${uuid(401)}`); // остались на карточке
    await waitFor(() => expect(screen.queryByTestId('moderation-actions')).not.toBeInTheDocument());
    expect(db.reports[uuid(401)]!.report.status).toBe('pending_review'); // статус при удалении не меняется
  });

  it('предупреждение для опубликованного отчёта — про покупателей', async () => {
    await openDelete(uuid(404));
    expect(within(screen.getByRole('dialog')).getByText(/ссылка перестанет работать/)).toBeInTheDocument();
  });

  it('для отчёта на модерации предупреждения про покупателей нет', async () => {
    await openDelete(uuid(401));
    expect(within(screen.getByRole('dialog')).queryByText(/ссылка перестанет работать/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Удаление необратимо.')).toBeInTheDocument();
  });
});

describe('конфликты 409: состояние изменилось где-то ещё', () => {
  it('REPORT_NOT_PENDING_REVIEW при одобрении → тост-предупреждение, диалог закрыт, карточка и очередь перезагружены', async () => {
    const { user, queryClient } = renderReport(uuid(401));
    const panel = within(await actions());
    await user.click(panel.getByRole('button', { name: /Одобрить/ }));
    await dialog();

    // пока диалог открыт, другой админ уже опубликовал отчёт
    db.reports[uuid(401)]!.report.status = 'published';
    const requests = recordRequests(server);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByText('Отчёт уже не на модерации')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(location()).toBe(`/reports/${uuid(401)}`); // не уходим: админ видит актуальное состояние
    await waitFor(() => expect(requests).toContain(`GET /api/admin/reports/${uuid(401)}`));
    expect(requests).toContain('GET /api/admin/reports/queue');
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: 'Данные отчёта' })).getByText('Опубликован')).toBeInTheDocument());
    expect(queryClient.isFetching()).toBe(0);
  });

  it('REPORT_ALREADY_DELETED при возврате на доработку → тост, диалог закрыт, черновик стёрт', async () => {
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));
    await dialog();
    await user.type(reasonField(), GOOD_REASON);

    const deletedAt = new Date().toISOString();
    db.reports[uuid(401)]!.history.unshift({ adminId: uuid(900), adminEmail: mail('admin'), action: 'delete', reason: 'удалил коллега', createdAt: deletedAt });
    db.reports[uuid(401)]!.deletedAt = deletedAt;
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Вернуть' }));

    expect(await screen.findByText('Отчёт уже удалён')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sessionStorage.getItem(`draft:revise:${uuid(401)}`)).toBeNull();
    // после перезагрузки карточка показывает баннер «Удалён», а кнопок уже нет
    expect(await screen.findByText('Причина: удалил коллега')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('moderation-actions')).not.toBeInTheDocument());
  });

  it('REPORT_NOT_FOUND при удалении (отчёт исчез) → тот же сценарий без красной ошибки', async () => {
    mockControl.failOnce('POST /admin/reports/:id/delete', { kind: 'app', status: 404, errorCode: 'REPORT_NOT_FOUND' });
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Удалить/ }));
    await dialog();
    await user.type(reasonField(), GOOD_REASON);
    await user.type(screen.getByLabelText(/Введите «УДАЛИТЬ»/), 'УДАЛИТЬ');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить навсегда' }));

    expect(await screen.findByText('Отчёт не найден')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('500 → красная ошибка, диалог остаётся открытым', async () => {
    mockControl.failOnce('POST /admin/reports/:id/approve', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));
    await user.click(within(await dialog()).getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByText('Ошибка сервера. Попробуйте позже')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(location()).toBe(`/reports/${uuid(401)}`);
  });
});
