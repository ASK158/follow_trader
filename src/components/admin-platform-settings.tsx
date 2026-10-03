"use client";

import { useState } from "react";
import type { PlatformSettings } from "@/lib/platform-settings";

export function AdminPlatformSettings({ settings }: { settings: PlatformSettings }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      agentFreeUsageLimit: Number(form.get("agentFreeUsageLimit")),
      agentChatCost: Number(form.get("agentChatCost")),
      agentModifyCost: Number(form.get("agentModifyCost")),
      agentGenerateCost: Number(form.get("agentGenerateCost")),
      agentMinimumGasToStart: Number(form.get("agentMinimumGasToStart")),
      registrationIpDailyLimit: Number(form.get("registrationIpDailyLimit")),
      registrationDevice30dLimit: Number(form.get("registrationDevice30dLimit")),
      registrationRiskThreshold: Number(form.get("registrationRiskThreshold")),
      checkinBaseReward: Number(form.get("checkinBaseReward")),
      checkinStreakIncrement: Number(form.get("checkinStreakIncrement")),
      checkinMaxReward: Number(form.get("checkinMaxReward")),
      telegramUrl: String(form.get("telegramUrl") ?? "").trim(),
      wechatOfficialAccountUrl: String(form.get("wechatOfficialAccountUrl") ?? "").trim(),
      youtubeUrl: String(form.get("youtubeUrl") ?? "").trim(),
      bilibiliUrl: String(form.get("bilibiliUrl") ?? "").trim(),
    };
    try {
      const response = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "配置保存失败");
      setNotice("平台配置已保存，新的社交媒体链接会立即显示在页脚。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "配置保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="finance-settings-card" aria-labelledby="platform-settings-title">
      <div><span className="panel-code">RUNTIME BILLING & ABUSE CONTROL</span><h2 id="platform-settings-title">Agent 计费与注册风控配置</h2><p>价格与额度实时读取，无需修改代码或重启服务。预授权余额必须覆盖最高单次价格且不得低于 1 Gas。</p></div>
      <form className="finance-settings-form" onSubmit={save}>
        <fieldset><legend>Agent 价格</legend><div className="dev-form-grid">
          <label>新用户免费次数<input name="agentFreeUsageLimit" type="number" min="0" max="100" step="1" defaultValue={settings.agentFreeUsageLimit} required /></label>
          <label>普通对话（Gas）<input name="agentChatCost" type="number" min="0" max="100" step="0.1" defaultValue={settings.agentChatCost} required /></label>
          <label>普通修改（Gas）<input name="agentModifyCost" type="number" min="0" max="100" step="0.1" defaultValue={settings.agentModifyCost} required /></label>
          <label>完整策略生成（Gas）<input name="agentGenerateCost" type="number" min="0" max="100" step="0.1" defaultValue={settings.agentGenerateCost} required /></label>
          <label>发起请求最低余额（Gas）<input name="agentMinimumGasToStart" type="number" min="1" max="100" step="0.1" defaultValue={settings.agentMinimumGasToStart} required /><small>免费额度耗尽后，低于该余额直接拒绝请求。</small></label>
        </div></fieldset>
        <fieldset><legend>注册反滥用</legend><div className="dev-form-grid">
          <label>同 IP 每日注册上限<input name="registrationIpDailyLimit" type="number" min="1" max="100" step="1" defaultValue={settings.registrationIpDailyLimit} required /></label>
          <label>同设备 30 日注册上限<input name="registrationDevice30dLimit" type="number" min="1" max="100" step="1" defaultValue={settings.registrationDevice30dLimit} required /></label>
          <label>取消免费额度风险阈值<input name="registrationRiskThreshold" type="number" min="1" max="100" step="1" defaultValue={settings.registrationRiskThreshold} required /><small>达到阈值仍可注册，但不获得 Agent 免费体验。</small></label>
        </div></fieldset>
        <fieldset><legend>每日打卡奖励</legend><div className="dev-form-grid">
          <label>基础奖励（Gas）<input name="checkinBaseReward" type="number" min="0.1" max="1000" step="0.1" defaultValue={settings.checkinBaseReward} required /><small>断签后重新开始，或新用户首次打卡获得的基础值。</small></label>
          <label>连击每日增量（Gas）<input name="checkinStreakIncrement" type="number" min="0" max="1000" step="0.1" defaultValue={settings.checkinStreakIncrement} required /><small>连续打卡时，每天的奖励在前一天基础上增加的数量。</small></label>
          <label>单日奖励上限（Gas）<input name="checkinMaxReward" type="number" min="0.1" max="1000" step="0.1" defaultValue={settings.checkinMaxReward} required /><small>连续打卡奖励的封顶值，需高于基础奖励；封顶周期最多 28 天。</small></label>
        </div></fieldset>
        <fieldset><legend>页脚社交媒体</legend><div className="dev-form-grid">
          <label>Telegram 链接<input name="telegramUrl" type="url" inputMode="url" placeholder="https://t.me/your_channel" defaultValue={settings.telegramUrl} /><small>留空时页脚显示“待配置”。</small></label>
          <label>微信公众号链接<input name="wechatOfficialAccountUrl" type="url" inputMode="url" placeholder="https://mp.weixin.qq.com/..." defaultValue={settings.wechatOfficialAccountUrl} /><small>可填写公众号文章、主页或二维码落地页。</small></label>
          <label>YouTube 链接<input name="youtubeUrl" type="url" inputMode="url" placeholder="https://www.youtube.com/@your_channel" defaultValue={settings.youtubeUrl} /></label>
          <label>Bilibili 链接<input name="bilibiliUrl" type="url" inputMode="url" placeholder="https://space.bilibili.com/..." defaultValue={settings.bilibiliUrl} /></label>
        </div></fieldset>
        {error && <p className="dev-form-error" role="alert">{error}</p>}
        {notice && <p className="dev-notice" role="status">{notice}</p>}
        <button type="submit" disabled={pending}>{pending ? "保存中…" : "保存平台配置"}</button>
      </form>
    </section>
  );
}
