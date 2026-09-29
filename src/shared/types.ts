export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ChatMessage {
  id: string;
  chatId: string;
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
  status?: MessageStatus;
}

export interface Chat {
  chatId: string;
  phoneNumber: string;
  name: string;
  createdAt: number;
  messages: ChatMessage[];
}

export interface Snapshot {
  connected: boolean;
  instanceId?: string;
  state?: string;
  chats: Chat[];
  syncError?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}
