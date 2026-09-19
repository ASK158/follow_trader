import Image from "next/image";

export function UserAvatar({ name, src, size = 72 }: { name: string; src: string | null; size?: number }) {
  if (src) return <Image className="user-avatar" src={src} alt={`${name}的头像`} width={size} height={size} unoptimized />;
  return <span className="user-avatar user-avatar-fallback" style={{ width: size, height: size }} aria-label={`${name}的默认头像`}>{name.trim().charAt(0).toLocaleUpperCase("zh-CN") || "U"}</span>;
}
