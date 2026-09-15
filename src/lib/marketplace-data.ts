import type { ProductType } from "@/lib/marketplace/categories";

export type MarketplaceProduct = {
  id: string;
  name: string;
  type: ProductType;
  platform: "MT5" | "MT4" | "MT4 / MT5";
  category: string;
  tagline: string;
  description: string;
  price: number;
  version: string;
  updatedAt: string;
  developer: string;
  sales: number;
  rating: number;
  views?: number;
  favorites?: number;
  accent: string;
  coverImage?: string | null;
  features: string[];
  requirements: string[];
  gallery: Array<{ title: string; caption: string; variant: string }>;
  sourceFilename: string;
};

export const marketplaceProducts: MarketplaceProduct[] = [
  { id: "quant-pulse-ea", name: "Quant Pulse EA", type: "EA", platform: "MT5", category: "趋势交易", tagline: "多周期趋势确认与动态风险控制", description: "使用 EMA 趋势结构、ATR 波动过滤和分层止损管理交易机会。适合希望研究趋势跟随与仓位控制的 MT5 开发者。", price: 399, version: "1.4.2", updatedAt: "2026-08-18", developer: "Sigma Quant Lab", sales: 286, rating: 4.8, accent: "#b4162b", features: ["EMA 多周期方向确认", "ATR 自适应止损与移动保护", "单日亏损和最大持仓限制", "完整 MQL5 源码与参数说明"], requirements: ["MetaTrader 5 Build 4300+", "建议用于 EURUSD、GBPUSD 的 H1 周期", "下载后需自行编译并先在模拟账户测试"], gallery: [{ title: "实时信号面板", caption: "趋势、波动率和风险状态集中显示", variant: "terminal" }, { title: "回测参数矩阵", caption: "支持按品种和周期调整核心参数", variant: "matrix" }, { title: "风险控制日志", caption: "记录止损、日损与仓位限制触发情况", variant: "risk" }], sourceFilename: "QuantPulseEA_demo.mq5" },
  { id: "orderflow-radar", name: "订单簿流 OrderFlow", type: "指标", platform: "MT5", category: "订单流", tagline: "成交动量与关键价格区域可视化", description: "将价格动量、成交活跃度和关键区域叠加到主图，帮助交易者识别可能的流动性集中区。", price: 169, version: "2.1.0", updatedAt: "2026-07-30", developer: "Northstar Systems", sales: 421, rating: 4.9, accent: "#8d2636", features: ["成交动量热力显示", "关键价格区域自动标注", "多周期参数预设", "弹窗与移动端推送提醒"], requirements: ["MetaTrader 5", "支持外汇、黄金和主要指数", "指标仅用于辅助判断"], gallery: [{ title: "订单流热力图", caption: "在主图中呈现活跃成交区域", variant: "heatmap" }, { title: "信号提醒中心", caption: "统一管理突破和动量提醒", variant: "alerts" }], sourceFilename: "OrderFlowRadar_demo.mq5" },
  { id: "volatility-guard", name: "Volatility Guard", type: "EA", platform: "MT4 / MT5", category: "风险管理", tagline: "账户级波动与回撤保护组件", description: "作为独立风险控制 EA 监控账户权益、当日损失、连续亏损与异常点差，可与其他策略组合使用。", price: 249, version: "1.8.5", updatedAt: "2026-08-06", developer: "Aegis Algo", sales: 198, rating: 4.7, accent: "#3c3632", features: ["账户权益实时监控", "日损与总回撤熔断", "点差和交易时段过滤", "风险事件日志导出"], requirements: ["MetaTrader 4 或 MetaTrader 5", "需要允许 EA 自动交易", "与其他 EA 共用时请检查 Magic Number"], gallery: [{ title: "风险仪表盘", caption: "账户风险指标实时聚合", variant: "risk" }, { title: "熔断规则", caption: "按账户或策略设置保护阈值", variant: "matrix" }], sourceFilename: "VolatilityGuard_demo.mq5" },
  { id: "market-structure-pro", name: "Market Structure Pro", type: "指标", platform: "MT5", category: "价格行为", tagline: "结构突破、摆动点与趋势阶段识别", description: "自动标记市场结构转折、突破和潜在供需区域，为人工交易和策略研究提供结构化参考。", price: 129, version: "3.0.1", updatedAt: "2026-06-22", developer: "Vertex Trading", sales: 562, rating: 4.8, accent: "#285d52", features: ["BOS / CHoCH 自动识别", "摆动高低点标记", "供需区域绘制", "信号缓冲区可供 EA 调用"], requirements: ["MetaTrader 5", "建议 M15 及以上周期", "复杂行情下需结合风险管理"], gallery: [{ title: "市场结构图层", caption: "展示结构变化和关键价格区", variant: "structure" }, { title: "指标参数", caption: "控制灵敏度、标签和提醒", variant: "matrix" }], sourceFilename: "MarketStructurePro_demo.mq5" },
  { id: "gold-session-scalper", name: "Gold Session Scalper", type: "EA", platform: "MT5", category: "黄金交易", tagline: "针对黄金活跃时段的短线执行系统", description: "面向 XAUUSD 伦敦与纽约活跃时段，结合波动扩张、点差过滤和快速退出逻辑。", price: 499, version: "1.2.3", updatedAt: "2026-08-28", developer: "Auric Quant", sales: 147, rating: 4.6, accent: "#9a641e", features: ["交易时段过滤", "点差与滑点保护", "分批止盈和保本控制", "可视化交易状态面板"], requirements: ["MetaTrader 5", "XAUUSD M5 / M15", "需根据经纪商合约规格调整参数"], gallery: [{ title: "黄金时段监测", caption: "显示波动、点差与可交易状态", variant: "terminal" }, { title: "执行统计", caption: "追踪交易频率和退出原因", variant: "alerts" }], sourceFilename: "GoldSessionScalper_demo.mq5" },
  { id: "adaptive-rsi-suite", name: "RSI 超买超卖 Pro", type: "指标", platform: "MT4 / MT5", category: "动量指标", tagline: "随波动环境动态调整的 RSI 工具组", description: "根据市场波动水平调整 RSI 区间和信号阈值，提供背离识别与多周期确认。", price: 99, version: "2.6.0", updatedAt: "2026-05-19", developer: "Delta Tools", sales: 733, rating: 4.9, accent: "#5f334d", features: ["自适应超买超卖区间", "常规与隐藏背离识别", "多周期确认面板", "MT4 与 MT5 双版本源码"], requirements: ["MetaTrader 4 或 MetaTrader 5", "适用于主流交易品种", "建议配合趋势过滤器"], gallery: [{ title: "自适应 RSI", caption: "阈值随波动环境动态变化", variant: "oscillator" }, { title: "多周期矩阵", caption: "统一查看多个周期的动量状态", variant: "matrix" }], sourceFilename: "AdaptiveRSISuite_demo.mq5" },
];

export function getMarketplaceProduct(id: string) {
  return marketplaceProducts.find((product) => product.id === id);
}

export function getDemoSource(product: MarketplaceProduct) {
  return `// ${product.name} — DEMO SOURCE\n// This file demonstrates the post-purchase delivery pipeline.\n// Replace with the developer-provided source after real payment integration.\n#property strict\n\ninput double RiskPercent = 1.0;\n\nint OnInit()\n{\n   Print(\"${product.name} demo initialized\");\n   return(INIT_SUCCEEDED);\n}\n\nvoid OnTick()\n{\n   // Demo only: production trading logic is not included.\n}\n`;
}
