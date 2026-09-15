import sanitizeHtml from "sanitize-html";

const INTERNAL_IMAGE_PREFIX = "/api/marketplace/images/";
const TEXT_COLOR_PATTERN = /^(?:#[0-9a-fA-F]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/;

/**
 * 清洗开发者提交的商品介绍 HTML。
 * 仅保留编辑器支持的排版，并限制图片为本站上传接口生成的地址。
 */
export function sanitizeProductDescription(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "s", "strike",
      "ul", "ol", "li", "blockquote", "code", "pre", "span", "a", "img", "hr",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title"],
      span: ["style"],
      p: ["style"],
      h2: ["style"],
      h3: ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedStyles: {
      // 浏览器会把编辑器设置的十六进制颜色序列化为 rgb(...)。
      span: { color: [TEXT_COLOR_PATTERN] },
      p: { "text-align": [/^(left|center|right|justify)$/] },
      h2: { "text-align": [/^(left|center|right|justify)$/] },
      h3: { "text-align": [/^(left|center|right|justify)$/] },
    },
    exclusiveFilter(frame) {
      return frame.tag === "img" && !frame.attribs.src?.startsWith(INTERNAL_IMAGE_PREFIX);
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer", target: "_blank" },
      }),
    },
  });
}

export function richTextPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
