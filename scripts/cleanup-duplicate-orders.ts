import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  // Merge the 4 duplicate rows for chat_id 6768990119 into one.
  await pool.query(
    `UPDATE orders SET customer_name=$1, phone=$2, address=$3, product_note=$4
     WHERE id='ord_0d8ef7ed-4944-47e3-901f-8ac9715b88b3'`,
    ['အေးမွန်', '09452399906', 'သရက်မြို့', 'မျက်မှန်']
  );
  await pool.query(
    `DELETE FROM orders WHERE id IN ($1,$2,$3)`,
    ['ord_4fc722b1-5fa9-4987-9c38-138d360792c5', 'ord_291493eb-24a3-435f-8307-2a107dca89dc', 'ord_309a145d-6a91-46a6-a0b1-f274a17e1d7d']
  );
  console.log('Cleaned up duplicate order rows.');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
