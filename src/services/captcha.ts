import type { CaptchaSession, QuizQuestion, InlineKeyboardMarkup } from '../types';
import { TelegramAPI } from '../utils/telegram';

export class CaptchaService {
  private kv: KVNamespace;
  private telegram: TelegramAPI;
  private mode: 'image' | 'quiz';
  private timeout: number;
  private maxAttempts: number;
  private customQuestions: QuizQuestion[] | null;

  constructor(
    kv: KVNamespace,
    telegram: TelegramAPI,
    mode: 'image' | 'quiz',
    timeout: number,
    maxAttempts: number,
    customQuestions?: QuizQuestion[] | null
  ) {
    this.kv = kv;
    this.telegram = telegram;
    this.mode = mode;
    this.timeout = timeout;
    this.maxAttempts = maxAttempts;
    this.customQuestions = customQuestions || null;
  }

  // Generate random string for image CAPTCHA
  private generateCaptchaText(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Generate image CAPTCHA - returns image URL
  private async generateCaptchaImage(text: string): Promise<string> {
    // Use an image placeholder service that returns real PNG
    // dummyimage.com supports dynamic text generation
    const width = 300;
    const height = 100;

    // Random background color (light colors)
    const bgColor = Math.floor(Math.random() * 0xCCCCCC + 0x333333).toString(16).padStart(6, '0');
    // Random text color (dark colors for contrast)
    const textColor = Math.floor(Math.random() * 0x666666).toString(16).padStart(6, '0');

    // Build URL with text
    const url = `https://dummyimage.com/${width}x${height}/${bgColor}/${textColor}.png&text=${encodeURIComponent(text)}`;

    return url;
  }

  // Default quiz questions pool
  private getDefaultQuestions(): QuizQuestion[] {
    return [
      {
        question: '请选择正确的答案：2 + 3 = ?',
        options: ['3', '5', '7', '8'],
        correctAnswer: 1,
      },
      {
        question: '下列哪个是动物？',
        options: ['🌵 仙人掌', '🐱 猫', '🌸 花', '🌲 树'],
        correctAnswer: 1,
      },
      {
        question: '哪个是水果？',
        options: ['🍕 披萨', '🍔 汉堡', '🍎 苹果', '🍰 蛋糕'],
        correctAnswer: 2,
      },
      {
        question: '请选择：5 × 2 = ?',
        options: ['8', '10', '12', '15'],
        correctAnswer: 1,
      },
      {
        question: '下列哪个是交通工具？',
        options: ['🏠 房子', '🚗 汽车', '📱 手机', '📚 书'],
        correctAnswer: 1,
      },
      {
        question: '哪个数字最大？',
        options: ['5', '15', '25', '35'],
        correctAnswer: 3,
      },
      {
        question: '下列哪个表示颜色红色？',
        options: ['🔵 Blue', '🔴 Red', '🟢 Green', '🟡 Yellow'],
        correctAnswer: 1,
      },
    ];
  }

  // Get random quiz question (use custom or default)
  private getRandomQuizQuestion(): QuizQuestion {
    const questions = this.customQuestions && this.customQuestions.length > 0
      ? this.customQuestions
      : this.getDefaultQuestions();

    return questions[Math.floor(Math.random() * questions.length)];
  }

  // Send image CAPTCHA
  private async sendImageCaptcha(chatId: number, username?: string, firstName?: string, lastName?: string): Promise<void> {
    console.log('[Image CAPTCHA] Starting to send image captcha to', chatId);
    const captchaText = this.generateCaptchaText();
    console.log('[Image CAPTCHA] Generated text:', captchaText);

    const imageUrl = await this.generateCaptchaImage(captchaText);
    console.log('[Image CAPTCHA] Generated image URL:', imageUrl);

    // Store session
    const session: CaptchaSession = {
      chatId,
      answer: captchaText,
      attempts: 0,
      createdAt: Date.now(),
      type: 'image',
      username,
      firstName,
      lastName,
    };

    await this.kv.put(`captcha-${chatId}`, JSON.stringify(session), {
      expirationTtl: this.timeout / 1000,
    });
    console.log('[Image CAPTCHA] Session stored in KV');

    console.log('[Image CAPTCHA] Sending photo to Telegram...');
    const result = await this.telegram.sendPhoto({
      chat_id: chatId,
      photo: imageUrl,
      caption: `🔐 验证码验证\n\n请输入图片中的字符（不区分大小写）\n\n⏱ ${this.timeout / 1000}秒内有效\n📝 剩余尝试次数: ${this.maxAttempts}`,
    });
    console.log('[Image CAPTCHA] Telegram API response:', JSON.stringify(result));
  }

  // Send quiz CAPTCHA
  private async sendQuizCaptcha(chatId: number, username?: string, firstName?: string, lastName?: string): Promise<void> {
    const quiz = this.getRandomQuizQuestion();

    // Store session
    const session: CaptchaSession = {
      chatId,
      answer: quiz.correctAnswer.toString(),
      attempts: 0,
      createdAt: Date.now(),
      type: 'quiz',
      username,
      firstName,
      lastName,
    };

    await this.kv.put(`captcha-${chatId}`, JSON.stringify(session), {
      expirationTtl: this.timeout / 1000,
    });

    // Create inline keyboard
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: quiz.options.map((option, index) => [
        {
          text: option,
          callback_data: `captcha_answer_${index}`,
        },
      ]),
    };

    await this.telegram.sendMessage({
      chat_id: chatId,
      text: `🔐 验证码验证\n\n${quiz.question}\n\n⏱ ${this.timeout / 1000}秒内有效\n📝 剩余尝试次数: ${this.maxAttempts}`,
      reply_markup: keyboard,
    });
  }

  // Send CAPTCHA based on mode
  async sendCaptcha(chatId: number, username?: string, firstName?: string, lastName?: string): Promise<void> {
    if (this.mode === 'image') {
      await this.sendImageCaptcha(chatId, username, firstName, lastName);
    } else {
      await this.sendQuizCaptcha(chatId, username, firstName, lastName);
    }
  }

  // Verify CAPTCHA answer
  async verifyCaptcha(chatId: number, answer: string): Promise<boolean> {
    const sessionData = await this.kv.get(`captcha-${chatId}`, { type: 'text' });

    if (!sessionData) {
      return false;
    }

    const session: CaptchaSession = JSON.parse(sessionData);

    // Check if expired
    if (Date.now() - session.createdAt > this.timeout) {
      await this.kv.delete(`captcha-${chatId}`);
      return false;
    }

    // Increment attempts
    session.attempts++;

    // Check answer
    const isCorrect = session.type === 'image'
      ? answer.toUpperCase() === session.answer.toUpperCase()
      : answer === session.answer;

    if (isCorrect) {
      // Mark as verified
      await this.kv.put(`captcha-verified-${chatId}`, 'true');
      await this.kv.delete(`captcha-${chatId}`);
      return true;
    }

    // Check max attempts
    if (session.attempts >= this.maxAttempts) {
      await this.kv.delete(`captcha-${chatId}`);
      await this.telegram.sendMessage({
        chat_id: chatId,
        text: '❌ 验证失败次数过多，请稍后重试。',
      });
      return false;
    }

    // Update session
    await this.kv.put(`captcha-${chatId}`, JSON.stringify(session), {
      expirationTtl: this.timeout / 1000,
    });

    await this.telegram.sendMessage({
      chat_id: chatId,
      text: `❌ 答案错误，请重试。\n📝 剩余尝试次数: ${this.maxAttempts - session.attempts}`,
    });

    return false;
  }

  // Check if user is verified
  async isVerified(chatId: number): Promise<boolean> {
    const verified = await this.kv.get(`captcha-verified-${chatId}`, { type: 'text' });
    return verified === 'true';
  }

  // Check if CAPTCHA session exists
  async hasActiveSession(chatId: number): Promise<boolean> {
    const session = await this.kv.get(`captcha-${chatId}`, { type: 'text' });
    return session !== null;
  }
}
