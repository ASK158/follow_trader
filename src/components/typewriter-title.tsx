"use client";

import { useEffect, useState } from "react";

interface TypewriterTitleProps {
  lines?: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}

export function TypewriterTitle({
  lines = ["SIGMA", "BOT"],
  typingSpeed = 160,
  deletingSpeed = 90,
  pauseDuration = 3200,
}: TypewriterTitleProps) {
  const fullText = lines.join("\n");
  const [mounted, setMounted] = useState(false);
  const [charCount, setCharCount] = useState(fullText.length);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // 保持服务端与首次客户端渲染一致，随后再启动动画。
    const startTimeout = setTimeout(() => {
      setCharCount(0);
      setMounted(true);
    }, 1200);

    return () => clearTimeout(startTimeout);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let timer: NodeJS.Timeout;

    if (!isDeleting) {
      if (charCount < fullText.length) {
        const nextChar = fullText[charCount];
        const delay = nextChar === "\n" ? typingSpeed * 1.8 : typingSpeed;
        timer = setTimeout(() => {
          setCharCount((prev) => prev + 1);
        }, delay);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
      }
    } else {
      if (charCount > 0) {
        timer = setTimeout(() => {
          setCharCount((prev) => prev - 1);
        }, deletingSpeed);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(false);
        }, 600);
      }
    }

    return () => clearTimeout(timer);
  }, [mounted, charCount, isDeleting, fullText, typingSpeed, deletingSpeed, pauseDuration]);

  // SSR or before mount: render full text static structure
  if (!mounted) {
    return (
      <span className="typewriter-title-wrapper">
        <span>{lines[0]}</span>
        <br />
        <span>{lines[1]}</span>
      </span>
    );
  }

  const currentText = fullText.slice(0, charCount);
  const currentLines = currentText.split("\n");
  const line1 = currentLines[0] ?? "";
  const hasLine2 = currentLines.length > 1;
  const line2 = hasLine2 ? currentLines[1] : "";
  const cursorOnLine1 = !hasLine2;

  return (
    <span className="typewriter-title-wrapper" aria-label={lines.join(" ")}>
      <span>{line1}</span>
      {cursorOnLine1 && <span className="typewriter-title-cursor" aria-hidden="true" />}
      {hasLine2 && (
        <>
          <br />
          <span>{line2}</span>
          <span className="typewriter-title-cursor" aria-hidden="true" />
        </>
      )}
    </span>
  );
}
