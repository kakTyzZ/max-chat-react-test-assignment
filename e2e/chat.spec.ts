import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Chat, Snapshot } from '../src/shared/types';

async function mockApi(page: Page) {
  const data: Snapshot = { connected: false, chats: [] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON?.() as Record<string, string> | null;
    const respond = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/api/session' && method === 'GET') return respond(data);
    if (path === '/api/session' && method === 'POST') {
      data.connected = true;
      data.instanceId = body?.idInstance ?? '3100000000';
      return respond(data, 201);
    }
    if (path === '/api/session' && method === 'DELETE') { data.connected = false; data.chats = []; return route.fulfill({ status: 204, body: '' }); }
    if (path === '/api/chats' && method === 'POST') {
      if (body?.phoneNumber?.includes('000')) return respond({ code: 'RECIPIENT_NOT_FOUND', message: 'Аккаунт MAX для этого номера не найден.' }, 404);
      const chat: Chat = { chatId: '10000000', phoneNumber: '79991234567', name: '+79991234567', createdAt: Date.now(), messages: [] };
      if (!data.chats.length) data.chats.push(chat);
      return respond(data.chats[0], 201);
    }
    if (path === '/api/chats/10000000/messages' && method === 'POST') {
      const message = { id: 'out-1', chatId: '10000000', text: body?.text ?? '', direction: 'outgoing', timestamp: Date.now(), status: 'queued' };
      data.chats[0].messages.push(message as Chat['messages'][number]);
      data.chats[0].messages.push({ id: 'in-1', chatId: '10000000', text: 'Привет! Всё отлично, спасибо.', direction: 'incoming', timestamp: Date.now() + 1000 });
      return respond(message, 201);
    }
    return respond({ code: 'NOT_FOUND', message: 'Not mocked' }, 404);
  });
  return data;
}

async function connect(page: Page) {
  await page.getByLabel('Адрес API').fill('https://3100.api.green-api.com');
  await page.getByLabel('ID инстанса').fill('3100000000');
  await page.getByLabel('Токен инстанса').fill('abcdef0123456789');
  await page.getByRole('button', { name: 'Открыть чат' }).click();
  await expect(page.getByRole('heading', { name: 'Сообщения' })).toBeVisible();
}

test('desktop: connection, chat and reply', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'unavailable';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
  console.log(`WebGL renderer: ${renderer}`);
  expect(renderer).not.toMatch(/SwiftShader|unavailable/i);
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/connect-desktop.png', fullPage: true });
  await connect(page);
  await page.locator('.new-chat-button').click();
  await page.getByLabel('Номер телефона').fill('+7 (999) 123-45-67');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать чат' }).click();
  await expect(page.getByText('Начните разговор')).toBeVisible();
  await page.getByLabel('Текст сообщения').fill('Привет!');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('log', { name: 'Сообщения' }).getByText('Привет!', { exact: true })).toBeVisible();
  await expect(page.getByRole('log', { name: 'Сообщения' }).getByText('Привет! Всё отлично, спасибо.')).toBeVisible();
  await page.screenshot({ path: 'screenshots/chat-desktop.png', fullPage: true });
});

test('mobile: chat flow stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/');
  await page.screenshot({ path: 'screenshots/connect-mobile.png', fullPage: true });
  await connect(page);
  await page.locator('.new-chat-button').click();
  await page.getByLabel('Номер телефона').fill('79991234567');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать чат' }).click();
  await expect(page.getByLabel('Текст сообщения')).toBeVisible();
  await page.getByLabel('Текст сообщения').fill('Добрый день');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await expect(page.getByRole('log', { name: 'Сообщения' }).getByText('Привет! Всё отлично, спасибо.')).toBeVisible();
  await page.screenshot({ path: 'screenshots/chat-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'К списку чатов' }).click();
  await expect(page.getByRole('heading', { name: 'Сообщения' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('new chat keeps the dialog open when a number is not registered', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await connect(page);
  await page.locator('.new-chat-button').click();
  await page.getByLabel('Номер телефона').fill('79990000000');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать чат' }).click();
  await expect(page.getByRole('alert')).toHaveText('Аккаунт MAX для этого номера не найден.');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});
