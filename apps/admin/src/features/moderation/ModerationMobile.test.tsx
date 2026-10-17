import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { uuid } from '@/mocks/fixtures/ids';
import { db } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { renderRoutes, storeSession } from '@/test/utils';

/** happy-dom не считает media-запросы по ширине окна: подменяем matchMedia и сами решаем, телефон это или десктоп. */
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

function renderReport(id: string) {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(appRoutes, `/reports/${id}`) };
}

const actions = () => screen.findByTestId('moderation-actions');
const GOOD_REASON = 'Нет фото VIN-таблички, добавьте и отправьте повторно';

beforeEach(() => {
  sessionStorage.clear();
  setViewport(false);
});

describe('кнопки решения', () => {
  it('на телефоне закреплены внизу экрана', async () => {
    setViewport(true);
    renderReport(uuid(401));
    expect(await actions()).toHaveClass('fixed', 'bottom-0');
  });

  it('на десктопе лежат в боковой панели, не закреплены', async () => {
    renderReport(uuid(401));
    expect(await actions()).not.toHaveClass('fixed');
  });

  it('у удалённого отчёта кнопок нет, и места под них страница не оставляет', async () => {
    setViewport(true);
    const { container } = renderReport(uuid(405));
    await screen.findByRole('complementary', { name: 'Данные отчёта' });
    expect(screen.queryByTestId('moderation-actions')).not.toBeInTheDocument();
    expect(container.querySelector('.max-md\\:pb-36')).toBeNull();
  });

  it('когда кнопки есть, страница оставляет под ними место', async () => {
    setViewport(true);
    const { container } = renderReport(uuid(401));
    await actions();
    expect(container.querySelector('.max-md\\:pb-36')).not.toBeNull();
  });
});

describe('диалоги решений', () => {
  const drawer = () => document.querySelector('[data-slot="drawer-content"]');
  const dialogWindow = () => document.querySelector('[data-slot="dialog-content"]');

  it('на телефоне «Вернуть на доработку» открывается шторкой и работает как обычно', async () => {
    setViewport(true);
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Вернуть на доработку/ }));

    const sheet = within(await screen.findByRole('dialog'));
    expect(drawer()).not.toBeNull();
    expect(dialogWindow()).toBeNull();

    const submit = sheet.getByRole('button', { name: 'Вернуть' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Причина'), GOOD_REASON);
    await user.click(submit);

    await waitFor(() => expect(db.reports[uuid(401)]!.report.status).toBe('revision_required'));
    expect(db.reports[uuid(401)]!.history[0]).toMatchObject({ action: 'revise', reason: GOOD_REASON });
  });

  it('на телефоне подтверждение «Одобрить» тоже шторка', async () => {
    setViewport(true);
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));

    await screen.findByText('Опубликовать отчёт?');
    expect(drawer()).not.toBeNull();
    expect(dialogWindow()).toBeNull();
  });

  it('на десктопе — окно, а не шторка', async () => {
    const { user } = renderReport(uuid(401));
    await user.click(within(await actions()).getByRole('button', { name: /Одобрить/ }));

    await screen.findByText('Опубликовать отчёт?');
    expect(dialogWindow()).not.toBeNull();
    expect(drawer()).toBeNull();
  });
});
