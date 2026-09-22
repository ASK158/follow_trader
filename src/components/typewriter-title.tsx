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
        {lines.map((line, index) => (
          <span className="typewriter-title-line" key={`${line}-${index}`}>
            {line}
          </span>
        ))}
      </span>
    );
  }

  const currentText = fullText.slice(0, charCount);
  const currentLines = currentText.split("\n");

  return (
    <span className="typewriter-title-wrapper" aria-label={lines.join(" ")}>
      {currentLines.map((line, index) => (
        <span className="typewriter-title-line" key={index}>
          {line}
          {index === currentLines.length - 1 && (
            <span className="typewriter-title-cursor" aria-hidden="true" />
          )}
        </span>
      ))}
    </span>
  );
}
