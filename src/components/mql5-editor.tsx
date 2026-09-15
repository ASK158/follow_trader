"use client";

import { useEffect, useRef } from "react";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";

type Mql5EditorProps = {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  highlightedBlocks?: string[];
};

function configureMonacoWorker() {
  const globalScope = self as typeof globalThis & {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker };
  };
  if (globalScope.MonacoEnvironment) return;

  globalScope.MonacoEnvironment = {
    getWorker() {
      return new Worker(new URL("monaco-editor/editor/editor.worker", import.meta.url));
    },
  };
}

export function Mql5Editor({ value, readOnly, onChange, highlightedBlocks = [] }: Mql5EditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const changeListenerRef = useRef<IDisposable | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const initialReadOnlyRef = useRef(readOnly);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let disposed = false;
    let editor: MonacoEditor.IStandaloneCodeEditor | null = null;

    configureMonacoWorker();
    void import("monaco-editor")
      .then((monaco) => {
        if (disposed || !containerRef.current) return;
        monaco.languages.register({ id: "mql5" });
        monaco.languages.setMonarchTokensProvider("mql5", {
          tokenizer: {
            root: [
              [/\b(?:#property|#include|#define|#import)\b/, "keyword"],
              [/\b(?:void|int|double|bool|string|datetime|long|ulong|enum|class|struct|return|if|else|for|while|switch|case|break|continue|new|delete|true|false)\b/, "keyword"],
              [/\b(?:OnInit|OnDeinit|OnTick|CTrade|PositionSelect|CopyBuffer|iMA|iRSI|OrderSend)\b/, "type.identifier"],
              [/"[^"\\]*(?:\\.[^"\\]*)*"/, "string"],
              [/\/\/.*$/, "comment"],
              [/\/\*/, "comment", "@comment"],
              [/\d+(?:\.\d+)?/, "number"],
            ],
            comment: [[/\*\//, "comment", "@pop"], [/./, "comment"]],
          },
        });
        monaco.editor.defineTheme("sigma-mql5", {
          base: "vs",
          inherit: true,
          rules: [{ token: "keyword", foreground: "A31229", fontStyle: "bold" }, { token: "comment", foreground: "877E73" }, { token: "type.identifier", foreground: "6F3E45" }, { token: "string", foreground: "28745A" }, { token: "number", foreground: "9A5B24" }],
          colors: { "editor.background": "#FAF6EF", "editor.foreground": "#292520", "editorLineNumber.foreground": "#A69C90", "editor.lineHighlightBackground": "#EEE6DA", "editor.selectionBackground": "#DDBDC2", "editorCursor.foreground": "#B4162B", "editorIndentGuide.background1": "#DED5C9" },
        });
        editor = monaco.editor.create(containerRef.current, {
          value: initialValueRef.current,
          language: "mql5",
          theme: "sigma-mql5",
          readOnly: initialReadOnlyRef.current,
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 21,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          padding: { top: 16 },
        });
        editorRef.current = editor;
        changeListenerRef.current = editor.onDidChangeModelContent(() => onChangeRef.current(editor?.getValue() ?? ""));
      })
      .catch((error: unknown) => {
        if (!disposed) console.error("MQL5 编辑器加载失败", error);
      });

    return () => {
      disposed = true;
      changeListenerRef.current?.dispose();
      changeListenerRef.current = null;
      editor?.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) editor.setValue(value);
  }, [value]);

  useEffect(() => editorRef.current?.updateOptions({ readOnly }), [readOnly]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const decorations = highlightedBlocks.flatMap((block) => {
      const startOffset = value.indexOf(block);
      if (startOffset < 0) return [];
      const start = model.getPositionAt(startOffset);
      const end = model.getPositionAt(startOffset + block.length);
      return [{ range: { startLineNumber: start.lineNumber, startColumn: 1, endLineNumber: end.lineNumber, endColumn: model.getLineMaxColumn(end.lineNumber) }, options: { isWholeLine: true, className: "mql5-change-highlight", linesDecorationsClassName: "mql5-change-gutter" } }];
    });
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [highlightedBlocks, value]);

  return <div ref={containerRef} className="mql5-editor" aria-label="MQL5 代码编辑器" />;
}