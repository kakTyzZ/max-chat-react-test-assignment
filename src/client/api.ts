import type { ApiErrorBody, Chat, ChatMessage, Snapshot } from '../shared/types';

export class ClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new ClientError('NETWORK_ERROR', 'Не удалось подключиться к серверу. Проверьте соединение.');
  }
  if (!response.ok) {
    const fallback = { code: 'SERVER_ERROR', message: 'Что-то пошло не так. Попробуйте ещё раз.' };
    const error = await response.json().catch(() => fallback) as ApiErrorBody;
    throw new ClientError(error.code ?? fallback.code, error.message ?? fallback.message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  snapshot: () => request<Snapshot>('/session'),
  connect: (credentials: { apiUrl: string; idInstance: string; apiTokenInstance: string }) =>
    request<Snapshot>('/session', { method: 'POST', body: JSON.stringify(credentials) }),
  disconnect: () => request<void>('/session', { method: 'DELETE' }),
  createChat: (phoneNumber: string) =>
    request<Chat>('/chats', { method: 'POST', body: JSON.stringify({ phoneNumber }) }),
  send: (chatId: string, text: string) =>
    request<ChatMessage>(`/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST', body: JSON.stringify({ text }),
    }),
};
