// One-time setup: tells Telegram where to POST updates for this bot.
// Run after every deploy whose URL changed (e.g. first deploy, or moving off
// a Vercel preview URL onto the production domain):
//
//   node --env-file=.env scripts/set-telegram-webhook.ts https://your-app.vercel.app
//
// For local testing, point this at a public tunnel to localhost:3000
// (e.g. `cloudflared tunnel --url http://localhost:3000`) instead.

const [, , baseUrl] = process.argv;
if (!baseUrl) {
  console.error('Usage: node --env-file=.env scripts/set-telegram-webhook.ts <public-https-url>');
  process.exit(1);
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN is not set in .env');
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/+$/, '')}/api/telegram/webhook`;
const params = new URLSearchParams({ url: webhookUrl });

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (secret) {
  params.set('secret_token', secret);
} else {
  console.warn('TELEGRAM_WEBHOOK_SECRET is not set — the webhook will be registered without one, meaning anyone who finds the URL could POST fake Telegram updates to it. Recommended: set TELEGRAM_WEBHOOK_SECRET in .env and re-run this script.');
}

const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?${params.toString()}`);
const data = await res.json();

if (!data.ok) {
  console.error('Failed to set webhook:', data);
  process.exit(1);
}

console.log(`Webhook registered: ${webhookUrl}`);

export {};
