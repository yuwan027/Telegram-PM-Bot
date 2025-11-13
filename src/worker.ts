import type { Env, TelegramUpdate, TelegramMessage, TelegramCallbackQuery, CaptchaSession } from './types';
import { getConfig, WEBHOOK_PATH } from './config';
import { TelegramAPI } from './utils/telegram';
import { CaptchaService } from './services/captcha';
import { showPendingVerifications, showFailedVerifications, approveUser, rejectUser, blockUserDirect } from './verification';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Debug route to check webhook status
    if (url.pathname === '/webhook-info') {
      return getWebhookStatus(env);
    }

    // Check and auto-register webhook if needed
    ctx.waitUntil(ensureWebhookRegistered(request, env));

    if (url.pathname === WEBHOOK_PATH) {
      return handleWebhook(request, env);
    } else {
      return new Response('Telegram PM Bot is running', { status: 200 });
    }
  },
};

/**
 * Handle webhook requests
 */
async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const config = getConfig(env);

  // Check secret
  const receivedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  console.log('Received secret:', receivedSecret);
  console.log('Expected secret:', config.BOT_SECRET);

  if (receivedSecret !== config.BOT_SECRET) {
    console.log('Secret mismatch!');
    return new Response('Unauthorized', { status: 403 });
  }

  // Read request body
  const update: TelegramUpdate = await request.json();

  // Handle update asynchronously
  // Note: In Cloudflare Workers, we can't use waitUntil, so we handle it directly
  await onUpdate(update, env);

  return new Response('Ok');
}

/**
 * Handle incoming update
 */
async function onUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  if (update.message) {
    await onMessage(update.message, env);
  } else if (update.callback_query) {
    await onCallbackQuery(update.callback_query, env);
  }
}

/**
 * Handle callback query (for quiz CAPTCHA buttons)
 */
async function onCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env): Promise<void> {
  const config = getConfig(env);
  const telegram = new TelegramAPI(config.BOT_TOKEN);
  const captcha = new CaptchaService(
    env.PMBOT_KV,
    telegram,
    config.CAPTCHA_MODE,
    config.CAPTCHA_TIMEOUT,
    config.CAPTCHA_MAX_ATTEMPTS,
    config.QUIZ_QUESTIONS
  );

  const chatId = callbackQuery.from.id;
  const data = callbackQuery.data || '';

  // Handle admin actions
  if (config.ADMIN_UIDS.includes(chatId.toString())) {
    if (data.startsWith('approve_')) {
      const targetId = parseInt(data.replace('approve_', ''));
      await approveUser(targetId, env, telegram, chatId.toString());
      await telegram.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: '✅ 已通过',
      });
      return;
    }

    if (data.startsWith('reject_')) {
      const targetId = parseInt(data.replace('reject_', ''));
      await rejectUser(targetId, env, telegram, chatId.toString());
      await telegram.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: '❌ 已拒绝',
      });
      return;
    }

    if (data.startsWith('block_')) {
      const targetId = parseInt(data.replace('block_', ''));
      await blockUserDirect(targetId, env, telegram, chatId.toString());
      await telegram.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: '🚫 已拉黑',
      });
      return;
    }
  }

  // Handle CAPTCHA answer
  if (data.startsWith('captcha_answer_')) {
    const answer = data.replace('captcha_answer_', '');
    const isVerified = await captcha.verifyCaptcha(chatId, answer);

    if (isVerified) {
      await telegram.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: '✅ 验证成功！',
        show_alert: true,
      });

      await telegram.sendMessage({
        chat_id: chatId,
        text: '✅ 验证成功！您现在可以发送消息了。',
      });
    } else {
      await telegram.answerCallbackQuery({
        callback_query_id: callbackQuery.id,
        text: '❌ 答案错误',
        show_alert: false,
      });
    }
  }
}

/**
 * Handle incoming message
 */
async function onMessage(message: TelegramMessage, env: Env): Promise<void> {
  const config = getConfig(env);
  const telegram = new TelegramAPI(config.BOT_TOKEN);

  // Handle /start command
  if (message.text === '/start') {
    console.log('[/start] Received /start from user:', message.chat.id);
    await telegram.sendMessage({
      chat_id: message.chat.id,
      text: config.WELCOME_MESSAGE,
    });
    console.log('[/start] Welcome message sent');

    // Send CAPTCHA if enabled and not admin
    console.log('[/start] CAPTCHA_ENABLED:', config.CAPTCHA_ENABLED);
    console.log('[/start] CAPTCHA_MODE:', config.CAPTCHA_MODE);
    console.log('[/start] User ID:', message.chat.id.toString(), 'Admin ID:', config.ADMIN_UID);

    if (config.CAPTCHA_ENABLED && message.chat.id.toString() !== config.ADMIN_UID) {
      console.log('[/start] Creating CAPTCHA service...');
      const captcha = new CaptchaService(
        env.PMBOT_KV,
        telegram,
        config.CAPTCHA_MODE,
        config.CAPTCHA_TIMEOUT,
        config.CAPTCHA_MAX_ATTEMPTS,
        config.QUIZ_QUESTIONS
      );

      const isVerified = await captcha.isVerified(message.chat.id);
      console.log('[/start] Is user verified?', isVerified);

      if (!isVerified) {
        console.log('[/start] Sending CAPTCHA...');
        await captcha.sendCaptcha(
          message.chat.id,
          message.from?.username,
          message.from?.first_name,
          message.from?.last_name
        );
        console.log('[/start] CAPTCHA sent');
      }
    }
    return;
  }

  // Admin commands
  if (config.ADMIN_UIDS.includes(message.chat.id.toString())) {
    await handleAdminMessage(message, env, telegram);
    return;
  }

  // Guest messages
  await handleGuestMessage(message, env, telegram);
}

/**
 * Handle admin messages
 */
async function handleAdminMessage(
  message: TelegramMessage,
  env: Env,
  telegram: TelegramAPI
): Promise<void> {
  const config = getConfig(env);
  const adminId = message.chat.id.toString();

  // Handle commands without reply
  if (!message.reply_to_message) {
    if (message.text === '/pending') {
      await showPendingVerifications(env, telegram, adminId);
      return;
    }

    if (message.text === '/failed') {
      await showFailedVerifications(env, telegram, adminId);
      return;
    }

    await telegram.sendMessage({
      chat_id: adminId,
      text: '使用方法：\n\n回复转发的消息并发送文字 - 回复用户\n\n命令：\n/block - 屏蔽用户\n/unblock - 解除屏蔽\n/checkblock - 检查屏蔽状态\n/pending - 查看验证中的用户\n/failed - 查看验证失败的用户',
    });
    return;
  }

  if (message.text === '/block') {
    await handleBlock(message, env, telegram, adminId);
    return;
  }

  if (message.text === '/unblock') {
    await handleUnBlock(message, env, telegram, adminId);
    return;
  }

  if (message.text === '/checkblock') {
    await checkBlock(message, env, telegram, adminId);
    return;
  }

  // Reply to guest
  const guestChatId = await env.PMBOT_KV.get(`msg-map-${message.reply_to_message.message_id}`, {
    type: 'json',
  });

  if (guestChatId) {
    await telegram.copyMessage({
      chat_id: guestChatId as number,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
    });
  }
}

/**
 * Handle guest messages
 */
async function handleGuestMessage(
  message: TelegramMessage,
  env: Env,
  telegram: TelegramAPI
): Promise<void> {
  const config = getConfig(env);
  const chatId = message.chat.id;

  // Check CAPTCHA verification
  if (config.CAPTCHA_ENABLED) {
    const captcha = new CaptchaService(
      env.PMBOT_KV,
      telegram,
      config.CAPTCHA_MODE,
      config.CAPTCHA_TIMEOUT,
      config.CAPTCHA_MAX_ATTEMPTS,
      config.QUIZ_QUESTIONS
    );

    const isVerified = await captcha.isVerified(chatId);
    const hasActiveSession = await captcha.hasActiveSession(chatId);

    if (!isVerified) {
      // If there's an active session and user sent text, try to verify
      if (hasActiveSession && message.text) {
        const verified = await captcha.verifyCaptcha(chatId, message.text);
        if (verified) {
          await telegram.sendMessage({
            chat_id: chatId,
            text: '✅ 验证成功！您现在可以发送消息了。',
          });
        }
        return;
      }

      // No active session, prompt user to use /start
      if (!hasActiveSession) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: '⚠️ 您尚未验证身份。\n\n请先发送 /start 命令开始验证流程。',
        });
      }
      return;
    }
  }

  // Check if blocked
  const isBlocked = await env.PMBOT_KV.get(`isblocked-${chatId}`, { type: 'json' });

  if (isBlocked) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: 'You are blocked',
    });
    return;
  }

  // Forward message to all admins
  for (const adminUid of config.ADMIN_UIDS) {
    const forwardReq = await telegram.forwardMessage({
      chat_id: adminUid,
      from_chat_id: chatId,
      message_id: message.message_id,
    });

    console.log(JSON.stringify(forwardReq));

    if (forwardReq.ok && forwardReq.result) {
      await env.PMBOT_KV.put(`msg-map-${forwardReq.result.message_id}`, chatId.toString());
    }
  }
}

/**
 * Block user
 */
async function handleBlock(
  message: TelegramMessage,
  env: Env,
  telegram: TelegramAPI,
  adminUid: string
): Promise<void> {
  if (!message.reply_to_message) return;

  const guestChatId = await env.PMBOT_KV.get(`msg-map-${message.reply_to_message.message_id}`, {
    type: 'json',
  });

  if (!guestChatId) return;

  if (guestChatId === adminUid) {
    await telegram.sendMessage({
      chat_id: adminUid,
      text: '不能屏蔽自己',
    });
    return;
  }

  await env.PMBOT_KV.put(`isblocked-${guestChatId}`, 'true');

  await telegram.sendMessage({
    chat_id: adminUid,
    text: `UID:${guestChatId}屏蔽成功`,
  });
}

/**
 * Unblock user
 */
async function handleUnBlock(
  message: TelegramMessage,
  env: Env,
  telegram: TelegramAPI,
  adminUid: string
): Promise<void> {
  if (!message.reply_to_message) return;

  const guestChatId = await env.PMBOT_KV.get(`msg-map-${message.reply_to_message.message_id}`, {
    type: 'json',
  });

  if (!guestChatId) return;

  await env.PMBOT_KV.put(`isblocked-${guestChatId}`, 'false');

  await telegram.sendMessage({
    chat_id: adminUid,
    text: `UID:${guestChatId}解除屏蔽成功`,
  });
}

/**
 * Check block status
 */
async function checkBlock(
  message: TelegramMessage,
  env: Env,
  telegram: TelegramAPI,
  adminUid: string
): Promise<void> {
  if (!message.reply_to_message) return;

  const guestChatId = await env.PMBOT_KV.get(`msg-map-${message.reply_to_message.message_id}`, {
    type: 'json',
  });

  if (!guestChatId) return;

  const blocked = await env.PMBOT_KV.get(`isblocked-${guestChatId}`, { type: 'json' });

  await telegram.sendMessage({
    chat_id: adminUid,
    text: `UID:${guestChatId}` + (blocked === 'true' ? '被屏蔽' : '没有被屏蔽'),
  });
}

/**
 * Get webhook status
 */
async function getWebhookStatus(env: Env): Promise<Response> {
  const config = getConfig(env);
  const telegram = new TelegramAPI(config.BOT_TOKEN);
  const info = await telegram.getWebhookInfo();
  return new Response(JSON.stringify(info, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Ensure webhook is registered correctly
 */
async function ensureWebhookRegistered(request: Request, env: Env): Promise<void> {
  try {
    const config = getConfig(env);
    const url = new URL(request.url);
    const telegram = new TelegramAPI(config.BOT_TOKEN);

    // Check current webhook status
    const info = await telegram.getWebhookInfo();
    const expectedUrl = `${url.protocol}//${url.hostname}${WEBHOOK_PATH}`;

    // Only register if webhook is not set or URL is different
    if (!info.result || info.result.url !== expectedUrl) {
      console.log('Registering webhook:', expectedUrl);
      const result = await telegram.setWebhook(expectedUrl, config.BOT_SECRET);
      console.log('Webhook registration result:', result);
    }
  } catch (error) {
    console.error('Failed to ensure webhook:', error);
  }
}

