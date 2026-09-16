import sanitizeHtml from "sanitize-html";

const INTERNAL_IMAGE_PREFIX = "/api/marketplace/images/";
const TEXT_COLOR_PATTERN = /^(?:#[0-9a-fA-F]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/;
const DARK_TEXT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DARK_READING_BACKGROUND = [20, 18, 16] as const;

function parseTextColor(color: string): [number, number, number, number] | null {
  const hex = color.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 1];
  }

  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/);
  if (!rgb) return null;
  return [
    Math.min(255, Number(rgb[1])),
    Math.min(255, Number(rgb[2])),
    Math.min(255, Number(rgb[3])),
    rgb[4] === undefined ? 1 : Number(rgb[4]),
  ];
}

function relativeLuminance([red, green, blue]: readonly number[]): number {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground: readonly number[], background: readonly number[]): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** 保持用户选择的色相，同时为暖黑背景生成可读的高对比版本。 */
export function createDarkThemeTextColor(color: string): string | null {
  const parsed = parseTextColor(color);
  if (!parsed) return null;
  const [red, green, blue, alpha] = parsed;
  const composited = [
    red * alpha + DARK_READING_BACKGROUND[0] * (1 - alpha),
    green * alpha + DARK_READING_BACKGROUND[1] * (1 - alpha),
    blue * alpha + DARK_READING_BACKGROUND[2] * (1 - alpha),
  ];
  let ratio = 0;
  let adjusted = composited;
  while (ratio < 5) {
    ratio = contrastRatio(adjusted, DARK_READING_BACKGROUND);
    if (ratio >= 5) break;
    adjusted = adjusted.map((channel) => channel + (255 - channel) * 0.04);
  }
  return `#${adjusted.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

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
      span: { color: [TEXT_COLOR_PATTERN], "--rte-dark-color": [DARK_TEXT_COLOR_PATTERN] },
      p: { "text-align": [/^(left|center|right|justify)$/] },
      h2: { "text-align": [/^(left|center|right|justify)$/] },
      h3: { "text-align": [/^(left|center|right|justify)$/] },
    },
    exclusiveFilter(frame) {
      return frame.tag === "img" && !frame.attribs.src?.startsWith(INTERNAL_IMAGE_PREFIX);
    },
    transformTags: {
      span: (_tagName, attribs) => {
        const color = attribs.style?.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim();
        const darkColor = color ? createDarkThemeTextColor(color) : null;
        return {
          tagName: "span",
          attribs: darkColor ? { ...attribs, style: `${attribs.style};--rte-dark-color:${darkColor}` } : attribs,
        };
      },
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
