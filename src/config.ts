import type { BotConfig, Env, QuizQuestion } from './types';

function parseQuizQuestions(jsonStr?: string): QuizQuestion[] | null {
  if (!jsonStr || jsonStr.trim() === '') {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as QuizQuestion[];
    }
    return null;
  } catch (e) {
    console.error('Failed to parse QUIZ_QUESTIONS:', e);
    return null;
  }
}

export function getConfig(env: Env): BotConfig {
  const adminUid = env.ENV_ADMIN_UID || '';
  const adminUids = adminUid.split(',').map(id => id.trim()).filter(id => id);

  return {
    BOT_TOKEN: env.ENV_BOT_TOKEN,
    BOT_SECRET: env.ENV_BOT_SECRET,
    ADMIN_UID: adminUid,
    ADMIN_UIDS: adminUids,
    CAPTCHA_MODE: (env.CAPTCHA_MODE as 'image' | 'quiz') || 'quiz',
    CAPTCHA_ENABLED: env.CAPTCHA_ENABLED === 'true' || true,
    CAPTCHA_TIMEOUT: parseInt(env.CAPTCHA_TIMEOUT || '300000'),
    CAPTCHA_MAX_ATTEMPTS: parseInt(env.CAPTCHA_MAX_ATTEMPTS || '3'),
    WELCOME_MESSAGE: env.WELCOME_MESSAGE || '欢迎使用本机器人',
    QUIZ_QUESTIONS: parseQuizQuestions(env.QUIZ_QUESTIONS),
  };
}

export const WEBHOOK_PATH = '/endpoint';
