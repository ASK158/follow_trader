import Database from "better-sqlite3";
import { join, resolve } from "node:path";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("用法: npm run admin:promote -- admin@example.com");
  process.exit(1);
}
const dataDirectory = process.env.SIGNAL_DATA_DIR ? resolve(process.env.SIGNAL_DATA_DIR) : join(process.cwd(), ".signal-data");
const db = new Database(join(dataDirectory, "marketplace", "marketplace.db"));
const user = db.prepare("SELECT id, email_verified_at FROM developers WHERE lower(email) = ?").get(email);
if (!user) {
  console.error("用户不存在，请先完成注册和邮箱验证。");
  process.exit(1);
}
if (!user.email_verified_at) {
  console.error("邮箱尚未验证，拒绝授予管理员权限。");
  process.exit(1);
}
db.prepare("UPDATE developers SET role = 'admin', status = 'active', updated_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
console.log(`已将 ${email} 设为管理员。`);
db.close();
