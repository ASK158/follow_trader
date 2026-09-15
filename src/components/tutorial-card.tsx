import Link from "next/link";
import type { Tutorial } from "@/lib/tutorial-data";

export function TutorialCard({ tutorial }: { tutorial: Tutorial }) {
  const content = <><div className="tutorial-cover" style={{ "--tutorial-accent": tutorial.accent } as React.CSSProperties}><span>{tutorial.kind === "video" ? "▶" : "T"}</span><b>{tutorial.platform ?? tutorial.category}</b><i>Σ / LEARN</i></div><div className="tutorial-card-body"><div><span>{tutorial.category}</span><span>{tutorial.level}</span><span>{tutorial.duration}</span></div><h2>{tutorial.title}</h2><p>{tutorial.summary}</p><b className="tutorial-action">{tutorial.kind === "video" ? "前往外部平台 ↗" : "阅读教程 →"}</b></div></>;
  return tutorial.kind === "video" ? <a className="tutorial-card" href={tutorial.externalUrl} target="_blank" rel="noreferrer">{content}</a> : <Link className="tutorial-card" href={`/tutorials/${tutorial.id}`}>{content}</Link>;
}
