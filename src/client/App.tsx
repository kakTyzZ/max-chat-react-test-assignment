import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight,
  CircleHelp, Link2, LoaderCircle, LogOut, MessageCircle, Plus, Send,
  ShieldCheck, Wifi, X,
} from 'lucide-react';
import type { Chat, ChatMessage, Snapshot } from '../shared/types';
import { api } from './api';

const emptySnapshot: Snapshot = { connected: false, chats: [] };

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка. Попробуйте ещё раз.';
}

function Mark({ small = false }: { small?: boolean }) {
  return <span className={`mark ${small ? 'mark--small' : ''}`} aria-hidden="true">м</span>;
}

function ConnectScreen({ onConnected }: { onConnected: (snapshot: Snapshot) => void }) {
  const [apiUrl, setApiUrl] = useState('');
  const [idInstance, setIdInstance] = useState('');
  const [apiTokenInstance, setApiTokenInstance] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try {
      onConnected(await api.connect({ apiUrl, idInstance, apiTokenInstance }));
      setApiTokenInstance('');
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="connect-page">
      <div className="connect-shell">
        <header className="connect-header">
          <div className="brand"><Mark /><span>MAX<span className="brand-muted"> Chat</span></span></div>
          <span className="header-note">На базе GREEN-API</span>
        </header>
        <div className="connect-grid">
          <section className="connect-intro" aria-labelledby="welcome-title">
            <span className="eyebrow"><span className="eyebrow-dot" /> Связь без лишнего</span>
            <h1 id="welcome-title">Ваши сообщения.<br /><span>В одном окне.</span></h1>
            <p>Простой веб-чат для текстовой переписки в MAX. Подключите свой инстанс GREEN-API — и можно начинать разговор.</p>
            <div className="intro-preview" aria-hidden="true">
              <div className="preview-row"><span className="preview-avatar">А</span><span className="preview-bubble preview-bubble--incoming">Привет! Как дела?</span></div>
              <div className="preview-row preview-row--out"><span className="preview-bubble preview-bubble--outgoing">Отлично, на связи ✨</span></div>
              <div className="preview-row"><span className="preview-avatar">А</span><span className="preview-bubble preview-bubble--incoming preview-bubble--short">Супер!</span></div>
            </div>
            <div className="intro-caption"><ShieldCheck size={18} /> Данные для входа не сохраняются в браузере</div>
          </section>
          <section className="connect-card" aria-labelledby="connect-title">
            <div className="card-kicker"><span className="card-kicker-line" /> Подключение</div>
            <h2 id="connect-title">Войдите в чат</h2>
            <p className="card-description">Введите параметры инстанса из личного кабинета GREEN-API.</p>
            <form onSubmit={submit} className="connect-form">
              <label className="field">
                <span>Адрес API</span>
                <input type="url" inputMode="url" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="https://xxxx.api.green-api.com" autoComplete="url" required />
                <small>Поле <b>apiUrl</b> в карточке вашего инстанса</small>
              </label>
              <label className="field">
                <span>ID инстанса</span>
                <input type="text" inputMode="numeric" value={idInstance} onChange={(event) => setIdInstance(event.target.value)} placeholder="Например, 3100000000" autoComplete="off" required />
              </label>
              <label className="field">
                <span>Токен инстанса</span>
                <input type="password" value={apiTokenInstance} onChange={(event) => setApiTokenInstance(event.target.value)} placeholder="Введите apiTokenInstance" autoComplete="off" required />
              </label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="primary-button connect-button" type="submit" disabled={pending}>
                {pending ? <><LoaderCircle className="spin" size={19} /> Подключаем...</> : <>Открыть чат <ArrowRight size={20} /></>}
              </button>
            </form>
            <div className="connect-help">
              <CircleHelp size={18} />
              <span>Нужен инстанс? <a href="https://green-api.com/v3/docs/before-start/" target="_blank" rel="noreferrer">Как его создать <ArrowUpRight size={14} /></a></span>
            </div>
          </section>
        </div>
        <footer className="connect-footer"><span>Тестовое задание · React + GREEN-API</span><span>Только текстовые сообщения</span></footer>
      </div>
    </main>
  );
}

function StatusIcon({ status }: { status: ChatMessage['status'] }) {
  if (status === 'read' || status === 'delivered') return <CheckCheck size={15} aria-label={status === 'read' ? 'Прочитано' : 'Доставлено'} />;
  if (status === 'failed') return <span aria-label="Ошибка отправки">!</span>;
  return <Check size={15} aria-label={status === 'queued' ? 'В очереди' : 'Отправлено'} />;
}

function ChatWindow({ chat, text, setText, onSend, sending, onBack }: {
  chat: Chat;
  text: string;
  setText: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  onBack: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.chatId, chat.messages.length]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <section className="conversation" aria-label={`Чат с ${chat.name}`}>
      <header className="conversation-header">
        <button className="icon-button back-button" type="button" onClick={onBack} aria-label="К списку чатов"><ArrowLeft size={21} /></button>
        <span className="avatar avatar--header">{chat.phoneNumber.slice(-2)}</span>
        <div className="conversation-person"><strong>{chat.name}</strong><span>MAX · личный чат</span></div>
        <span className="conversation-meta"><Wifi size={15} /> На связи</span>
      </header>
      <div className="messages" role="log" aria-label="Сообщения" aria-live="polite">
        {chat.messages.length === 0 ? (
          <div className="empty-chat">
            <span className="empty-chat-icon"><MessageCircle size={27} strokeWidth={1.8} /></span>
            <h3>Начните разговор</h3>
            <p>Напишите первое сообщение для {chat.name}. Ответ появится здесь автоматически.</p>
          </div>
        ) : (
          <div className="message-list">
            <div className="day-divider"><span>Переписка</span></div>
            {chat.messages.map((message) => (
              <div className={`message-row message-row--${message.direction}`} key={`${message.direction}-${message.id}`}>
                <div className={`message-bubble message-bubble--${message.direction}`}>
                  <span className="message-text">{message.text}</span>
                  <span className="message-footer"><time dateTime={new Date(message.timestamp).toISOString()}>{formatTime(message.timestamp)}</time>{message.direction === 'outgoing' && <StatusIcon status={message.status} />}</span>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <div className="composer-wrap">
        <div className="composer">
          <textarea aria-label="Текст сообщения" placeholder="Написать сообщение..." value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} rows={1} maxLength={4000} />
          <button className="send-button" type="button" onClick={onSend} disabled={sending || !text.trim()} aria-label="Отправить сообщение">
            {sending ? <LoaderCircle size={20} className="spin" /> : <Send size={20} fill="currentColor" strokeWidth={1.8} />}
          </button>
        </div>
        <span className="composer-hint">Enter — отправить · Shift + Enter — новая строка</span>
      </div>
    </section>
  );
}

function NewChatDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (phone: string) => Promise<void> }) {
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    try { await onCreate(phone); } catch (reason) { setError(displayError(reason)); }
    finally { setPending(false); }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
        <button className="icon-button dialog-close" type="button" aria-label="Закрыть" onClick={onClose}><X size={20} /></button>
        <span className="dialog-symbol"><MessageCircle size={23} /></span>
        <h2 id="new-chat-title">Новый чат</h2>
        <p>Введите номер человека, с которым хотите начать переписку в MAX.</p>
        <form onSubmit={submit}>
          <label className="field"><span>Номер телефона</span><input ref={inputRef} type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 123-45-67" required /><small>Поддерживаются номера России и Беларуси</small></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button dialog-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle size={18} className="spin" /> Проверяем номер...</> : <>Создать чат <ArrowRight size={18} /></>}</button>
        </form>
      </section>
    </div>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [mobileConversation, setMobileConversation] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let mounted = true;
    api.snapshot().then((data) => { if (mounted) setSnapshot(data); }).catch((error) => { if (mounted) setToast(displayError(error)); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!snapshot.connected) return;
    let active = true;
    let busy = false;
    const refresh = async () => {
      if (!active || busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const next = await api.snapshot();
        if (active) setSnapshot(next);
      } catch (error) {
        if (active) setToast(displayError(error));
      } finally { busy = false; }
    };
    const timer = window.setInterval(refresh, 2500);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [snapshot.connected]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function createChat(phone: string) {
    const chat = await api.createChat(phone);
    setSnapshot(await api.snapshot());
    setSelectedChatId(chat.chatId);
    setNewChatOpen(false);
    setMobileConversation(true);
    setText('');
  }

  async function send() {
    const chatId = selectedChatId;
    const message = text.trim();
    if (!chatId || !message || sending) return;
    setSending(true);
    try {
      await api.send(chatId, message);
      setText('');
      setSnapshot(await api.snapshot());
    } catch (error) {
      setToast(displayError(error));
    } finally { setSending(false); }
  }

  async function disconnect() {
    try { await api.disconnect(); } catch (error) { setToast(displayError(error)); return; }
    setSnapshot(emptySnapshot);
    setSelectedChatId(null);
    setMobileConversation(false);
    setText('');
  }

  if (loading) return <div className="boot-screen"><Mark /><LoaderCircle className="spin" size={22} /><span>Загружаем чат</span></div>;
  if (!snapshot.connected) return <ConnectScreen onConnected={(data) => { setSnapshot(data); setToast(''); }} />;

  const selected = snapshot.chats.find((chat) => chat.chatId === selectedChatId) ?? null;
  return (
    <main className={`app-shell ${mobileConversation ? 'app-shell--conversation' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand brand--app"><Mark small /><span>MAX<span className="brand-muted"> Chat</span></span></div>
          <button className="icon-button disconnect-button" type="button" onClick={disconnect} title="Отключиться" aria-label="Отключиться"><LogOut size={19} /></button>
        </div>
        <div className="sidebar-heading"><div><span className="sidebar-overline">Ваша переписка</span><h1>Сообщения</h1></div><button className="new-chat-button" type="button" onClick={() => setNewChatOpen(true)} aria-label="Новый чат"><Plus size={22} /></button></div>
        <div className="sidebar-list">
          {snapshot.chats.length === 0 ? (
            <div className="sidebar-empty"><span className="sidebar-empty-icon"><MessageCircle size={25} /></span><strong>Пока нет чатов</strong><p>Создайте первый чат, чтобы начать переписку.</p><button type="button" onClick={() => setNewChatOpen(true)}>Новый чат <ChevronRight size={16} /></button></div>
          ) : snapshot.chats.map((chat) => {
            const last = chat.messages.at(-1);
            return <button className={`chat-item ${selectedChatId === chat.chatId ? 'chat-item--active' : ''}`} key={chat.chatId} type="button" onClick={() => { setSelectedChatId(chat.chatId); setMobileConversation(true); setText(''); }}>
              <span className="avatar">{chat.phoneNumber.slice(-2)}</span>
              <span className="chat-item-main"><strong>{chat.name}</strong><span>{last ? last.text : 'Новый чат'}</span></span>
              {last && <time>{formatTime(last.timestamp)}</time>}
            </button>;
          })}
        </div>
        <div className="sidebar-bottom"><span className="connection-dot" /><span>Инстанс {snapshot.instanceId}</span><span className="connection-label">подключён</span></div>
      </aside>

      <div className="main-pane">
        {selected ? <ChatWindow chat={selected} text={text} setText={setText} onSend={send} sending={sending} onBack={() => setMobileConversation(false)} /> : (
          <div className="welcome-pane">
            <div className="welcome-art"><div className="welcome-art-inner"><Mark /></div><span className="welcome-art-circle welcome-art-circle--one" /><span className="welcome-art-circle welcome-art-circle--two" /></div>
            <h2>Общение начинается здесь</h2><p>Выберите чат слева или создайте новый, чтобы отправить сообщение в MAX.</p>
            <button className="welcome-button" type="button" onClick={() => setNewChatOpen(true)}><Plus size={18} /> Создать чат</button>
          </div>
        )}
      </div>
      {snapshot.syncError && <div className="sync-warning" role="status"><Link2 size={17} /> {snapshot.syncError}</div>}
      {toast && <div className="toast" role="alert">{toast}<button type="button" aria-label="Закрыть уведомление" onClick={() => setToast('')}><X size={16} /></button></div>}
      {newChatOpen && <NewChatDialog onClose={() => setNewChatOpen(false)} onCreate={createChat} />}
    </main>
  );
}
