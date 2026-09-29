import { AppError } from './errors.js';

export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export function parseCredentials(input: unknown): Credentials {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_CREDENTIALS', 'Введите параметры инстанса.');
  }
  const value = input as Record<string, unknown>;
  const rawUrl = String(value.apiUrl ?? '').trim();
  const idInstance = String(value.idInstance ?? '').trim();
  const apiTokenInstance = String(value.apiTokenInstance ?? '').trim();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError('INVALID_API_URL', 'Укажите адрес API из кабинета GREEN-API.');
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !/(^|\.)api\.green-api\.com$/.test(hostname)
  ) {
    throw new AppError('INVALID_API_URL', 'Нужен HTTPS-адрес хоста GREEN-API из личного кабинета.');
  }
  if (!/^\d{6,15}$/.test(idInstance) || !/^[A-Za-z0-9_-]{8,256}$/.test(apiTokenInstance)) {
    throw new AppError('INVALID_CREDENTIALS', 'Проверьте ID и токен инстанса.');
  }
  return { apiUrl: url.origin, idInstance, apiTokenInstance };
}

export function parsePhone(input: unknown): string {
  if (typeof input !== 'string') {
    throw new AppError('INVALID_PHONE', 'Введите номер телефона.');
  }
  const phone = input.replace(/[\s()+-]/g, '');
  if (!/^(7\d{10}|375\d{9})$/.test(phone)) {
    throw new AppError('INVALID_PHONE', 'Номер должен начинаться с 7 или 375 и содержать 11–12 цифр.');
  }
  return phone;
}

export function parseMessage(input: unknown): string {
  if (typeof input !== 'string') {
    throw new AppError('INVALID_MESSAGE', 'Введите текст сообщения.');
  }
  const message = input.trim();
  if (!message) throw new AppError('INVALID_MESSAGE', 'Введите текст сообщения.');
  if (message.length > 4000) {
    throw new AppError('MESSAGE_TOO_LONG', 'Сообщение не должно превышать 4000 символов.');
  }
  return message;
}
