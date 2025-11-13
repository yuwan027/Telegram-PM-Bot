# Telegram PM Bot

基于 Cloudflare Workers 的 Telegram PM 机器人，支持 CAPTCHA 验证。

## 快速部署

### 1. 克隆项目
```bash
git clone https://github.com/yuwan027/Telegram-PM-Bot
cd Telegram-PM-Bot
npm install
```

### 2. 配置
```bash
cp wrangler.toml.example wrangler.toml
```

编辑 `wrangler.toml` 中的 `[vars]` 部分，填入：
- `ENV_BOT_TOKEN` - 从 [@BotFather](https://t.me/BotFather) 获取
- `ENV_BOT_SECRET` - 随机字符串（用于验证 Telegram webhook）
- `ENV_ADMIN_UID` - 从 [@username_to_id_bot](https://t.me/username_to_id_bot) 获取（支持多个，逗号分隔）

### 3. 部署
```bash
npx wrangler login
npm run setup
npm run deploy
```

部署完成后，Worker 会在首次接收请求时自动注册 Telegram webhook。

## 配置说明

所有配置都在 `wrangler.toml` 的 `[vars]` 部分：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ENV_BOT_TOKEN` | Bot Token | 必填 |
| `ENV_BOT_SECRET` | Webhook 密钥 | 必填 |
| `ENV_ADMIN_UID` | 管理员 ID（支持多个，逗号分隔） | 必填 |
| `CAPTCHA_MODE` | 验证码类型：`image` 或 `quiz` | `quiz` |
| `CAPTCHA_ENABLED` | 启用验证码 | `true` |
| `CAPTCHA_TIMEOUT` | 验证超时时间（毫秒） | `300000` |
| `CAPTCHA_MAX_ATTEMPTS` | 最大尝试次数 | `3` |
| `WELCOME_MESSAGE` | 欢迎消息 | `欢迎使用私聊机器人！完成验证后，您发送的消息才会被看到。` |
| `QUIZ_QUESTIONS` | 自定义问答题（JSON格式） | 见下方示例 |

### QUIZ_QUESTIONS 格式示例

```json
[
  {
    "question": "你是真人吗",
    "options": ["我不是真人🙅", "我是真人👨", "我是机器人🤖", "我是伪人👻"],
    "correctAnswer": 1
  }
]
```

注意：`correctAnswer` 是正确答案的索引（从 0 开始）

## 本地开发

```bash
npm run dev
```

本地开发时，Worker 会在首次接收请求时自动注册 webhook。你也可以直接向机器人发送消息来触发自动注册。

## 管理员命令

- `/pending` - 查看待验证用户（可通过/拒绝）
- `/failed` - 查看验证失败用户（可通过/拉黑）
- `/block` - 屏蔽用户（回复消息）
- `/unblock` - 解除屏蔽（回复消息）
- `/checkblock` - 检查用户屏蔽状态（回复消息）

## License

MIT
