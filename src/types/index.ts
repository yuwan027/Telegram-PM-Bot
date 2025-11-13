// Telegram API Types
export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// Environment Configuration
export interface BotConfig {
  BOT_TOKEN: string;
  BOT_SECRET: string;
  ADMIN_UID: string;
  ADMIN_UIDS: string[];
  CAPTCHA_MODE: 'image' | 'quiz';
  CAPTCHA_ENABLED: boolean;
  CAPTCHA_TIMEOUT: number;
  CAPTCHA_MAX_ATTEMPTS: number;
  WELCOME_MESSAGE: string;
  QUIZ_QUESTIONS: QuizQuestion[] | null;
}

// CAPTCHA Types
export interface CaptchaSession {
  chatId: number;
  answer: string;
  attempts: number;
  createdAt: number;
  type: 'image' | 'quiz';
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface VerificationStatus {
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  status: 'pending' | 'failed' | 'verified';
  timestamp: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

// Cloudflare Worker Environment
export interface Env {
  PMBOT_KV: KVNamespace;
  ENV_BOT_TOKEN: string;
  ENV_BOT_SECRET: string;
  ENV_ADMIN_UID: string;
  CAPTCHA_MODE?: string;
  CAPTCHA_ENABLED?: string;
  CAPTCHA_TIMEOUT?: string;
  CAPTCHA_MAX_ATTEMPTS?: string;
  WELCOME_MESSAGE?: string;
  QUIZ_QUESTIONS?: string;
}
