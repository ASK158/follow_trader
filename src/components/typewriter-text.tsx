"use client";

import { useEffect, useState } from "react";

interface TypewriterTextProps {
  text?: string;
  speed?: number;
  pauseDuration?: number;
  className?: string;
  cursorClassName?: string;
}

export function TypewriterText({
  text = "SIGMA / BOT",
  speed = 120,
  pauseDuration = 2200,
  className = "",
  cursorClassName = "",
}: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (!isDeleting) {
      if (displayText.length < text.length) {
        timer = setTimeout(() => {
          setDisplayText(text.slice(0, displayText.length + 1));
        }, speed);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
      }
    } else {
      if (displayText.length > 0) {
        timer = setTimeout(() => {
          setDisplayText(text.slice(0, displayText.length - 1));
        }, speed / 2);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(false);
        }, 500);
      }
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, text, speed, pauseDuration]);

  return (
    <span className={`inline-flex items-center tracking-wider font-mono ${className}`}>
      <span>{displayText}</span>
      <span
        aria-hidden="true"
        className={`inline-block w-[2px] h-[1em] ml-0.5 bg-current align-middle animate-pulse ${cursorClassName}`}
      />
    </span>
  );
}
