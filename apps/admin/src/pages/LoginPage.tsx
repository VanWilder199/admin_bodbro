import { zodResolver } from '@hookform/resolvers/zod';
import { Card } from '@podbor/ui/components/card';
import { Button } from '@podbor/ui/components/ui/button';
import { FieldMessage, Input } from '@podbor/ui/components/ui/input';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/endpoints/auth';
import { getErrorMessage } from '@/api/errorMessages';
import { FormLabel as Label } from '@/components/FormLabel';
import type { SetupTotpState } from '@/auth/setupState';
import { useSession } from '@/auth/sessionContext';
import { digitsOnly, emailSchema, passwordSchema, TOTP_LENGTH, totpCodeSchema } from '@/auth/totp';

const schema = z.object({
  email: emailSchema,
  password: passwordSchema,
  totpCode: totpCodeSchema,
});

type FormValues = z.input<typeof schema>;

const REASON_TEXT = {
  expired: 'Сессия истекла, войдите снова',
  'other-tab': 'Вы вышли из админки в другой вкладке',
} as const;

export function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const reason = (location.state as { reason?: keyof typeof REASON_TEXT } | null)?.reason;

  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    getValues,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', totpCode: '' },
  });

  // Ошибки сервера: общая (под формой) и по полю кода. Ошибки валидации живут в `errors` формы.
  const [formError, setFormError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const loginMutation = useMutation({ mutationFn: authApi.login });
  // Автоотправка по 6-й цифре и Enter могут сработать одновременно: state обновится позже, чем придёт второй вызов.
  const submitting = useRef(false);

  const totpCode = watch('totpCode');
  const codeRegistration = register('totpCode');

  const submit = handleSubmit(async (values) => {
    if (submitting.current) return;
    submitting.current = true;
    setFormError(null);
    setCodeError(null);

    try {
      const res = await loginMutation.mutateAsync(values);
      // Переход на returnTo делает GuestOnly, как только появится сессия.
      login(res.accessToken, res.expiresIn, values.email);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;

      switch (err?.errorCode) {
        case 'ADMIN_INVALID_CREDENTIALS':
          setFormError(getErrorMessage(err.errorCode));
          setValue('password', '');
          setValue('totpCode', '');
          setFocus('password');
          break;
        case 'ADMIN_TOTP_INVALID':
          setCodeError(getErrorMessage(err.errorCode));
          setValue('totpCode', '');
          setFocus('totpCode');
          break;
        case 'ADMIN_TOTP_NOT_CONFIGURED':
          // Пароль уже подтверждён бэкендом: безопасно переходить на настройку, передав данные через state.
          navigate('/setup-totp', { state: { email: values.email, password: values.password } satisfies SetupTotpState });
          break;
        default:
          setFormError(err?.status === 0 ? 'Нет связи с сервером. Проверьте интернет и повторите' : getErrorMessage(err?.errorCode));
      }
    } finally {
      submitting.current = false;
    }
  });

  const onCodeChange = (value: string) => {
    const code = digitsOnly(value);
    setValue('totpCode', code, { shouldValidate: isSubmitted });
    setCodeError(null);
    if (code.length === TOTP_LENGTH) void submit();
  };

  const goToSetup = () => {
    const { email, password } = getValues();
    navigate('/setup-totp', { state: email && password ? ({ email, password } satisfies SetupTotpState) : null });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-6 p-6">
        <header className="space-y-1">
          <h1 className="text-title font-semibold">Вход в админку</h1>
          <p className="text-body text-muted-foreground">Email, пароль и код из приложения-аутентификатора</p>
        </header>

        {reason && (
          <p role="status" className="rounded-control bg-warn-soft px-4 py-3 text-body text-warn">
            {REASON_TEXT[reason]}
          </p>
        )}

        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email', { onChange: () => setFormError(null) })}
            />
            {errors.email && (
              <FieldMessage id="email-error" error>
                {errors.email.message}
              </FieldMessage>
            )}
          </div>

          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password', { onChange: () => setFormError(null) })}
            />
            {errors.password && (
              <FieldMessage id="password-error" error>
                {errors.password.message}
              </FieldMessage>
            )}
          </div>

          <div>
            <Label htmlFor="totpCode">Код из приложения</Label>
            <Input
              id="totpCode"
              inputMode="numeric"
              pattern="\d*"
              maxLength={TOTP_LENGTH}
              autoComplete="one-time-code"
              placeholder="000000"
              aria-invalid={errors.totpCode || codeError ? true : undefined}
              aria-describedby={errors.totpCode || codeError ? 'totp-error' : undefined}
              name={codeRegistration.name}
              ref={codeRegistration.ref}
              onBlur={codeRegistration.onBlur}
              value={totpCode}
              onChange={(e) => onCodeChange(e.target.value)}
            />
            {(codeError || errors.totpCode) && (
              <FieldMessage id="totp-error" error>
                {codeError ?? errors.totpCode?.message}
              </FieldMessage>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-body text-bad">
              {formError}
            </p>
          )}

          <Button type="submit" block size="lg" loading={loginMutation.isPending}>
            Войти
          </Button>
        </form>

        <Button type="button" variant="ghost" block onClick={goToSetup}>
          Первый вход — настроить 2FA
        </Button>
      </Card>
    </main>
  );
}
