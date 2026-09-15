"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { PRODUCT_CATEGORIES, isProductCategory, type ProductType } from "@/lib/marketplace/categories";

type Props = {
  mode: "create" | "edit";
  productId?: string;
  initial?: {
    name: string; type: ProductType; platform: string; category: string; tagline: string;
    description: string; price: number; version: string; accent: string;
    coverImage?: string | null; requirements: string[]; sourceFilename: string; isTemplate: boolean;
  };
};

export function ProductSubmitForm({ mode, productId, initial }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [isTemplate, setIsTemplate] = useState(initial?.isTemplate ?? false);
  const initialType = initial?.type ?? "EA";
  const [productType, setProductType] = useState<ProductType>(initialType);
  const [category, setCategory] = useState<string>(
    initial?.category && isProductCategory(initialType, initial.category) ? initial.category : PRODUCT_CATEGORIES[initialType][0],
  );

  function changeProductType(nextType: ProductType) {
    setProductType(nextType);
    setCategory(PRODUCT_CATEGORIES[nextType][0]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(mode === "create" ? "/api/developer/products" : `/api/developer/products/${productId}`, {
        method: mode === "create" ? "POST" : "PUT",
        body: form,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "提交失败，请重试");
        return;
      }
      router.replace("/developer?submitted=1");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="dev-form dev-product-form" encType="multipart/form-data">
      <fieldset>
        <legend>基本信息</legend>
        <div className="dev-form-grid">
          <label>作品名称
            <input name="name" required minLength={2} maxLength={80} defaultValue={initial?.name} placeholder="例如：Quant Pulse EA" />
          </label>
          <label>主分类
            <select name="type" value={productType} onChange={(event) => changeProductType(event.target.value as ProductType)}>
              <option value="EA">EA（自动交易）</option>
              <option value="指标">技术指标</option>
              <option value="其他工具">其他工具</option>
            </select>
          </label>
          <label>平台
            <select name="platform" defaultValue={initial?.platform ?? "MT5"}>
              <option value="MT5">MT5</option>
              <option value="MT4">MT4</option>
            </select>
          </label>
          <label>子分类
            <select name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
              {PRODUCT_CATEGORIES[productType].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>价格（Gas 积分）
            <input name="price" type="number" required min={0} max={1000000} step="1" defaultValue={initial?.price ?? 199} />
          </label>
          <label>版本号
            <input name="version" required maxLength={20} defaultValue={initial?.version ?? "1.0.0"} placeholder="1.0.0" />
          </label>
          <label>主题色
            <input name="accent" type="color" defaultValue={initial?.accent ?? "#b4162b"} />
          </label>
          <label>封面图片（可选）
            <input name="cover" type="file" accept="image/png,image/jpeg,image/webp" />
            <small>支持 PNG、JPG、WebP，最大 5MB；未上传时使用主题色封面。</small>
          </label>
        </div>
        {initial?.coverImage && <label className="dev-template-option">
          <input name="removeCover" type="checkbox" />
          移除当前封面，恢复为主题色封面
        </label>}
        <label>一句话简介
          <input name="tagline" required minLength={4} maxLength={120} defaultValue={initial?.tagline} placeholder="例如：多周期趋势确认与动态风险控制" />
        </label>
        <label>详细介绍（支持插图、颜色、加粗等排版）
          <RichTextEditor name="description" defaultValue={initial?.description} placeholder="策略逻辑、适用品种与周期、风控方式、交付内容…" />
        </label>
      </fieldset>

      <fieldset>
        <legend>功能与运行要求（每行一条）</legend>
        <label>运行要求
          <textarea name="requirements" required rows={4} defaultValue={initial?.requirements.join("\n")} placeholder={"MetaTrader 5 Build 4300+\n建议用于 EURUSD H1 周期\n下载后请先在模拟账户测试"} />
        </label>
      </fieldset>

      <fieldset>
        <legend>交付内容</legend>
        <label className="dev-template-option">
          <input name="isTemplate" type="checkbox" checked={isTemplate} onChange={(event) => setIsTemplate(event.target.checked)} />
          模板策略（仅交付策略说明与配置框架，不上传策略文件）
        </label>
        <label>{isTemplate ? "策略文件（模板策略无需上传）" : mode === "create" ? "上传源码" : `重新上传（当前：${initial?.sourceFilename}）`}
          <input name="source" type="file" accept=".mq5,.mq4,.ex5,.ex4" required={!isTemplate && (mode === "create" || initial?.isTemplate)} disabled={isTemplate} />
        </label>
        <small>{isTemplate ? "买家订单确认后可下载根据商品介绍自动生成的策略模板说明，不包含 EA、指标或可执行文件。" : `文件仅存储在服务器数据目录，购买订单确认后买家才能下载。${mode === "edit" ? "不上传则保留现有文件。" : ""}`}</small>
      </fieldset>

      {error && <p className="dev-form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? "提交中…" : mode === "create" ? "提交审核" : "保存并重新提交审核"}</button>
      <small>提交后进入审核队列，审核通过后自动出现在商城列表；修改已上架作品会重新进入审核。</small>
    </form>
  );
}
