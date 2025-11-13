import type { Env, VerificationStatus, CaptchaSession, InlineKeyboardMarkup } from './types';
import { TelegramAPI } from './utils/telegram';

/**
 * Show pending verifications
 */
export async function showPendingVerifications(env: Env, telegram: TelegramAPI, adminId: string): Promise<void> {
  const keys = await env.PMBOT_KV.list({ prefix: 'captcha-' });

  if (keys.keys.length === 0) {
    await telegram.sendMessage({
      chat_id: adminId,
      text: '📋 当前没有正在验证的用户',
    });
    return;
  }

  let message = '📋 验证中的用户：\n\n';
  const buttons: { text: string; callback_data: string }[][] = [];

  for (const key of keys.keys) {
    const sessionData = await env.PMBOT_KV.get(key.name, { type: 'text' });
    if (sessionData) {
      const session: CaptchaSession = JSON.parse(sessionData);
      const displayName = session.firstName || session.username || `用户${session.chatId}`;
      const username = session.username ? `@${session.username}` : '无用户名';
      const timeAgo = Math.floor((Date.now() - session.createdAt) / 1000 / 60);

      message += `👤 ${displayName} (${username})\n`;
      message += `   ID: \`${session.chatId}\`\n`;
      message += `   尝试: ${session.attempts}/3\n`;
      message += `   时间: ${timeAgo}分钟前\n\n`;

      buttons.push([
        { text: `✅ 通过 ${displayName}`, callback_data: `approve_${session.chatId}` },
        { text: `❌ 拒绝`, callback_data: `reject_${session.chatId}` },
      ]);
    }
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: buttons.slice(0, 10),
  };

  await telegram.sendMessage({
    chat_id: adminId,
    text: message,
    reply_markup: keyboard,
    parse_mode: 'Markdown',
  });
}

/**
 * Show failed verifications
 */
export async function showFailedVerifications(env: Env, telegram: TelegramAPI, adminId: string): Promise<void> {
  const keys = await env.PMBOT_KV.list({ prefix: 'failed-verification-' });

  if (keys.keys.length === 0) {
    await telegram.sendMessage({
      chat_id: adminId,
      text: '📋 当前没有验证失败的用户',
    });
    return;
  }

  let message = '📋 验证失败的用户：\n\n';
  const buttons: { text: string; callback_data: string }[][] = [];

  for (const key of keys.keys) {
    const statusData = await env.PMBOT_KV.get(key.name, { type: 'text' });
    if (statusData) {
      const status: VerificationStatus = JSON.parse(statusData);
      const displayName = status.firstName || status.username || `用户${status.chatId}`;
      const username = status.username ? `@${status.username}` : '无用户名';
      const timeAgo = Math.floor((Date.now() - status.timestamp) / 1000 / 60);

      message += `👤 ${displayName} (${username})\n`;
      message += `   ID: \`${status.chatId}\`\n`;
      message += `   时间: ${timeAgo}分钟前\n\n`;

      buttons.push([
        { text: `✅ 通过 ${displayName}`, callback_data: `approve_${status.chatId}` },
        { text: `🚫 拉黑`, callback_data: `block_${status.chatId}` },
      ]);
    }
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: buttons.slice(0, 10),
  };

  await telegram.sendMessage({
    chat_id: adminId,
    text: message,
    reply_markup: keyboard,
    parse_mode: 'Markdown',
  });
}

/**
 * Approve user manually
 */
export async function approveUser(chatId: number, env: Env, telegram: TelegramAPI, adminId: string): Promise<void> {
  // Mark as verified
  await env.PMBOT_KV.put(`captcha-verified-${chatId}`, 'true');

  // Remove from pending/failed
  await env.PMBOT_KV.delete(`captcha-${chatId}`);
  await env.PMBOT_KV.delete(`failed-verification-${chatId}`);

  // Notify user
  await telegram.sendMessage({
    chat_id: chatId,
    text: '✅ 您已通过管理员审核，现在可以发送消息了！',
  });

  // Notify admin
  await telegram.sendMessage({
    chat_id: adminId,
    text: `✅ 已通过用户 ${chatId} 的验证`,
  });
}

/**
 * Reject user
 */
export async function rejectUser(chatId: number, env: Env, telegram: TelegramAPI, adminId: string): Promise<void> {
  // Remove from pending
  await env.PMBOT_KV.delete(`captcha-${chatId}`);

  // Mark as failed
  const failedStatus: VerificationStatus = {
    chatId,
    status: 'failed',
    timestamp: Date.now(),
  };
  await env.PMBOT_KV.put(`failed-verification-${chatId}`, JSON.stringify(failedStatus));

  // Notify admin
  await telegram.sendMessage({
    chat_id: adminId,
    text: `❌ 已拒绝用户 ${chatId} 的验证`,
  });
}

/**
 * Block user directly
 */
export async function blockUserDirect(chatId: number, env: Env, telegram: TelegramAPI, adminId: string): Promise<void> {
  await env.PMBOT_KV.put(`isblocked-${chatId}`, 'true');
  await env.PMBOT_KV.delete(`captcha-${chatId}`);
  await env.PMBOT_KV.delete(`failed-verification-${chatId}`);

  await telegram.sendMessage({
    chat_id: adminId,
    text: `🚫 已拉黑用户 ${chatId}`,
  });
}
