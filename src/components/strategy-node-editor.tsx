"use client";

import { useMemo, useState } from "react";
import { createClientUuid } from "@/lib/client-id";
import type { DiagramNode, StrategyCondition, StrategySpec } from "@/lib/agent/types";

const timeframes = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];

function newId(prefix: string) {
  return `${prefix}-${createClientUuid().slice(0, 8)}`;
}

function cloneSpec(spec: StrategySpec): StrategySpec {
  return structuredClone(spec);
}

function treeFromConditions(conditions: string[], operator: "and" | "or" = "and"): StrategyCondition {
  return {
    id: newId("group"),
    kind: "group",
    operator,
    children: conditions.map((expression) => ({ id: newId("condition"), kind: "condition" as const, expression })),
  };
}

function flattenConditions(tree: StrategyCondition): string[] {
  if (tree.kind === "condition") return [tree.expression];
  return tree.children.flatMap(flattenConditions).filter(Boolean);
}

function ConditionEditor({ tree, depth = 0, onChange, onRemove }: {
  tree: StrategyCondition;
  depth?: number;
  onChange: (tree: StrategyCondition) => void;
  onRemove?: () => void;
}) {
  if (tree.kind === "condition") {
    return (
      <div className="condition-row">
        <span className="condition-index">{depth + 1}</span>
        <input aria-label="条件表达式" value={tree.expression} onChange={(event) => onChange({ ...tree, expression: event.target.value })} placeholder="例如：EMA20 从下向上穿过 EMA50" />
        {onRemove && <button type="button" className="icon-danger" onClick={onRemove} aria-label="删除条件">×</button>}
      </div>
    );
  }

  const updateChild = (index: number, child: StrategyCondition) => onChange({ ...tree, children: tree.children.map((item, itemIndex) => itemIndex === index ? child : item) });
  const removeChild = (index: number) => onChange({ ...tree, children: tree.children.filter((_, itemIndex) => itemIndex !== index) });
  return (
    <section className={`condition-group depth-${Math.min(depth, 3)}`}>
      <header>
        <select aria-label="条件组合方式" value={tree.operator} onChange={(event) => onChange({ ...tree, operator: event.target.value as "and" | "or" })}>
          <option value="and">全部满足 AND</option>
          <option value="or">任一满足 OR</option>
        </select>
        {onRemove && <button type="button" className="text-danger" onClick={onRemove}>删除分组</button>}
      </header>
      <div className="condition-children">
        {tree.children.map((child, index) => <ConditionEditor key={child.id} tree={child} depth={depth + 1} onChange={(next) => updateChild(index, next)} onRemove={tree.children.length > 1 ? () => removeChild(index) : undefined} />)}
      </div>
      <div className="condition-add-actions">
        <button type="button" onClick={() => onChange({ ...tree, children: [...tree.children, { id: newId("condition"), kind: "condition", expression: "" }] })}>＋ 条件</button>
        {depth < 2 && <button type="button" onClick={() => onChange({ ...tree, children: [...tree.children, treeFromConditions([""])] })}>＋ 条件组</button>}
      </div>
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="node-editor-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function StrategyNodeEditor({ spec, node, disabled, onClose, onSubmit }: {
  spec: StrategySpec;
  node: DiagramNode;
  disabled?: boolean;
  onClose: () => void;
  onSubmit: (spec: StrategySpec, summary: string) => void;
}) {
  const [draft, setDraft] = useState(() => cloneSpec(spec));
  const [error, setError] = useState("");
  const binding = node.binding;

  const title = useMemo(() => {
    if (!binding) return "节点详情";
    return ({ environment: "运行环境", indicator: "指标参数", entry: "入场条件", execution: "交易执行", risk: "持仓风控", exit: "离场条件", result: "执行结果" } as const)[binding.kind];
  }, [binding]);
  const indicatorIndex = binding?.kind === "indicator" ? binding.index : -1;
  const entryIndex = binding?.kind === "entry" ? binding.index : -1;

  function commit() {
    setError("");
    if (!binding || !node.editable) return;
    if (!draft.symbol.trim() || !draft.timeframe.trim()) return setError("品种和周期不能为空。"), undefined;
    if (draft.risk.riskPerTradePercent < 0 || draft.risk.riskPerTradePercent > 100) return setError("单笔风险必须在 0% 到 100% 之间。"), undefined;
    if (draft.entryRules.some((rule) => !rule.conditions.length || rule.conditions.some((item) => !item.trim())) || draft.exitRules.some((item) => !item.trim())) return setError("条件表达式不能为空。"), undefined;
    onSubmit(draft, `${title}：${node.label}`);
  }

  function setEntryTree(index: number, tree: StrategyCondition) {
    setDraft((current) => ({ ...current, entryRules: current.entryRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, conditionTree: tree, conditions: flattenConditions(tree) } : rule) }));
  }

  function setExitTree(tree: StrategyCondition) {
    setDraft((current) => ({ ...current, exitConditionTree: tree, exitRules: flattenConditions(tree) }));
  }

  function deleteIndicator(index: number) {
    const indicator = draft.indicators[index];
    const references = [...draft.entryRules.flatMap((rule) => rule.conditions), ...draft.exitRules].filter((condition) => condition.toLowerCase().includes(indicator.name.toLowerCase()) || condition.toLowerCase().includes(indicator.id.toLowerCase()));
    if (references.length) {
      setError(`无法删除“${indicator.name}”，仍被 ${references.length} 条入场或离场条件引用。`);
      return;
    }
    const next = cloneSpec(draft);
    next.indicators.splice(index, 1);
    onSubmit(next, `删除指标：${indicator.name}`);
  }

  if (!binding) return null;
  const indicator = indicatorIndex >= 0 ? draft.indicators[indicatorIndex] : null;
  const entryRule = entryIndex >= 0 ? draft.entryRules[entryIndex] : null;

  return (
    <aside className="strategy-node-editor" aria-label={`${title}编辑器`}>
      <header><div><small>NODE EDITOR</small><h3>{title}</h3><p>{node.label}</p></div><button type="button" onClick={onClose} aria-label="关闭编辑器">×</button></header>
      <div className="node-editor-body">
        {binding.kind === "environment" && <>
          <Field label="交易品种" hint="例如 EURUSD、XAUUSD，使用 CURRENT 表示图表品种"><input value={draft.symbol} onChange={(event) => setDraft({ ...draft, symbol: event.target.value.toUpperCase() })} /></Field>
          <Field label="运行周期"><select value={draft.timeframe} onChange={(event) => setDraft({ ...draft, timeframe: event.target.value })}>{timeframes.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <div className="editor-impact-note">全局修改：品种或周期变化可能影响全部指标句柄和交易条件，提交后将重新编译验证。</div>
        </>}

        {indicator && <>
          <Field label="指标名称"><input value={indicator.name} onChange={(event) => setDraft({ ...draft, indicators: draft.indicators.map((item, index) => index === indicatorIndex ? { ...item, name: event.target.value } : item) })} /></Field>
          <div className="parameter-editor"><span>参数</span>{Object.entries(indicator.parameters).map(([key, value]) => <div key={key}><input aria-label="参数名" defaultValue={key} onBlur={(event) => { const nextKey = event.target.value.trim(); if (!nextKey || nextKey === key) return; const parameters = { ...indicator.parameters }; delete parameters[key]; parameters[nextKey] = value; setDraft({ ...draft, indicators: draft.indicators.map((item, index) => index === indicatorIndex ? { ...item, parameters } : item) }); }} /><input aria-label={`${key}参数值`} value={String(value)} onChange={(event) => { const raw = event.target.value; const nextValue = typeof value === "number" && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : typeof value === "boolean" ? raw === "true" : raw; setDraft({ ...draft, indicators: draft.indicators.map((item, index) => index === indicatorIndex ? { ...item, parameters: { ...item.parameters, [key]: nextValue } } : item) }); }} /><button type="button" className="icon-danger" onClick={() => { const parameters = { ...indicator.parameters }; delete parameters[key]; setDraft({ ...draft, indicators: draft.indicators.map((item, index) => index === indicatorIndex ? { ...item, parameters } : item) }); }}>×</button></div>)}</div>
          <button type="button" className="secondary-editor-button" onClick={() => setDraft({ ...draft, indicators: draft.indicators.map((item, index) => index === indicatorIndex ? { ...item, parameters: { ...item.parameters, [`parameter${Object.keys(item.parameters).length + 1}`]: 0 } } : item) })}>＋ 添加参数</button>
          <button type="button" className="danger-editor-button" onClick={() => deleteIndicator(indicatorIndex)}>删除此指标</button>
        </>}

        {entryRule && <>
          <Field label="交易方向"><select value={entryRule.side} onChange={(event) => setDraft({ ...draft, entryRules: draft.entryRules.map((rule, index) => index === entryIndex ? { ...rule, side: event.target.value as "long" | "short" | "both" } : rule) })}><option value="long">做多</option><option value="short">做空</option><option value="both">双向</option></select></Field>
          <div className="condition-editor-label"><span>嵌套条件</span><small>最多支持 3 层；节点只显示摘要</small></div>
          <ConditionEditor tree={entryRule.conditionTree ?? treeFromConditions(entryRule.conditions)} onChange={(tree) => setEntryTree(entryIndex, tree)} />
        </>}

        {binding.kind === "execution" && <Field label="仓位计算方式"><textarea rows={5} value={draft.risk.sizingMethod} onChange={(event) => setDraft({ ...draft, risk: { ...draft.risk, sizingMethod: event.target.value } })} /></Field>}

        {binding.kind === "risk" && <>
          <Field label="单笔风险 (%)"><input type="number" min="0" max="100" step="0.1" value={draft.risk.riskPerTradePercent} onChange={(event) => setDraft({ ...draft, risk: { ...draft.risk, riskPerTradePercent: Number(event.target.value) } })} /></Field>
          <Field label="最大持仓"><input type="number" min="1" max="100" value={draft.risk.maxPositions} onChange={(event) => setDraft({ ...draft, risk: { ...draft.risk, maxPositions: Number(event.target.value) } })} /></Field>
          <Field label="止损规则"><textarea rows={3} value={draft.risk.stopLoss} onChange={(event) => setDraft({ ...draft, risk: { ...draft.risk, stopLoss: event.target.value } })} /></Field>
          <Field label="止盈规则"><textarea rows={3} value={draft.risk.takeProfit} onChange={(event) => setDraft({ ...draft, risk: { ...draft.risk, takeProfit: event.target.value } })} /></Field>
          {draft.risk.riskPerTradePercent > 5 && <div className="editor-warning">单笔风险高于 5%，应用前请确认最大连续亏损承受能力。</div>}
        </>}

        {binding.kind === "exit" && <>
          <div className="condition-editor-label"><span>嵌套离场条件</span><small>根分组控制条件间的 AND/OR 关系</small></div>
          <ConditionEditor tree={draft.exitConditionTree ?? treeFromConditions(draft.exitRules, "or")} onChange={setExitTree} />
        </>}

        {binding.kind === "result" && <div className="editor-impact-note">结果节点由离场规则和风控设置自动生成，不支持直接编辑。</div>}
        {error && <div className="node-editor-error">{error}</div>}
      </div>
      {node.editable && <footer><button type="button" onClick={onClose}>取消</button><button type="button" onClick={commit} disabled={disabled}>{disabled ? "正在生成…" : "提交修改"}</button></footer>}
    </aside>
  );
}
