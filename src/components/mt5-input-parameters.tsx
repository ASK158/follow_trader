"use client";

import type { Mql5InputParameter } from "@/lib/agent/types";

const typeIcon = {
  bool: "✓",
  int: "01",
  long: "01",
  double: "½",
  string: "≡",
  datetime: "◷",
  enum: "☷",
};

export function Mt5InputParameters({ parameters }: { parameters: Mql5InputParameter[] }) {
  if (!parameters.length) return <div className="artifact-empty">未从生成的 EA 代码中识别到 <code>input</code> 参数。</div>;

  const groups = parameters.reduce<Array<{ name: string; parameters: Mql5InputParameter[] }>>((result, parameter) => {
    const name = parameter.group || "基本设置";
    const group = result.at(-1);
    if (group?.name === name) group.parameters.push(parameter);
    else result.push({ name, parameters: [parameter] });
    return result;
  }, []);

  return (
    <div className="mt5-parameters">
      <div className="mt5-parameter-tabs"><span>普通</span><span className="active">输入</span></div>
      <div className="mt5-table" role="table" aria-label="MQL5 输入参数">
        <div className="mt5-row mt5-header" role="row"><b role="columnheader">可变</b><b role="columnheader">值</b></div>
        {groups.map((group) => <div key={group.name}><div className="mt5-group">=== {group.name} ===</div>{group.parameters.map((parameter) => <div key={parameter.name} className="mt5-row" role="row"><span role="cell"><i className={`mt5-type ${parameter.type}`}>{typeIcon[parameter.type]}</i>{parameter.comment || parameter.name}</span><span className="mt5-value" role="cell">{parameter.value}</span></div>)}</div>)}
      </div>
    </div>
  );
}