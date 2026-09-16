import assert from "node:assert/strict";
import test from "node:test";
import { createDarkThemeTextColor, sanitizeProductDescription } from "../src/lib/marketplace/rich-text";

test("商品富文本为用户选色生成暖黑主题高对比色", () => {
  const html = sanitizeProductDescription('<p><span style="color: #b4162b">红色强调</span> <span style="color: rgb(29, 78, 216)">蓝色链接</span></p>');

  assert.match(html, /color:\s*#b4162b/i);
  assert.match(html, /color:\s*rgb\(29, 78, 216\)/i);
  assert.equal((html.match(/--rte-dark-color:/g) ?? []).length, 2);
});

test("暖黑主题颜色保留色彩差异且提亮深色", () => {
  const red = createDarkThemeTextColor("#b4162b");
  const blue = createDarkThemeTextColor("rgb(29, 78, 216)");

  assert.match(red ?? "", /^#[0-9a-f]{6}$/);
  assert.match(blue ?? "", /^#[0-9a-f]{6}$/);
  assert.notEqual(red, blue);
  assert.notEqual(red, "#b4162b");
});

test("非法富文本颜色不会绕过清洗或生成主题变量", () => {
  const html = sanitizeProductDescription('<span style="color: var(--unsafe)">文本</span>');

  assert.doesNotMatch(html, /color|--rte-dark-color/);
  assert.equal(createDarkThemeTextColor("var(--unsafe)"), null);
});