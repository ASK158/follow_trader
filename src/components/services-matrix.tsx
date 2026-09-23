"use client";

import { useState } from "react";

export interface CoreServiceItem {
  index: string;
  title: string;
  en: string;
  keywords: string[];
  description: string;
}

interface ServicesMatrixProps {
  services: CoreServiceItem[];
}

// 四大核心功能矩阵：点击卡片展开描述性文本（始终单卡激活的手风琴矩阵）
export function ServicesMatrix({ services }: ServicesMatrixProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="services-expand-row">
      {services.map((service, i) => {
        const isActive = i === activeIndex;
        const cardClassName = isActive ? "service-expand-card is-active" : "service-expand-card";

        return (
          <article key={service.index} className={cardClassName}>
            {/* 折叠面：序号 + 标题，同时是无障碍触发器 */}
            <button
              type="button"
              className="service-expand-toggle"
              aria-expanded={isActive}
              aria-controls={`service-panel-${service.index}`}
              inert={isActive}
              onClick={() => setActiveIndex(i)}
            >
              <span className="service-expand-badge" aria-hidden="true">{service.index}</span>
              <span className="service-expand-name">{service.title}</span>
            </button>

            {/* 展开面：序号 + 标题 + 关键词 + 描述 */}
            <div
              id={`service-panel-${service.index}`}
              className="service-expand-panel"
              inert={!isActive}
            >
              <span className="service-expand-badge service-expand-badge-lg" aria-hidden="true">
                {service.index}
              </span>
              <h3>{service.title}</h3>
              <span className="card-en">{service.en}</span>

              {/* 突出核心关键词 */}
              <div className="card-keywords">
                {service.keywords.map((kw) => (
                  <span key={kw} className="kw-badge">{kw}</span>
                ))}
              </div>

              <p>{service.description}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}