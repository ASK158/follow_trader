"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { User } from "@/lib/marketplace/auth";
import { UserAvatar } from "@/components/user-avatar";

export function ProfileSettings({ user }: { user: User }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  function selectAvatar(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setSource(file); setPreview(file ? URL.createObjectURL(file) : null);
    setZoom(1); setOffsetX(0); setOffsetY(0);
  }

  async function uploadAvatar() {
    if (!source) return;
    setPending(true); setMessage("");
    try {
      const bitmap = await createImageBitmap(source);
      const side = Math.min(bitmap.width, bitmap.height) / zoom;
      const maxX = Math.max(0, bitmap.width - side);
      const maxY = Math.max(0, bitmap.height - side);
      const sx = maxX * (offsetX + 100) / 200;
      const sy = maxY * (offsetY + 100) / 200;
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
      canvas.getContext("2d")?.drawImage(bitmap, sx, sy, side, side, 0, 0, 512, 512); bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .9));
      if (!blob) throw new Error("头像裁剪失败");
      const form = new FormData(); form.set("avatar", blob, "avatar.webp");
      const response = await fetch("/api/account/avatar", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "头像上传失败");
      if (preview) URL.revokeObjectURL(preview);
      setSource(null); setPreview(null); setMessage("头像已更新"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "头像上传失败"); }
    finally { setPending(false); }
  }

  async function removeAvatar() {
    setPending(true); setMessage("");
    const response = await fetch("/api/account/avatar", { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    setMessage(response.ok ? "头像已删除" : result.error ?? "删除失败"); setPending(false); router.refresh();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "保存失败");
      setMessage("个人资料已保存"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setPending(false); }
  }

  return <div className="profile-settings-layout">
    {message && <p className="dev-notice" role="status">{message}</p>}
    <section className="profile-settings-card">
      <span className="panel-code">PROFILE IMAGE</span><h2>头像</h2>
      <div className="avatar-editor-row">
        {preview ? <span className="avatar-crop-preview"><span style={{ backgroundImage: `url(${preview})`, backgroundSize: `${zoom * 100}%`, backgroundPosition: `${50 + offsetX / 2}% ${50 + offsetY / 2}%` }} /></span> : <UserAvatar name={user.name} src={user.avatarUrl} size={128} />}
        <div className="avatar-editor-controls">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectAvatar(event.target.files?.[0] ?? null)} />
          {source && <><label>缩放<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><label>水平位置<input type="range" min="-100" max="100" value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} /></label><label>垂直位置<input type="range" min="-100" max="100" value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} /></label><button type="button" onClick={uploadAvatar} disabled={pending}>裁剪并保存</button></>}
          {user.avatarUrl && !source && <button type="button" className="profile-danger-button" onClick={removeAvatar} disabled={pending}>删除头像</button>}
          <small>JPG、PNG 或 WebP，最大 5MB。保存后统一生成 512×512 WebP。</small>
        </div>
      </div>
    </section>
    <form className="profile-settings-card dev-form" onSubmit={save}>
      <span className="panel-code">PERSONAL PROFILE</span><h2>个人主页资料</h2>
      <div className="dev-form-grid"><label>昵称<input name="name" defaultValue={user.name} minLength={2} maxLength={50} required /></label><label>唯一用户名<input name="username" defaultValue={user.username} minLength={4} maxLength={24} pattern="[a-z][a-z0-9_]{3,23}" required /><small>用于个人主页地址，只允许小写字母、数字和下划线。</small></label></div>
      <label>个人简介<textarea name="bio" defaultValue={user.bio} maxLength={300} rows={5} placeholder="介绍你的交易方向、工具和经验" /></label>
      <div className="dev-form-grid"><label>联系方式<input name="contact" defaultValue={user.contact} maxLength={200} /></label><label>联系方式可见范围<select name="contactVisibility" defaultValue={user.contactVisibility}><option value="public">所有人</option><option value="signed_in">仅登录用户</option><option value="followers">仅关注我的用户</option><option value="private">仅自己</option></select></label></div>
      <div className="dev-form-grid"><label>个人网站<input name="websiteUrl" type="url" defaultValue={user.websiteUrl} placeholder="https://" /></label><label>地区<input name="location" defaultValue={user.location} maxLength={50} /></label></div>
      <span className="panel-code">PRIVACY</span><h2>隐私与互动</h2>
      <div className="dev-form-grid"><label>粉丝列表<select name="followersVisibility" defaultValue={user.followersVisibility}><option value="public">公开</option><option value="followers">仅关注我的用户</option><option value="private">仅自己</option></select></label><label>关注列表<select name="followingVisibility" defaultValue={user.followingVisibility}><option value="public">公开</option><option value="followers">仅关注我的用户</option><option value="private">仅自己</option></select></label><label>收藏夹<select name="favoritesVisibility" defaultValue={user.favoritesVisibility}><option value="private">仅自己</option><option value="public">公开</option></select></label><label>谁可以给我发消息<select name="messagePermission" defaultValue={user.messagePermission}><option value="everyone">所有登录用户</option><option value="followers">我关注的人</option><option value="mutual">互相关注</option><option value="none">不接收消息</option></select></label></div>
      <button disabled={pending}>{pending ? "保存中…" : "保存个人资料"}</button>
    </form>
  </div>;
}
