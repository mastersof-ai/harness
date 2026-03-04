import { Box, Text, useInput } from "ink";
import React, { useEffect, useRef, useState } from "react";
import { openEditorSync } from "../lib/editor.js";
import { inkClear } from "../lib/ink-clear.js";

interface MultilineInputProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  availableWidth: number;
  history?: string[];
}

interface CursorState {
  lines: string[];
  row: number;
  col: number;
}

function wordBoundaryBack(line: string, col: number): number {
  let pos = col;
  while (pos > 0 && !/\w/.test(line[pos - 1])) pos--;
  while (pos > 0 && /\w/.test(line[pos - 1])) pos--;
  return pos;
}

function wordBoundaryForward(line: string, col: number): number {
  let pos = col;
  while (pos < line.length && /\w/.test(line[pos])) pos++;
  while (pos < line.length && !/\w/.test(line[pos])) pos++;
  return pos;
}

export function MultilineInput({
  onSubmit,
  isDisabled,
  isStreaming = false,
  placeholder,
  availableWidth,
  history = [],
}: MultilineInputProps) {
  const [state, setState] = useState<CursorState>({ lines: [""], row: 0, col: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  // History navigation: -1 = at draft (current input), 0 = most recent, etc.
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef("");

  useInput(
    (input, key) => {
      // ── Submit / Newline ─────────────────────────────────────────

      // Ctrl+J / Ctrl+Enter → insert newline
      if ((input === "j" && key.ctrl) || (key.return && key.ctrl)) {
        setState(({ lines, row, col }) => {
          const before = lines[row].slice(0, col);
          const after = lines[row].slice(col);
          const next = [...lines];
          next.splice(row, 1, before, after);
          return { lines: next, row: row + 1, col: 0 };
        });
        return;
      }

      // Enter → submit
      if (key.return) {
        const text = stateRef.current.lines.join("\n");
        setState({ lines: [""], row: 0, col: 0 });
        setHistoryIndex(-1);
        draftRef.current = "";
        onSubmit(text);
        return;
      }

      // ── External Editor ──────────────────────────────────────────

      // Ctrl+G → open external editor
      if (input === "g" && key.ctrl) {
        setTimeout(() => {
          const text = stateRef.current.lines.join("\n");
          const { stdin } = process;

          if (stdin.isTTY) stdin.setRawMode(false);
          const result = openEditorSync(text);

          if (stdin.isTTY) stdin.setRawMode(true);
          stdin.resume();
          stdin.setEncoding("utf-8");
          inkClear();

          if (result !== null) {
            const newLines = result.replace(/\n$/, "").split("\n");
            if (newLines.length === 0) newLines.push("");
            const lastRow = newLines.length - 1;
            setState({ lines: newLines, row: lastRow, col: newLines[lastRow].length });
          } else {
            setState((prev) => ({ ...prev }));
          }
        }, 0);
        return;
      }

      // ── Line Navigation ──────────────────────────────────────────

      // Ctrl-A → beginning of line
      if (input === "a" && key.ctrl) {
        setState((s) => ({ ...s, col: 0 }));
        return;
      }

      // Ctrl-E → end of line
      if (input === "e" && key.ctrl) {
        setState((s) => ({ ...s, col: s.lines[s.row].length }));
        return;
      }

      // ── Word Navigation ──────────────────────────────────────────

      // Alt-B or Ctrl-Left or Alt-Left → word backward
      if ((input === "b" && key.meta) || (key.leftArrow && (key.ctrl || key.meta))) {
        setState(({ lines, row, col }) => {
          if (col > 0) return { lines, row, col: wordBoundaryBack(lines[row], col) };
          if (row > 0) return { lines, row: row - 1, col: lines[row - 1].length };
          return { lines, row, col };
        });
        return;
      }

      // Alt-F or Ctrl-Right or Alt-Right → word forward
      if ((input === "f" && key.meta) || (key.rightArrow && (key.ctrl || key.meta))) {
        setState(({ lines, row, col }) => {
          if (col < lines[row].length) return { lines, row, col: wordBoundaryForward(lines[row], col) };
          if (row < lines.length - 1) return { lines, row: row + 1, col: 0 };
          return { lines, row, col };
        });
        return;
      }

      // ── Line Editing ─────────────────────────────────────────────

      // Ctrl-D → delete character under cursor (forward delete)
      if (input === "d" && key.ctrl) {
        setState(({ lines, row, col }) => {
          if (col < lines[row].length) {
            const next = [...lines];
            next[row] = lines[row].slice(0, col) + lines[row].slice(col + 1);
            return { lines: next, row, col };
          }
          // At end of line: merge with next line
          if (row < lines.length - 1) {
            const next = [...lines];
            next[row] += lines[row + 1];
            next.splice(row + 1, 1);
            return { lines: next, row, col };
          }
          return { lines, row, col };
        });
        return;
      }

      // Ctrl-K → kill from cursor to end of line
      if (input === "k" && key.ctrl) {
        setState(({ lines, row, col }) => {
          const next = [...lines];
          next[row] = lines[row].slice(0, col);
          return { lines: next, row, col };
        });
        return;
      }

      // Ctrl-U → kill from cursor to beginning of line
      if (input === "u" && key.ctrl) {
        setState(({ lines, row, col }) => {
          const next = [...lines];
          next[row] = lines[row].slice(col);
          return { lines: next, row, col: 0 };
        });
        return;
      }

      // Ctrl-W or Alt-Backspace → delete word backward
      if ((input === "w" && key.ctrl) || (key.meta && (key.backspace || key.delete))) {
        setState(({ lines, row, col }) => {
          if (col === 0) return { lines, row, col };
          const boundary = wordBoundaryBack(lines[row], col);
          const next = [...lines];
          next[row] = lines[row].slice(0, boundary) + lines[row].slice(col);
          return { lines: next, row, col: boundary };
        });
        return;
      }

      // Alt-D → delete word forward
      if (input === "d" && key.meta) {
        setState(({ lines, row, col }) => {
          if (col >= lines[row].length) return { lines, row, col };
          const boundary = wordBoundaryForward(lines[row], col);
          const next = [...lines];
          next[row] = lines[row].slice(0, col) + lines[row].slice(boundary);
          return { lines: next, row, col };
        });
        return;
      }

      // Ctrl-T → transpose characters before cursor
      if (input === "t" && key.ctrl) {
        setState(({ lines, row, col }) => {
          if (col === 0 || lines[row].length < 2) return { lines, row, col };
          const pos = col === lines[row].length ? col - 1 : col;
          const chars = lines[row].split("");
          [chars[pos - 1], chars[pos]] = [chars[pos], chars[pos - 1]];
          const next = [...lines];
          next[row] = chars.join("");
          return { lines: next, row, col: Math.min(pos + 1, next[row].length) };
        });
        return;
      }

      // ── Clear ────────────────────────────────────────────────────
      // Home/End/Delete are handled via raw stdin data listener below.
      // Guard against escape sequences so only bare Escape clears input.

      if (key.escape && !input && !isStreaming) {
        setState({ lines: [""], row: 0, col: 0 });
        setHistoryIndex(-1);
        draftRef.current = "";
        return;
      }

      // ── Arrow Keys ───────────────────────────────────────────────

      // Left arrow — wrap to end of previous line
      if (key.leftArrow) {
        setState(({ lines, row, col }) => {
          if (col > 0) return { lines, row, col: col - 1 };
          if (row > 0) return { lines, row: row - 1, col: lines[row - 1].length };
          return { lines, row, col };
        });
        return;
      }

      // Right arrow — wrap to start of next line
      if (key.rightArrow) {
        setState(({ lines, row, col }) => {
          if (col < lines[row].length) return { lines, row, col: col + 1 };
          if (row < lines.length - 1) return { lines, row: row + 1, col: 0 };
          return { lines, row, col };
        });
        return;
      }

      // Up arrow — history when on first row, otherwise move cursor
      if (key.upArrow) {
        const s = stateRef.current;
        if (s.row > 0) {
          // Multi-line: move cursor up within text
          setState(({ lines, row, col }) => ({
            lines,
            row: row - 1,
            col: Math.min(col, lines[row - 1].length),
          }));
        } else if (history.length > 0) {
          // On first row: navigate history
          const nextIdx = historyIndex + 1;
          if (nextIdx >= history.length) return; // already at oldest
          if (historyIndex === -1) {
            // Save current input as draft
            draftRef.current = s.lines.join("\n");
          }
          setHistoryIndex(nextIdx);
          const entry = history[history.length - 1 - nextIdx];
          const newLines = entry.split("\n");
          setState({
            lines: newLines,
            row: 0,
            col: 0,
          });
        }
        return;
      }

      // Down arrow — history when on last row, otherwise move cursor
      if (key.downArrow) {
        const s = stateRef.current;
        if (s.row < s.lines.length - 1) {
          // Multi-line: move cursor down within text
          setState(({ lines, row, col }) => ({
            lines,
            row: row + 1,
            col: Math.min(col, lines[row + 1].length),
          }));
        } else if (historyIndex >= 0) {
          // On last row and in history mode: navigate forward
          const nextIdx = historyIndex - 1;
          if (nextIdx < 0) {
            // Restore draft
            setHistoryIndex(-1);
            const newLines = draftRef.current.split("\n");
            const lastRow = newLines.length - 1;
            setState({
              lines: newLines,
              row: lastRow,
              col: newLines[lastRow].length,
            });
          } else {
            setHistoryIndex(nextIdx);
            const entry = history[history.length - 1 - nextIdx];
            const newLines = entry.split("\n");
            const lastRow = newLines.length - 1;
            setState({
              lines: newLines,
              row: lastRow,
              col: newLines[lastRow].length,
            });
          }
        }
        return;
      }

      // ── Backspace ────────────────────────────────────────────────

      // Ink maps 0x08 (BS) → key.backspace, 0x7F (DEL) → key.delete.
      // Most terminals (including tmux) send 0x7F for the Backspace key.
      // The real Delete key sends ESC[3~ which Ink doesn't surface as key.delete.
      // So both flags mean "backspace" in practice.
      if (key.backspace || key.delete) {
        setState(({ lines, row, col }) => {
          if (col > 0) {
            const next = [...lines];
            next[row] = lines[row].slice(0, col - 1) + lines[row].slice(col);
            return { lines: next, row, col: col - 1 };
          }
          if (row > 0) {
            const newCol = lines[row - 1].length;
            const next = [...lines];
            next[row - 1] += lines[row];
            next.splice(row, 1);
            return { lines: next, row: row - 1, col: newCol };
          }
          return { lines, row, col };
        });
        return;
      }

      // ── Printable Input ──────────────────────────────────────────

      if (input && !key.ctrl && !key.meta) {
        setState(({ lines, row, col }) => {
          const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          if (normalized.includes("\n")) {
            const parts = normalized.split("\n");
            const before = lines[row].slice(0, col);
            const after = lines[row].slice(col);
            const next = [...lines];
            next.splice(row, 1, before + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + after);
            const newRow = row + parts.length - 1;
            return { lines: next, row: newRow, col: parts[parts.length - 1].length };
          }
          const next = [...lines];
          next[row] = lines[row].slice(0, col) + input + lines[row].slice(col);
          return { lines: next, row, col: col + input.length };
        });
      }
    },
    { isActive: !isDisabled },
  );

  // ── Home / End / Delete via raw stdin data ──────────────────
  // Ink's useInput doesn't surface these keys. Listening on raw
  // stdin "data" catches the escape sequences before readline
  // parsing, which works across terminals including tmux.
  useEffect(() => {
    if (isDisabled) return;

    const handleData = (data: Buffer) => {
      const seq = data.toString();
      // Home: \x1b[H, \x1bOH, \x1b[1~, \x1b[7~
      if (seq === "\x1b[H" || seq === "\x1bOH" || seq === "\x1b[1~" || seq === "\x1b[7~") {
        setState((s) => ({ ...s, col: 0 }));
      }
      // End: \x1b[F, \x1bOF, \x1b[4~, \x1b[8~
      else if (seq === "\x1b[F" || seq === "\x1bOF" || seq === "\x1b[4~" || seq === "\x1b[8~") {
        setState((s) => ({ ...s, col: s.lines[s.row].length }));
      }
      // Delete: \x1b[3~
      else if (seq === "\x1b[3~") {
        setState(({ lines, row, col }) => {
          if (col < lines[row].length) {
            const next = [...lines];
            next[row] = lines[row].slice(0, col) + lines[row].slice(col + 1);
            return { lines: next, row, col };
          }
          if (row < lines.length - 1) {
            const next = [...lines];
            next[row] += lines[row + 1];
            next.splice(row + 1, 1);
            return { lines: next, row, col };
          }
          return { lines, row, col };
        });
      }
    };

    process.stdin.on("data", handleData);
    return () => {
      process.stdin.removeListener("data", handleData);
    };
  }, [isDisabled]);

  const isEmpty = state.lines.length === 1 && state.lines[0] === "";

  if (isEmpty && isDisabled) return null;
  if (isEmpty && placeholder) return <Text dimColor>{placeholder}</Text>;

  // Manual wrapping to avoid Ink re-render duplication when text exceeds terminal width
  const w = Math.max(10, availableWidth);
  const visualRows: { text: string; hasCursor: boolean; cursorCol: number }[] = [];

  for (let i = 0; i < state.lines.length; i++) {
    const line = state.lines[i];
    const isCurrentLine = i === state.row && !isDisabled;

    if (!isCurrentLine) {
      if (!line) {
        visualRows.push({ text: " ", hasCursor: false, cursorCol: 0 });
      } else {
        for (let pos = 0; pos < line.length; pos += w) {
          visualRows.push({ text: line.slice(pos, pos + w), hasCursor: false, cursorCol: 0 });
        }
      }
      continue;
    }

    // Current line with cursor — find visual row/col
    const cursorVRow = Math.floor(state.col / w);
    const cursorVCol = state.col % w;

    if (!line) {
      visualRows.push({ text: "", hasCursor: true, cursorCol: 0 });
      continue;
    }

    const wrapped: string[] = [];
    for (let pos = 0; pos < line.length; pos += w) {
      wrapped.push(line.slice(pos, pos + w));
    }

    // Cursor at wrap boundary past end of text needs an extra visual row
    if (state.col >= line.length && state.col > 0 && state.col % w === 0) {
      wrapped.push("");
    }

    for (let j = 0; j < wrapped.length; j++) {
      visualRows.push({
        text: wrapped[j],
        hasCursor: j === cursorVRow,
        cursorCol: j === cursorVRow ? cursorVCol : 0,
      });
    }
  }

  return (
    <Box flexDirection="column">
      {visualRows.map((vr, i) => {
        if (!vr.hasCursor) {
          // biome-ignore lint/suspicious/noArrayIndexKey: visual row position
          return <Text key={i}>{vr.text || " "}</Text>;
        }
        const before = vr.text.slice(0, vr.cursorCol);
        const cursorChar = vr.text[vr.cursorCol] ?? " ";
        const after = vr.text.slice(vr.cursorCol + 1);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: visual row position
          <Text key={i}>
            {before}
            <Text inverse>{cursorChar}</Text>
            {after}
          </Text>
        );
      })}
    </Box>
  );
}
