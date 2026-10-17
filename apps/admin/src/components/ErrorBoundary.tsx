import { Button } from '@podbor/ui/components/ui/button';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Смена ключа (например, пути) сбрасывает ошибку: после перехода на другой экран он рисуется заново. */
  resetKey?: string;
  /** Что делает кнопка «Обновить». По умолчанию — перезагрузка страницы. */
  onReload?: () => void;
}

interface State {
  error: Error | null;
  resetKey?: string;
}

/**
 * Граница ошибок для контент-области: исключение в экране не ломает меню и шапку (PLAN_FRONTEND_ADMIN.md, ADM-5).
 * Ловит ошибки рендера и методов жизненного цикла; ошибки запросов обрабатывают сами экраны (`ApiError`).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Сервиса сбора ошибок пока нет — оставляем след в консоли, чтобы его было видно в DevTools.
    console.error('Ошибка в экране админки:', error, info.componentStack);
  }

  private reload = () => (this.props.onReload ?? (() => window.location.reload()))();

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-heading font-semibold">Что-то пошло не так</h1>
        <p className="text-body text-muted-foreground">Экран не удалось показать. Меню работает — можно перейти в другой раздел или обновить страницу.</p>
        <Button onClick={this.reload}>Обновить</Button>
      </div>
    );
  }
}
