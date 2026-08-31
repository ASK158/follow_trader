import type { CodePatch } from "./types";

const MAX_PATCHES = 6;
const MAX_BLOCK_LENGTH = 12_000;
const prohibitedPatterns = [
  { pattern: /\bWebRequest\b/i, label: "WebRequest" },
  { pattern: /#import\b/i, label: "DLL 导入" },
  { pattern: /\.dll\b/i, label: "DLL" },
];

function countOccurrences(source: string, search: string): number {
  let count = 0;
  let position = 0;
  while (true) {
    const found = source.indexOf(search, position);
    if (found < 0) return count;
    count += 1;
    position = found + search.length;
  }
}

export function applyCodePatches(source: string, patches: CodePatch[]): string {
  if (!patches.length) throw new Error("模型没有返回可应用的代码修改块");
  if (patches.length > MAX_PATCHES) throw new Error(`单次最多允许修改 ${MAX_PATCHES} 个代码块`);

  let result = source;
  for (const patch of patches) {
    const search = patch.search.replace(/\r\n/g, "\n");
    const replace = patch.replace.replace(/\r\n/g, "\n");
    if (!search.trim() || search.length > MAX_BLOCK_LENGTH || replace.length > MAX_BLOCK_LENGTH) {
      throw new Error("代码修改块为空或过大，已拒绝应用");
    }
    const matches = countOccurrences(result, search);
    if (matches !== 1) {
      throw new Error(matches === 0 ? "未在当前代码中找到对应修改块，请重试" : "修改块匹配到多个位置，为避免误改已拒绝应用");
    }
    result = result.replace(search, replace);
  }

  for (const item of prohibitedPatterns) {
    if (!item.pattern.test(source) && item.pattern.test(result)) {
      throw new Error(`局部修改包含不允许的${item.label}，已拒绝应用`);
    }
  }
  return result;
}
