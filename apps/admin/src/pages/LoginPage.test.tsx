import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, type RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { GuestOnly } from '@/auth/GuestOnly';
import { SESSION_STORAGE_KEY } from '@/auth/session';
import { readSetupTotpState } from '@/auth/setupState';
import { appRoutes } from '@/routes';
import { MOCK_ACCOUNTS, MOCK_TOKEN, MOCK_TOTP_CODE } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { LoginPage } from '@/pages/LoginPage';
import { server } from '@/test/server';
import { recordRequests, renderRoutes } from '@/test/utils';

const { configured, fresh } = MOCK_ACCOUNTS;

/** Отдельная страница-пробник вместо настоящего /setup-totp: здесь проверяется только передача state. */
function SetupProbe() {
  const { state } = useLocation();
  const data = readSetupTotpState(state);
  return <span data-testid="setup-state">{data ? `${data.email}|${data.password}` : 'no state'}</span>;
}

const routes: RouteObject[] = [
  { element: <GuestOnly />, children: [{ path: '/login', element: <LoginPage /> }] },
  { path: '/setup-totp', element: <SetupProbe /> },
  // защищённые страницы настоящего приложения: куда попадаем после входа
  ...appRoutes.filter((r) => r.element && (r.element as { type?: unknown }).type !== GuestOnly),
];

function renderApp(route = '/login') {
  const user = userEvent.setup();
  renderRoutes(routes, route);
  return { user };
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const location = () => screen.getByTestId('location').textContent;
const storedSession = () => JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null') as { accessToken: string; expiresAt: number; email: string } | null;

interface Credentials {
  email?: string;
  password?: string;
  code?: string;
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, { email = configured.email, password = configured.password, code = MOCK_TOTP_CODE }: Credentials = {}) {
  await user.type(field('Email'), email);
  await user.type(field('Пароль'), password);
  await user.type(field('Код из приложения'), code); // 6-я цифра сама отправляет форму
}

describe('LoginPage', () => {
  it('верные данные → /moderation, токен и expiresAt в localStorage', async () => {
    const { user } = renderApp();
    const before = Date.now();
    await fillAndSubmit(user);

    await waitFor(() => expect(location()).toBe('/moderation'));
    const session = storedSession();
    expect(session).toMatchObject({ accessToken: MOCK_TOKEN, email: configured.email });
    // expiresIn=86400 секунд → +24 часа в миллисекундах
    expect(session!.expiresAt).toBeGreaterThanOrEqual(before + 86_400_000);
    expect(session!.expiresAt).toBeLessThan(Date.now() + 86_400_000 + 1000);
  });

  it('после входа возвращает на returnTo', async () => {
    const { user } = renderApp('/login?returnTo=%2Fpayouts%3Fstatus%3Dpending');
    await fillAndSubmit(user);
    await waitFor(() => expect(location()).toBe('/payouts?status=pending'));
  });

  it('returnTo=https://evil.com игнорируется', async () => {
    const { user } = renderApp('/login?returnTo=https%3A%2F%2Fevil.com');
    await fillAndSubmit(user);
    await waitFor(() => expect(location()).toBe('/moderation'));
  });

  it('ADMIN_INVALID_CREDENTIALS → ошибка под формой, пароль и код очищены, email остался', async () => {
    const { user } = renderApp();
    await fillAndSubmit(user, { password: 'wrong' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль');
    expect(field('Пароль').value).toBe('');
    expect(field('Код из приложения').value).toBe('');
    expect(field('Email').value).toBe(configured.email);
    expect(location()).toBe('/login');
    expect(storedSession()).toBeNull();
  });

  it('ADMIN_TOTP_INVALID → ошибка у поля кода, очищен только код', async () => {
    const { user } = renderApp();
    await fillAndSubmit(user, { code: '000000' });

    expect(await screen.findByText('Неверный код. Проверьте время на телефоне')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(field('Код из приложения').value).toBe('');
    expect(field('Пароль').value).toBe(configured.password);
    expect(field('Код из приложения')).toHaveAttribute('aria-invalid', 'true');
  });

  it('после неверного кода можно ввести новый — и вход проходит', async () => {
    const { user } = renderApp();
    await fillAndSubmit(user, { code: '000000' });
    await screen.findByText('Неверный код. Проверьте время на телефоне');

    await user.type(field('Код из приложения'), MOCK_TOTP_CODE);
    await waitFor(() => expect(location()).toBe('/moderation'));
  });

  it('ADMIN_TOTP_NOT_CONFIGURED → /setup-totp, email и пароль в state роутера, не в URL и не в storage', async () => {
    const { user } = renderApp();
    await fillAndSubmit(user, fresh);

    await waitFor(() => expect(location()).toBe('/setup-totp'));
    expect(screen.getByTestId('setup-state')).toHaveTextContent(`${fresh.email}|${fresh.password}`);
    expect(JSON.stringify({ ...localStorage })).not.toContain(fresh.password);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(fresh.password);
  });

  it('пустые поля → валидация на фронте, запрос не уходит', async () => {
    const requests = recordRequests(server);
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Введите email')).toBeInTheDocument();
    expect(screen.getByText('Введите пароль')).toBeInTheDocument();
    expect(screen.getByText('Введите 6-значный код из приложения')).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('код принимает только цифры и не длиннее 6', async () => {
    const { user } = renderApp();
    await user.type(field('Код из приложения'), '12ab34567890');
    expect(field('Код из приложения').value).toBe('123456');
  });

  it('автоотправка срабатывает один раз на 6-й цифре', async () => {
    const requests = recordRequests(server);
    const { user } = renderApp();
    await fillAndSubmit(user);
    await waitFor(() => expect(location()).toBe('/moderation'));
    expect(requests.filter((r) => r === 'POST /api/admin/auth/login')).toHaveLength(1);
  });

  it('сетевая ошибка → понятное сообщение, поля сохранены', async () => {
    mockControl.failOnce('POST /admin/auth/login', { kind: 'network' });
    const { user } = renderApp();
    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(field('Пароль').value).toBe(configured.password);
  });

  it('ссылка «Первый вход» ведёт на /setup-totp и передаёт введённые email и пароль', async () => {
    const { user } = renderApp();
    await user.type(field('Email'), fresh.email);
    await user.type(field('Пароль'), fresh.password);
    await user.click(screen.getByRole('button', { name: /Первый вход/ }));

    await waitFor(() => expect(location()).toBe('/setup-totp'));
    expect(screen.getByTestId('setup-state')).toHaveTextContent(`${fresh.email}|${fresh.password}`);
  });

  it('с живой сессией /login сразу ведёт на /moderation', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: MOCK_TOKEN, expiresAt: Date.now() + 3_600_000, email: configured.email }));
    renderApp('/login');
    await waitFor(() => expect(location()).toBe('/moderation'));
  });
});
