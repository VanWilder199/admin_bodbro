import { zodResolver } from '@hookform/resolvers/zod';
import { Card } from '@podbor/ui/components/card';
import { Button } from '@podbor/ui/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@podbor/ui/components/ui/dialog';
import { FieldMessage, Input } from '@podbor/ui/components/ui/input';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/endpoints/auth';
import { getErrorMessage } from '@/api/errorMessages';
import { useSession } from '@/auth/sessionContext';
import { readSetupTotpState } from '@/auth/setupState';
import { digitsOnly, emailSchema, passwordSchema, TOTP_LENGTH, totpCodeSchema } from '@/auth/totp';
import { FormLabel } from '@/components/FormLabel';

const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema });
type CredentialsValues = z.input<typeof credentialsSchema>;

type Step =
  | { name: 'credentials' }
  /** Секрет уже записан в БД; страницу нельзя закрывать, пока не введён код. */
  | { name: 'qr'; secret: string; otpAuthUrl: string }
  /** 2FA у этого аккаунта уже настроена (в том числе — если QR был получен, но страница закрылась). */
  | { name: 'configured' };

const groupSecret = (secret: string) => secret.replace(/(.{4})(?=.)/g, '$1 ');

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-6 p-6">{children}</Card>
    </main>
  );
}

/**
 * Первый вход (сценарий С1): email и пароль → `POST /admin/auth/setup-totp` → QR и секрет → код из приложения →
 * `POST /admin/auth/login`. Бэкенд записывает секрет СРАЗУ, до подтверждения кодом, поэтому на шаге с QR
 * уход со страницы блокируется предупреждением: повторный `setup-totp` вернёт 409 и войти будет нельзя (лечится только SQL).
 */
export function SetupTotpPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Email и пароль могли прийти с /login через state роутера (только в памяти). Читаем один раз при монтировании.
  const [initial] = useState(() => readSetupTotpState(location.state));
  const [step, setStep] = useState<Step>({ name: 'credentials' });
  // Пароль нужен на шаге 3 для `login`. Живёт только в этом state и очищается после успеха.
  const [creds, setCreds] = useState<CredentialsValues | null>(null);

  // history.state браузер переживает перезагрузку, а в нём лежал пароль: после прочтения затираем.
  useEffect(() => {
    if (location.state != null) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    // только при монтировании: дальше state пуст
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Шаг 1: email и пароль ----------
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors },
  } = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: initial?.email ?? '', password: initial?.password ?? '' },
  });
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const setupMutation = useMutation({ mutationFn: authApi.setupTotp });

  const requestQr = handleSubmit(async (values) => {
    setCredentialsError(null);
    try {
      const res = await setupMutation.mutateAsync(values);
      setCreds(values);
      setStep({ name: 'qr', secret: res.secret, otpAuthUrl: res.otpAuthUrl });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.errorCode === 'ADMIN_TOTP_ALREADY_CONFIGURED') {
        setStep({ name: 'configured' });
      } else if (err?.errorCode === 'ADMIN_INVALID_CREDENTIALS') {
        setCredentialsError(getErrorMessage(err.errorCode));
        setValue('password', '');
        setFocus('password');
      } else {
        setCredentialsError(err?.status === 0 ? 'Нет связи с сервером. Проверьте интернет и повторите' : getErrorMessage(err?.errorCode));
      }
    }
  });

  // ---------- Шаг 2–3: QR, код, вход ----------
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const loginMutation = useMutation({ mutationFn: authApi.login });
  const submitting = useRef(false);
  const leaveAllowed = useRef(false);

  const confirm = async (value: string) => {
    if (!creds || submitting.current) return;
    if (!totpCodeSchema.safeParse(value).success) {
      setCodeError(`Введите ${TOTP_LENGTH}-значный код из приложения`);
      return;
    }
    submitting.current = true;
    setCodeError(null);
    setLoginError(null);
    try {
      const res = await loginMutation.mutateAsync({ ...creds, totpCode: value });
      leaveAllowed.current = true; // дальше GuestOnly уведёт на returnTo — это не «потеря QR»
      setCreds(null); // пароль больше не нужен
      login(res.accessToken, res.expiresIn, creds.email);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.errorCode === 'ADMIN_TOTP_INVALID') {
        // QR остаётся: можно ввести новый код
        setCodeError(getErrorMessage(err.errorCode));
        setCode('');
      } else if (err?.errorCode === 'ADMIN_INVALID_CREDENTIALS') {
        setLoginError(getErrorMessage(err.errorCode));
        setCode('');
      } else {
        setLoginError(err?.status === 0 ? 'Нет связи с сервером. QR сохранён — повторите ввод кода' : getErrorMessage(err?.errorCode));
      }
    } finally {
      submitting.current = false;
    }
  };

  const onCodeChange = (raw: string) => {
    const next = digitsOnly(raw);
    setCode(next);
    setCodeError(null);
    if (next.length === TOTP_LENGTH) void confirm(next);
  };

  const copySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied('done');
    } catch {
      setCopied('failed'); // нет HTTPS или запрещён доступ к буферу: даём выделить вручную
    }
  };
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  // ---------- Защита от потери доступа ----------
  const guarded = step.name === 'qr';
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guarded && !leaveAllowed.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!guarded) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaveAllowed.current) return;
      e.preventDefault();
      e.returnValue = ''; // обязательно для Chrome/Safari
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [guarded]);

  const loginHref = `/login${location.search}`;

  if (step.name === 'configured') {
    return (
      <Shell>
        <header className="space-y-2">
          <h1 className="text-title font-semibold">2FA уже настроена</h1>
          <p className="text-body text-muted-foreground">{getErrorMessage('ADMIN_TOTP_ALREADY_CONFIGURED')}.</p>
          <p className="text-body text-muted-foreground">
            Если вы только что получили QR-код, но закрыли страницу до ввода кода, секрет уже сохранён на сервере. Тому, кто обслуживает сервер, нужно
            обнулить секрет у вашей учётной записи — после этого настройку можно пройти заново.
          </p>
        </header>
        <Button asChild block size="lg">
          <Link to={loginHref}>Перейти ко входу</Link>
        </Button>
      </Shell>
    );
  }

  if (step.name === 'qr') {
    return (
      <Shell>
        <header className="space-y-1">
          <h1 className="text-title font-semibold">Отсканируйте QR-код</h1>
          <p className="text-body text-muted-foreground">Google Authenticator, 1Password или любое приложение для TOTP-кодов.</p>
        </header>

        <p role="alert" className="rounded-control bg-warn-soft px-4 py-3 text-body text-warn">
          QR-код показывается один раз. Не закрывайте и не обновляйте страницу, пока не введёте код из приложения, — иначе войти в админку будет нельзя.
        </p>

        <div className="flex justify-center">
          <div className="rounded-control bg-white p-3">
            <QRCodeSVG value={step.otpAuthUrl} size={192} level="M" marginSize={0} title="QR-код для приложения-аутентификатора" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="px-1 text-caption font-semibold text-muted-foreground">Не получается отсканировать? Введите ключ вручную</p>
          <div className="flex items-center gap-2">
            <code data-testid="totp-secret" className="min-w-0 flex-1 rounded-control bg-secondary px-4 py-3 font-mono text-body break-all select-all">
              {groupSecret(step.secret)}
            </code>
            <Button type="button" variant="secondary" size="icon" aria-label="Скопировать ключ" onClick={() => void copySecret(step.secret)}>
              {copied === 'done' ? <Check /> : <Copy />}
            </Button>
          </div>
          <div aria-live="polite" className="min-h-4">
            {copied === 'done' && <FieldMessage>Скопировано</FieldMessage>}
            {copied === 'failed' && <FieldMessage error>Не удалось скопировать — выделите ключ и скопируйте вручную</FieldMessage>}
          </div>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void confirm(code);
          }}
          className="space-y-4"
        >
          <div>
            <FormLabel htmlFor="totpCode">Код из приложения</FormLabel>
            <Input
              id="totpCode"
              inputMode="numeric"
              pattern="\d*"
              maxLength={TOTP_LENGTH}
              autoComplete="one-time-code"
              placeholder="000000"
              autoFocus
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'totp-error' : undefined}
            />
            {codeError && (
              <FieldMessage id="totp-error" error>
                {codeError}
              </FieldMessage>
            )}
          </div>

          {loginError && (
            <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-body text-bad">
              {loginError}
            </p>
          )}

          <Button type="submit" block size="lg" loading={loginMutation.isPending}>
            Подтвердить и войти
          </Button>
        </form>

        <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
          <DialogContent showClose={false}>
            <DialogHeader>
              <DialogTitle>Уйти без ввода кода?</DialogTitle>
              <DialogDescription>
                QR-код больше не покажется, а секрет уже сохранён на сервере. После ухода войти в админку не получится, пока секрет не обнулят вручную.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => blocker.proceed?.()}>
                Всё равно уйти
              </Button>
              <Button onClick={() => blocker.reset?.()}>Остаться</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="space-y-1">
        <h1 className="text-title font-semibold">Первый вход: настройка 2FA</h1>
        <p className="text-body text-muted-foreground">Введите email и пароль — покажем QR-код для приложения-аутентификатора.</p>
      </header>

      <p className="rounded-control bg-warn-soft px-4 py-3 text-body text-warn">
        QR-код показывается один раз. Откройте приложение-аутентификатор заранее и не закрывайте страницу, пока не введёте код.
      </p>

      <form onSubmit={requestQr} noValidate className="space-y-4">
        <div>
          <FormLabel htmlFor="email">Email</FormLabel>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus={!initial}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email', { onChange: () => setCredentialsError(null) })}
          />
          {errors.email && (
            <FieldMessage id="email-error" error>
              {errors.email.message}
            </FieldMessage>
          )}
        </div>

        <div>
          <FormLabel htmlFor="password">Пароль</FormLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus={!!initial}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password', { onChange: () => setCredentialsError(null) })}
          />
          {errors.password && (
            <FieldMessage id="password-error" error>
              {errors.password.message}
            </FieldMessage>
          )}
        </div>

        {credentialsError && (
          <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-body text-bad">
            {credentialsError}
          </p>
        )}

        <Button type="submit" block size="lg" loading={setupMutation.isPending}>
          Показать QR-код
        </Button>
      </form>

      <Button asChild variant="ghost" block>
        <Link to={loginHref}>Уже настроили? Войти</Link>
      </Button>
    </Shell>
  );
}
