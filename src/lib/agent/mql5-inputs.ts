import type { Mql5InputParameter } from "./types";

const groupPattern = /^\s*\/\/\s*={3,}\s*(.+?)\s*={3,}\s*$/;
const inputPattern = /^\s*input\s+(bool|int|long|double|string|datetime|ENUM_[A-Za-z0-9_]+)\s+([A-Za-z_]\w*)\s*=\s*([^;]+);\s*(?:\/\/\s*(.*))?$/;

function normalizeType(type: string): Mql5InputParameter["type"] {
  if (type.startsWith("ENUM_")) return "enum";
  return type as Mql5InputParameter["type"];
}

export function extractMql5InputParameters(code: string): Mql5InputParameter[] {
  let group = "基本设置";
  const parameters: Mql5InputParameter[] = [];

  for (const line of code.split(/\r?\n/)) {
    const groupMatch = line.match(groupPattern);
    if (groupMatch) {
      group = groupMatch[1].trim();
      continue;
    }
    const inputMatch = line.match(inputPattern);
    if (!inputMatch) continue;
    const [, type, name, value, comment] = inputMatch;
    parameters.push({ name, type: normalizeType(type), value: value.trim(), ...(comment?.trim() ? { comment: comment.trim() } : {}), group });
  }
  return parameters;
}