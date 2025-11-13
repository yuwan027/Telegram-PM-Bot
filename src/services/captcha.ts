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

  // Generate image CAPTCHA using Canvas API
  private async generateCaptchaImage(text: string): Promise<string> {
    // For Cloudflare Workers, we'll use a simple base64 encoded SVG image
    // This is a lightweight alternative to Canvas that works in Workers
    const width = 200;
    const height = 60;

    // Add some randomization for security
    const fontSize = 30 + Math.random() * 10;
    const rotation = -10 + Math.random() * 20;
    const x = 20 + Math.random() * 20;
    const y = 35 + Math.random() * 10;

    // Generate random background color
    const bgColor = `rgb(${200 + Math.random() * 55}, ${200 + Math.random() * 55}, ${200 + Math.random() * 55})`;

    // Generate random text color
    const textColor = `rgb(${Math.random() * 100}, ${Math.random() * 100}, ${Math.random() * 100})`;

    // Add random lines for noise
    let noiseLines = '';
    for (let i = 0; i < 5; i++) {
      const x1 = Math.random() * width;
      const y1 = Math.random() * height;
      const x2 = Math.random() * width;
      const y2 = Math.random() * height;
      const lineColor = `rgb(${Math.random() * 255}, ${Math.random() * 255}, ${Math.random() * 255})`;
      noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineColor}" stroke-width="1" opacity="0.3"/>`;
    }

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${bgColor}"/>
        ${noiseLines}
        <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}"
              fill="${textColor}" font-weight="bold"
              transform="rotate(${rotation} ${x + 50} ${y})">
          ${text.split('').map((char, i) => {
            const charRotation = -5 + Math.random() * 10;
            const charX = x + i * 28;
            return `<tspan transform="rotate(${charRotation} ${charX} ${y})" x="${charX}">${char}</tspan>`;
          }).join('')}
        </text>
      </svg>
    `;

    // Convert SVG to base64
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
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
    const captchaText = this.generateCaptchaText();
    const imageData = await this.generateCaptchaImage(captchaText);

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

    await this.telegram.sendPhoto({
      chat_id: chatId,
      photo: imageData,
      caption: `🔐 验证码验证\n\n请输入图片中的字符（不区分大小写）\n\n⏱ ${this.timeout / 1000}秒内有效\n📝 剩余尝试次数: ${this.maxAttempts}`,
    });
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
