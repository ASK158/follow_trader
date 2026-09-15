export type Tutorial = {
  id: string;
  kind: "article" | "video";
  title: string;
  summary: string;
  category: string;
  level: "入门" | "进阶" | "实战";
  duration: string;
  platform?: "YouTube" | "Bilibili" | "TikTok";
  externalUrl?: string;
  accent: string;
  content?: string | null;
  sections?: Array<{ heading: string; paragraphs: string[]; points?: string[] }>;
};

export const tutorials: Tutorial[] = [
  { id: "mt5-strategy-foundation", kind: "article", title: "从交易规则到 MT5 策略", summary: "把入场、离场、仓位和风险限制整理成可执行的 StrategySpec。", category: "策略设计", level: "入门", duration: "12 分钟", accent: "#b4162b", sections: [{ heading: "先定义可验证的规则", paragraphs: ["策略开发的第一步不是写代码，而是把主观描述转换为可以判断真假的条件。品种、周期、入场、离场和风险上限都应明确。"], points: ["使用确定的指标参数和时间周期", "分别描述开多与开空条件", "定义无信号和禁止交易的场景"] }, { heading: "把风险放在信号之前", paragraphs: ["任何信号都必须经过仓位、点差、时段和账户风险检查。策略只有在风险约束满足后才能下单。"], points: ["设置单笔风险比例", "设置每日损失上限", "限制同时持仓数量"] }, { heading: "验证与迭代", paragraphs: ["先编译，再回测，然后进行样本外验证。每一次参数修改都应记录原因，避免只追求历史曲线。"] }] },
  { id: "drawdown-reading", kind: "article", title: "如何阅读收益曲线与回撤", summary: "理解收益、波动、最大回撤和恢复周期之间的关系。", category: "数据分析", level: "入门", duration: "9 分钟", accent: "#3c3632", sections: [{ heading: "收益不是唯一指标", paragraphs: ["高收益可能来自高杠杆或集中风险。比较策略时，应同时观察回撤深度、回撤持续时间和交易样本数量。"], points: ["累计收益与年化收益", "最大回撤与恢复时间", "胜率、盈亏比与交易频率"] }, { heading: "识别不稳定阶段", paragraphs: ["曲线突然变陡、长时间横盘或回撤集中出现，都可能表示策略对市场环境敏感，需要结合交易记录进一步检查。"] }] },
  { id: "mql5-risk-module", kind: "article", title: "MQL5 风险控制模块设计", summary: "实现仓位计算、日损熔断、点差过滤和连续亏损保护。", category: "MQL5 开发", level: "进阶", duration: "18 分钟", accent: "#285d52", sections: [{ heading: "账户级风险状态", paragraphs: ["风险模块应独立于信号模块，在每次 Tick 和交易事件中更新账户权益、当日盈亏和持仓暴露。"], points: ["按止损距离计算手数", "权益阈值触发全局暂停", "记录风险规则触发原因"] }, { heading: "执行前检查", paragraphs: ["下单前检查交易时段、点差、保证金和当前持仓，任何条件不满足都应返回明确的状态码。"] }] },
  { id: "youtube-mql5", kind: "video", title: "YouTube · MQL5 系统化开发", summary: "浏览 MQL5 策略开发、回测与调试相关公开视频。", category: "视频课程", level: "进阶", duration: "外部播放", platform: "YouTube", externalUrl: "https://www.youtube.com/results?search_query=MQL5+algorithmic+trading+tutorial", accent: "#b4162b" },
  { id: "bilibili-mt5", kind: "video", title: "Bilibili · MT5 量化交易教程", summary: "浏览中文 MT5、EA 编程和策略回测教程。", category: "视频课程", level: "入门", duration: "外部播放", platform: "Bilibili", externalUrl: "https://search.bilibili.com/all?keyword=MT5%20EA%20%E7%BC%96%E7%A8%8B", accent: "#336b78" },
  { id: "tiktok-trading", kind: "video", title: "TikTok · Algo Trading Clips", summary: "浏览算法交易、市场结构和风险管理短视频。", category: "短视频", level: "实战", duration: "外部播放", platform: "TikTok", externalUrl: "https://www.tiktok.com/search?q=algorithmic%20trading", accent: "#211f1c" },
];

export function getTutorial(id: string) {
  return tutorials.find((tutorial) => tutorial.id === id);
}
