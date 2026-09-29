import { AppError } from './errors.js';
import type { Credentials } from './validation.js';

export interface Notification {
  receiptId: number;
  body: Record<string, unknown>;
}

export interface GreenApi {
  getState(): Promise<string>;
  checkAccount(phoneNumber: string): Promise<{ exist: boolean; chatId: string }>;
  sendMessage(chatId: string, message: string): Promise<string>;
  receiveNotification(): Promise<Notification | null>;
  deleteNotification(receiptId: number): Promise<void>;
}

export class GreenApiClient implements GreenApi {
  constructor(private readonly credentials: Credentials) {}

  private async request<T>(method: string, name: string, body?: unknown, suffix = ''): Promise<T> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials;
    const endpoint = `${apiUrl}/waInstance${idInstance}/${name}/${apiTokenInstance}${suffix}`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(name === 'receiveNotification' ? 12000 : 15000),
        redirect: 'error',
      });
    } catch {
      throw new AppError('NETWORK_ERROR', 'GREEN-API временно недоступен. Повторите попытку.', 502);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('AUTH_ERROR', 'Доступ к инстансу отклонён. Проверьте ID, токен и состояние аккаунта.', 401);
    }
    if (response.status === 429 || response.status === 469) {
      throw new AppError('RATE_LIMITED', 'Превышен лимит запросов GREEN-API. Попробуйте позже.', 429);
    }
    if (!response.ok) {
      throw new AppError('UPSTREAM_ERROR', `GREEN-API вернул ошибку ${response.status}.`, 502);
    }
    if (response.status === 204) return null as T;
    const raw = await response.text();
    if (!raw || raw === 'null') return null as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new AppError('UPSTREAM_ERROR', 'GREEN-API вернул некорректный ответ.', 502);
    }
  }

  async getState(): Promise<string> {
    const result = await this.request<{ stateInstance?: string }>('GET', 'getStateInstance');
    if (!result?.stateInstance) throw new AppError('UPSTREAM_ERROR', 'Не удалось определить состояние инстанса.', 502);
    return result.stateInstance;
  }

  async checkAccount(phoneNumber: string): Promise<{ exist: boolean; chatId: string }> {
    const result = await this.request<{ exist?: boolean; chatId?: string; status?: boolean; reason?: string }>(
      'POST', 'checkAccount', { phoneNumber: Number(phoneNumber) },
    );
    if (result?.status === false) {
      throw new AppError('INSTANCE_UNAVAILABLE', 'Инстанс пока не готов к проверке номера.', 503);
    }
    return { exist: result?.exist === true, chatId: result?.chatId ?? '' };
  }

  async sendMessage(chatId: string, message: string): Promise<string> {
    const result = await this.request<{ idMessage?: string }>('POST', 'sendMessage', { chatId, message });
    if (!result?.idMessage) throw new AppError('UPSTREAM_ERROR', 'GREEN-API не подтвердил отправку.', 502);
    return result.idMessage;
  }

  receiveNotification(): Promise<Notification | null> {
    return this.request<Notification | null>('GET', 'receiveNotification', undefined, '?receiveTimeout=5');
  }

  async deleteNotification(receiptId: number): Promise<void> {
    await this.request<unknown>('DELETE', 'deleteNotification', undefined, `/${receiptId}`);
  }
}
