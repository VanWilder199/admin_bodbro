import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom');
  return <p>всё хорошо</p>;
}

afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('без ошибки показывает содержимое', () => {
    render(
      <ErrorBoundary>
        <Bomb explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('всё хорошо')).toBeInTheDocument();
  });

  it('исключение при рендере → «Что-то пошло не так» и кнопка «Обновить»', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Что-то пошло не так');
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
  });

  it('«Обновить» вызывает перезагрузку', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReload = vi.fn();
    render(
      <ErrorBoundary onReload={onReload}>
        <Bomb explode />
      </ErrorBoundary>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Обновить' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('смена resetKey (переход на другой экран) сбрасывает ошибку', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    function Host() {
      const [path, setPath] = useState('/a');
      return (
        <>
          <button onClick={() => setPath('/b')}>перейти</button>
          <ErrorBoundary resetKey={path}>
            <Bomb explode={path === '/a'} />
          </ErrorBoundary>
        </>
      );
    }

    render(<Host />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'перейти' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('всё хорошо')).toBeInTheDocument();
  });

  it('пишет ошибку в консоль, чтобы её было видно в DevTools', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb explode />
      </ErrorBoundary>,
    );
    expect(spy.mock.calls.some((args) => String(args[0]).includes('Ошибка в экране админки'))).toBe(true);
  });
});
