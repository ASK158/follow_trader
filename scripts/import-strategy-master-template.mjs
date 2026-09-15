import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

if (existsSync(resolve(".env"))) process.loadEnvFile(resolve(".env"));

const dataDirectory = process.env.SIGNAL_DATA_DIR ?? join(process.cwd(), ".signal-data");
const databasePath = join(dataDirectory, "marketplace", "marketplace.db");
const db = new Database(databasePath);

const developer = db.prepare(`
  SELECT d.id, d.name
  FROM sessions s JOIN developers d ON d.id = s.developer_id
  WHERE s.expires_at > ?
  ORDER BY s.expires_at DESC
  LIMIT 1
`).get(Date.now());

if (!developer) {
  console.error("没有可用的开发者会话，请先登录本站开发者账户。");
  process.exitCode = 1;
  db.close();
} else {
  const id = "template-strategy-master-162";
  const now = new Date().toISOString();
  const description = [
    "<h2>产品定位</h2>",
    "<p><strong>策略大师 1.62 · 多策略配置模板</strong>是一套面向 MT4 策略研究的模块化配置框架。它把常见的入场、过滤、出场与资金管理思路拆分为可组合模块，方便使用者整理、比较并形成自己的策略方案。</p>",
    "<blockquote>本页面依据公开参考页面的产品定位重新整理为本站模拟模板，并非原作者软件、破解版本或安装包。</blockquote>",
    "<h2>模板结构</h2>",
    "<ul><li><strong>方向判断：</strong>规划趋势、震荡或多周期确认条件。</li><li><strong>信号触发：</strong>组合价格突破、均线关系、动量与时段条件。</li><li><strong>订单管理：</strong>定义单次开仓、分批处理、止盈止损与退出规则。</li><li><strong>风险控制：</strong>预留固定手数、风险比例、最大持仓和回撤保护参数。</li><li><strong>验证记录：</strong>记录品种、周期、点差环境、样本区间与测试结果。</li></ul>",
    "<h2>适用方式</h2>",
    "<p>先选择交易市场与周期，再从各模块中确定规则，形成一份可以被人工复核、回测或交给开发者实现的策略需求文档。建议一次只调整少量变量，并保留样本外数据进行验证，避免过度拟合。</p>",
    "<h2>交付与风险说明</h2>",
    "<p>本商品仅作为商城模板展示，交付策略说明与配置框架，<strong>不包含 EA、指标、源码、编译文件或第三方下载资源</strong>。任何参数组合都不代表未来收益；在真实账户使用前，应完成独立审查、历史回测和模拟账户测试。</p>",
    "<p>公开参考：<a href=\"https://www.eahub.cn/thread-139763-1-1.html\">EAHub 页面</a>（仅用于说明灵感来源与版本信息）。</p>",
  ].join("");
  const requirements = JSON.stringify([
    "MetaTrader 4；本商品为策略设计模板，不要求安装策略文件",
    "适用品种与周期由使用者根据流动性、点差和波动特征自行选择",
    "使用前需完成规则复核、历史回测、样本外验证及模拟账户测试",
    "模板不包含原站软件、EA、指标、源码、安装包或收益承诺",
  ]);

  db.prepare(`
    INSERT INTO products (
      id, developer_id, name, type, platform, category, tagline, description,
      price, version, accent, features, requirements, gallery,
      source_filename, source_path, is_template, status, review_note,
      sales, rating, created_at, updated_at
    ) VALUES (?, ?, ?, 'EA', 'MT4', '多策略组合', ?, ?, 0, '1.62-template', '#7c3aed', '[]', ?, '[]',
      '策略大师1.62-多策略配置模板说明.txt', '', 1, 'approved', ?, 0, 5.0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      developer_id = excluded.developer_id,
      name = excluded.name,
      type = excluded.type,
      platform = excluded.platform,
      category = excluded.category,
      tagline = excluded.tagline,
      description = excluded.description,
      price = excluded.price,
      version = excluded.version,
      accent = excluded.accent,
      requirements = excluded.requirements,
      source_filename = excluded.source_filename,
      source_path = excluded.source_path,
      is_template = excluded.is_template,
      status = excluded.status,
      review_note = excluded.review_note,
      updated_at = excluded.updated_at
  `).run(
    id,
    developer.id,
    "策略大师 1.62 · 多策略配置模板",
    "模块化组合入场、过滤、出场和风控规则，快速整理策略方案",
    description,
    requirements,
    "公开参考内容已转化为本站原创结构化模板；不包含第三方文件。",
    now,
    now,
  );

  console.log(`已上架：${id}（开发者：${developer.name}，校验码：${randomBytes(3).toString("hex")}）`);
  db.close();
}
