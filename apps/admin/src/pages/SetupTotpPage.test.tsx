import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_STORAGE_KEY } from '@/auth/session';
import { appRoutes } from '@/routes';
import { MOCK_ACCOUNTS, MOCK_TOKEN, MOCK_TOTP_CODE } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { server } from '@/test/server';
import { recordRequests, renderRoutes } from '@/test/utils';

const { configured, fresh } = MOCK_ACCOUNTS;

// QR-картинку нельзя прочитать без декодера, поэтому подменяем компонент и проверяем, ЧТО ему передали.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, title }: { value: string; title?: string }) => (
    <svg data-value={value}>
      <title>{title}</title>
    </svg>
  ),
}));

function renderPage(route = '/setup-totp') {
  const user = userEvent.setup();
  const utils = renderRoutes(appRoutes, route);
  return { user, ...utils };
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const location = () => screen.getByTestId('location').textContent;
const storedSession = () => localStorage.getItem(SESSION_STORAGE_KEY);

async function requestQr(user: ReturnType<typeof userEvent.setup>, { email = fresh.email, password = fresh.password }: { email?: string; password?: string } = {}) {
  await user.type(field('Email'), email);
  await user.type(field('Пароль'), password);
  await user.click(screen.getByRole('button', { name: 'Показать QR-код' }));
}

describe('шаг 1: email и пароль', () => {
  it('показывает предупреждение «QR показывается один раз» ещё до запроса', () => {
    renderPage();
    expect(screen.getByText(/QR-код показывается один раз/)).toBeInTheDocument();
  });

  it('пустые поля → валидация на фронте, запрос не уходит', async () => {
    const requests = recordRequests(server);
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Показать QR-код' }));

    expect(await screen.findByText('Введите email')).toBeInTheDocument();
    expect(screen.getByText('Введите пароль')).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('ADMIN_INVALID_CREDENTIALS → ошибка на шаге 1, пароль очищен, QR не показан', async () => {
    const { user } = renderPage();
    await requestQr(user, { password: 'wrong' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль');
    expect(field('Пароль').value).toBe('');
    expect(field('Email').value).toBe(fresh.email);
    expect(screen.queryByTestId('totp-secret')).not.toBeInTheDocument();
  });

  it('ADMIN_TOTP_ALREADY_CONFIGURED → сообщение и ссылка на /login', async () => {
    const { user } = renderPage();
    await requestQr(user, configured);

    expect(await screen.findByText('2FA уже настроена')).toBeInTheDocument();
    expect(screen.getByText(/Для сброса обратитесь к администратору/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Перейти ко входу' });
    expect(link).toHaveAttribute('href', '/login');

    await user.click(link);
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('сетевая ошибка → сообщение, поля сохранены', async () => {
    mockControl.failOnce('POST /admin/auth/setup-totp', { kind: 'network' });
    const { user } = renderPage();
    await requestQr(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(field('Пароль').value).toBe(fresh.password);
  });

  it('ссылка «Уже настроили? Войти» ведёт на /login', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('link', { name: 'Уже настроили? Войти' }));
    await waitFor(() => expect(location()).toBe('/login'));
  });
});

describe('вход с /login: email и пароль приходят через state роутера', () => {
  it('поля предзаполнены, а из history.state пароль затирается', async () => {
    const { router } = renderPage('/login');
    await act(async () => {
      await router.navigate('/setup-totp', { state: { email: fresh.email, password: fresh.password } });
    });

    await waitFor(() => expect(field('Email').value).toBe(fresh.email));
    expect(field('Пароль').value).toBe(fresh.password);
    // после прочтения state обнуляется: перезагрузка не вернёт пароль из history.state
    await waitFor(() => expect(router.state.location.state).toBeNull());
  });

  it('без state (прямой заход) поля пустые', () => {
    renderPage('/setup-totp');
    expect(field('Email').value).toBe('');
    expect(field('Пароль').value).toBe('');
  });
});

describe('шаг 2: QR и секрет', () => {
  async function openQr() {
    const ctx = renderPage();
    await requestQr(ctx.user);
    await screen.findByTestId('totp-secret');
    return ctx;
  }

  it('рисует QR по otpAuthUrl и показывает секрет текстом, сгруппированным по 4', async () => {
    await openQr();
    expect(screen.getByTitle('QR-код для приложения-аутентификатора')).toBeInTheDocument();
    expect(screen.getByTestId('totp-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP');
    expect(screen.getByRole('alert')).toHaveTextContent('QR-код показывается один раз');
  });

  it('QR кодирует именно otpauth://-ссылку, которую вернул бэкенд', async () => {
    await openQr();
    const value = screen.getByTitle('QR-код для приложения-аутентификатора').closest('svg')!.getAttribute('data-value');
    expect(value).toMatch(/^otpauth:\/\/totp\/.+secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP/);
    expect(value).toContain('digits=6');
  });

  it('кнопка копирования кладёт в буфер секрет без пробелов', async () => {
    const { user } = await openQr();
    await user.click(screen.getByRole('button', { name: 'Скопировать ключ' }));
    expect(await navigator.clipboard.readText()).toBe('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
    expect(await screen.findByText('Скопировано')).toBeInTheDocument();
  });

  it('если буфер недоступен — просит скопировать вручную, а не молчит', async () => {
    const { user } = await openQr();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Скопировать ключ' }));
    expect(await screen.findByText(/скопируйте вручную/)).toBeInTheDocument();
  });
});

describe('шаг 3: подтверждение кодом', () => {
  async function openQr() {
    const ctx = renderPage();
    await requestQr(ctx.user);
    await screen.findByTestId('totp-secret');
    return ctx;
  }

  it('верный код → login с теми же email и паролем → /moderation, сессия сохранена', async () => {
    const { user } = await openQr();
    await user.type(field('Код из приложения'), MOCK_TOTP_CODE);

    await waitFor(() => expect(location()).toBe('/moderation'));
    expect(JSON.parse(storedSession()!)).toMatchObject({ accessToken: MOCK_TOKEN, email: fresh.email });
  });

  it('после успеха пароль нигде не лежит', async () => {
    const { user } = await openQr();
    await user.type(field('Код из приложения'), MOCK_TOTP_CODE);
    await waitFor(() => expect(location()).toBe('/moderation'));

    expect(JSON.stringify({ ...localStorage })).not.toContain(fresh.password);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(fresh.password);
    expect(JSON.stringify(window.history.state ?? null)).not.toContain(fresh.password);
  });

  it('login уходит один раз, а не по разу на цифру и на submit', async () => {
    const requests = recordRequests(server);
    const { user } = await openQr();
    await user.type(field('Код из приложения'), MOCK_TOTP_CODE);
    await waitFor(() => expect(location()).toBe('/moderation'));
    expect(requests.filter((r) => r === 'POST /api/admin/auth/login')).toHaveLength(1);
    expect(requests.filter((r) => r === 'POST /api/admin/auth/setup-totp')).toHaveLength(1);
  });

  it('неверный код → ошибка, поле очищено, QR и секрет остаются, можно повторить', async () => {
    const requests = recordRequests(server);
    const { user } = await openQr();
    await user.type(field('Код из приложения'), '000000');

    expect(await screen.findByText('Неверный код. Проверьте время на телефоне')).toBeInTheDocument();
    expect(field('Код из приложения').value).toBe('');
    expect(field('Код из приложения')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('totp-secret')).toBeInTheDocument();
    expect(screen.getByTitle('QR-код для приложения-аутентификатора')).toBeInTheDocument();
    // секрет не запрашивался заново: второй setup-totp вернул бы 409
    expect(requests.filter((r) => r === 'POST /api/admin/auth/setup-totp')).toHaveLength(1);

    await user.type(field('Код из приложения'), MOCK_TOTP_CODE);
    await waitFor(() => expect(location()).toBe('/moderation'));
  });

  it('код принимает только цифры', async () => {
    const { user } = await openQr();
    await user.type(field('Код из приложения'), '12ab34');
    expect(field('Код из приложения').value).toBe('1234');
  });

  it('кнопка с неполным кодом → ошибка валидации, запрос login не уходит', async () => {
    const { user } = await openQr();
    const requests = recordRequests(server);
    await user.type(field('Код из приложения'), '123');
    await user.click(screen.getByRole('button', { name: 'Подтвердить и войти' }));

    expect(await screen.findByText('Введите 6-значный код из приложения')).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('сетевая ошибка при входе → QR остаётся, код можно ввести снова', async () => {
    const { user } = await openQr();
    mockControl.failOnce('POST /admin/auth/login', { kind: 'network' });
    await user.type(field('Код из приложения'), MOCK_TOTP_CODE);

    expect(await screen.findByText(/QR сохранён/)).toBeInTheDocument();
    // предупреждение «QR показывается один раз» и ошибка — два разных alert
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByTestId('totp-secret')).toBeInTheDocument();
  });
});

describe('защита от потери доступа на шаге с QR', () => {
  async function openQr() {
    const ctx = renderPage();
    await requestQr(ctx.user);
    await screen.findByTestId('totp-secret');
    return ctx;
  }

  afterEach(() => vi.restoreAllMocks());

  it('beforeunload блокируется на шаге с QR', async () => {
    await openQr();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('на шаге 1 (секрет ещё не записан) уходить можно без предупреждения', () => {
    renderPage();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('уход по роутеру на шаге с QR → диалог; «Остаться» возвращает на страницу', async () => {
    const { user, router } = await openQr();
    await act(async () => {
      void router.navigate('/login');
    });

    expect(await screen.findByText('Уйти без ввода кода?')).toBeInTheDocument();
    expect(location()).toBe('/setup-totp');

    await user.click(screen.getByRole('button', { name: 'Остаться' }));
    await waitFor(() => expect(screen.queryByText('Уйти без ввода кода?')).not.toBeInTheDocument());
    expect(location()).toBe('/setup-totp');
    expect(screen.getByTestId('totp-secret')).toBeInTheDocument();
  });

  it('«Всё равно уйти» → переход выполняется', async () => {
    const { user, router } = await openQr();
    await act(async () => {
      void router.navigate('/login');
    });
    await user.click(await screen.findByRole('button', { name: 'Всё равно уйти' }));
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('успешный вход не вызывает предупреждение «уйти без кода»', async () => {
    const { user } = await openQr();
    await user.type(field('Код из приложения'), MOCK_TOTP_CODE);
    await waitFor(() => expect(location()).toBe('/moderation'));
    expect(screen.queryByText('Уйти без ввода кода?')).not.toBeInTheDocument();
  });
});
