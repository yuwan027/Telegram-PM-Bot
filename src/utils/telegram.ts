import type { TelegramResponse, InlineKeyboardMarkup } from '../types';

export class TelegramAPI {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private apiUrl(methodName: string, params: Record<string, string> | null = null): string {
    let query = '';
    if (params) {
      query = '?' + new URLSearchParams(params).toString();
    }
    return `https://api.telegram.org/bot${this.token}/${methodName}${query}`;
  }

  private async requestTelegram(
    methodName: string,
    body: RequestInit,
    params: Record<string, string> | null = null
  ): Promise<TelegramResponse> {
    const response = await fetch(this.apiUrl(methodName, params), body);
    return response.json();
  }

  private makeReqBody(body: any): RequestInit {
    return {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    };
  }

  async sendMessage(params: {
    chat_id: number | string;
    text: string;
    reply_markup?: InlineKeyboardMarkup;
    parse_mode?: string;
  }): Promise<TelegramResponse> {
    return this.requestTelegram('sendMessage', this.makeReqBody(params));
  }

  async copyMessage(params: {
    chat_id: number | string;
    from_chat_id: number | string;
    message_id: number;
  }): Promise<TelegramResponse> {
    return this.requestTelegram('copyMessage', this.makeReqBody(params));
  }

  async forwardMessage(params: {
    chat_id: number | string;
    from_chat_id: number | string;
    message_id: number;
  }): Promise<TelegramResponse> {
    return this.requestTelegram('forwardMessage', this.makeReqBody(params));
  }

  async sendPhoto(params: {
    chat_id: number | string;
    photo: string;
    caption?: string;
    reply_markup?: InlineKeyboardMarkup;
  }): Promise<TelegramResponse> {
    return this.requestTelegram('sendPhoto', this.makeReqBody(params));
  }

  async answerCallbackQuery(params: {
    callback_query_id: string;
    text?: string;
    show_alert?: boolean;
  }): Promise<TelegramResponse> {
    return this.requestTelegram('answerCallbackQuery', this.makeReqBody(params));
  }

  async deleteMessage(params: {
    chat_id: number | string;
    message_id: number;
  }): Promise<TelegramResponse> {
    return this.requestTelegram('deleteMessage', this.makeReqBody(params));
  }

  async setWebhook(webhookUrl: string, secretToken: string): Promise<TelegramResponse> {
    const response = await fetch(this.apiUrl('setWebhook'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
      }),
    });
    return response.json();
  }

  async deleteWebhook(): Promise<TelegramResponse> {
    return this.requestTelegram('deleteWebhook', this.makeReqBody({}));
  }

  async getWebhookInfo(): Promise<TelegramResponse> {
    const response = await fetch(this.apiUrl('getWebhookInfo'));
    return response.json();
  }
}
