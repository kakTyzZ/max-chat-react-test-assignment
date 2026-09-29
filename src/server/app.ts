import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, publicError } from './errors.js';
import { SessionManager, type Session } from './session.js';
import { parseCredentials, parseMessage, parsePhone } from './validation.js';

const COOKIE_NAME = 'max_chat_session';

function readCookie(request: Request): string | undefined {
  const found = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return found?.slice(COOKIE_NAME.length + 1);
}

function requireSession(request: Request, manager: SessionManager): Session {
  const session = manager.get(readCookie(request));
  if (!session) throw new AppError('SESSION_EXPIRED', 'Сессия завершилась. Подключите инстанс снова.', 401);
  return session;
}

export function createApp(manager = new SessionManager()): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (process.env.NODE_ENV === 'production') {
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
    }
    next();
  });
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (request, _response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
    const origin = request.headers.origin;
    let originHost: string | undefined;
    try { originHost = origin ? new URL(origin).host : undefined; } catch { originHost = 'invalid'; }
    if (originHost && originHost !== request.headers.host) {
      return next(new AppError('INVALID_ORIGIN', 'Запрос пришёл с другого сайта.', 403));
    }
    next();
  });

  app.get('/api/health', (_request, response) => response.json({ ok: true }));
  app.get('/api/session', (request, response) => {
    const session = manager.get(readCookie(request));
    if (session) {
      const secure = process.env.NODE_ENV === 'production' || request.secure || request.headers['x-forwarded-proto'] === 'https';
      response.cookie(COOKIE_NAME, session.id, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 60 * 1000 });
    }
    response.json(manager.snapshot(session));
  });
  app.post('/api/session', async (request, response, next) => {
    try {
      const existingId = readCookie(request);
      if (existingId) manager.remove(existingId);
      const session = await manager.create(parseCredentials(request.body));
      const secure = process.env.NODE_ENV === 'production' || request.secure || request.headers['x-forwarded-proto'] === 'https';
      response.cookie(COOKIE_NAME, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: 30 * 60 * 1000,
      });
      response.status(201).json(manager.snapshot(session));
    } catch (error) {
      next(error);
    }
  });
  app.delete('/api/session', (request, response) => {
    const id = readCookie(request);
    if (id) manager.remove(id);
    response.clearCookie(COOKIE_NAME, { path: '/' });
    response.status(204).end();
  });
  app.get('/api/chats', (request, response, next) => {
    try { response.json(manager.snapshot(requireSession(request, manager))); } catch (error) { next(error); }
  });
  app.post('/api/chats', async (request, response, next) => {
    try {
      const session = requireSession(request, manager);
      const chat = await manager.addChat(session, parsePhone(request.body?.phoneNumber));
      response.status(201).json(chat);
    } catch (error) { next(error); }
  });
  app.post('/api/chats/:chatId/messages', async (request, response, next) => {
    try {
      const session = requireSession(request, manager);
      const chatId = String(request.params.chatId);
      const message = await manager.send(session, chatId, parseMessage(request.body?.text));
      response.status(201).json(message);
    } catch (error) { next(error); }
  });

  if (process.env.NODE_ENV === 'production') {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const clientDir = path.resolve(here, '../client');
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_request, response) => response.sendFile(path.join(clientDir, 'index.html')));
  }
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    const safe = publicError(error);
    response.status(safe.status).json({ code: safe.code, message: safe.message });
  });
  return app;
}
