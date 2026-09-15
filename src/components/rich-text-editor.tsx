"use client";

import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRef, useState } from "react";

type Props = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  minHeight?: number;
};

const colors = ["#1f2328", "#b4162b", "#996219", "#285d52", "#1d4ed8", "#6d28d9", "#6b7280"];

export function RichTextEditor({ name, defaultValue = "", placeholder = "填写内容…", minHeight = 220 }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState(defaultValue);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
      TextStyle,
      Color,
      Underline,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: defaultValue,
    onUpdate: ({ editor: currentEditor }) => setHtml(currentEditor.getHTML()),
    editorProps: {
      attributes: { class: "rte-content", style: `min-height:${minHeight}px` },
    },
  });

  async function uploadImage(file: File) {
    const form = new FormData();
    form.set("image", file);
    const response = await fetch("/api/developer/uploads", { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(result.error ?? "图片上传失败");
      return;
    }
    editor?.chain().focus().setImage({ src: result.url }).run();
  }

  const active = (attributes: Record<string, unknown>) => (editor?.isActive(attributes) ? "active" : "");

  return (
    <div className="rte-shell">
      {editor && (
        <div className="rte-toolbar" role="toolbar" aria-label="富文本工具栏">
          <button type="button" title="加粗" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
          <button type="button" title="斜体" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
          <button type="button" title="下划线" className={editor.isActive("underline") ? "active" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
          <button type="button" title="删除线" className={editor.isActive("strike") ? "active" : ""} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></button>
          <span className="rte-sep" />
          <button type="button" title="大号字体" className={editor.isActive("heading", { level: 2 }) ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>大</button>
          <button type="button" title="小号字体" className={editor.isActive("heading", { level: 3 }) ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>小</button>
          <span className="rte-sep" />
          <button type="button" title="无序列表" className={editor.isActive("bulletList") ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()}>• 列表</button>
          <button type="button" title="有序列表" className={editor.isActive("orderedList") ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. 列表</button>
          <button type="button" title="引用" className={editor.isActive("blockquote") ? "active" : ""} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝ 引用</button>
          <button type="button" title="代码" className={editor.isActive("code") ? "active" : ""} onClick={() => editor.chain().focus().toggleCode().run()}>{"</>"}</button>
          <span className="rte-sep" />
          <button type="button" title="左对齐" className={active({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>⇤</button>
          <button type="button" title="居中" className={active({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>↔</button>
          <button type="button" title="右对齐" className={active({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>⇥</button>
          <span className="rte-sep" />
          {colors.map((color) => (
            <button key={color} type="button" title={`字体颜色 ${color}`} className="rte-color" style={{ background: color }} onClick={() => editor.chain().focus().setColor(color).run()} aria-label={color} />
          ))}
          <button type="button" title="清除颜色" onClick={() => editor.chain().focus().unsetColor().run()}>✕色</button>
          <span className="rte-sep" />
          <button type="button" title="插入图片" onClick={() => fileInputRef.current?.click()}>🖼 图片</button>
          <button type="button" title="撤销" onClick={() => editor.chain().focus().undo().run()}>↩</button>
          <button type="button" title="重做" onClick={() => editor.chain().focus().redo().run()}>↪</button>
        </div>
      )}
      <EditorContent editor={editor} />
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void uploadImage(file);
        event.target.value = "";
      }} />
      <input type="hidden" name={name} value={html} readOnly />
    </div>
  );
}
