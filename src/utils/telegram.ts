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
    photo: string | Blob;
    caption?: string;
    reply_markup?: InlineKeyboardMarkup;
  }): Promise<TelegramResponse> {
    // If photo is a data URI (any image type), upload via multipart
    if (typeof params.photo === 'string' && params.photo.startsWith('data:image/')) {
      const formData = new FormData();
      formData.append('chat_id', params.chat_id.toString());

      // Extract MIME type and base64 data
      const matches = params.photo.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid data URI format');
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      // Decode base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create blob with correct MIME type
      const fileBlob = new Blob([bytes], { type: mimeType });

      // Determine file extension from MIME type
      const ext = mimeType.split('/')[1] || 'jpg';
      formData.append('photo', fileBlob, `photo.${ext}`);

      if (params.caption) {
        formData.append('caption', params.caption);
      }

      if (params.reply_markup) {
        formData.append('reply_markup', JSON.stringify(params.reply_markup));
      }

      const response = await fetch(this.apiUrl('sendPhoto'), {
        method: 'POST',
        body: formData,
      });

      return response.json();
    }

    // Otherwise use JSON (for URLs or file_ids)
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
