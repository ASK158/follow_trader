import type { ReactNode } from "react";

export function LegalArticle({
  code,
  title,
  intro,
  updatedAt,
  children,
}: {
  code: string;
  title: string;
  intro: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <article className="legal-article">
      <header>
        <span className="panel-code">{code}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
        <small>最后更新：{updatedAt}</small>
      </header>
      <div className="legal-body article-content">{children}</div>
    </article>
  );
}