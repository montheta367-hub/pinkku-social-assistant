-- Orders extracted from customer messages (Telegram/Facebook) when they
-- include name/phone/address — detected by AI alongside the normal
-- auto-reply pipeline, so the business owner doesn't have to scroll back
-- through chat history to find fulfillment details. See detectOrderInMessage
-- in app.ts.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  customer_chat_id TEXT,
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  product_note TEXT,
  source_message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
