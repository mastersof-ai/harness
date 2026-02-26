import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { Box, Text, useApp, useInput } from "ink";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { buildOptions, buildSystemPrompt, sendMessage } from "../agent.js";
import type { AgentContext } from "../agent-context.js";
import type { HarnessConfig } from "../config.js";
import {
  createSessionMeta,
  findSessionByName,
  getLastSessionId,
  listSessions,
  loadSession,
  relativeTime,
  renameSession,
  type SessionDirs,
  type SessionMeta,
  saveSession,
  touchSession,
} from "../sessions.js";
import { ChatHistory } from "./ChatHistory.js";
import { InputArea } from "./InputArea.js";
import type { MessageData } from "./Message.js";
import { StreamingResponse } from "./StreamingResponse.js";

const marked = new Marked(markedTerminal());

function renderMarkdown(text: string): string {
  const rendered = marked.parse(text);
  if (typeof rendered !== "string") return text;
  return rendered.replace(/\n+$/, "");
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  return `${Math.round(n / 1000)}K`;
}

function totalInputTokens(usage: any): number {
  return (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);
}

const MAX_CONTEXT = 200_000;

export interface ToolAction {
  name: string;
  detail?: string;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function extractToolDetail(name: string, input: Record<string, unknown>): string {
  const str = (key: string) => {
    const v = input[key];
    return typeof v === "string" ? v : "";
  };
  switch (name) {
    case "shell_exec":
      return truncate(str("command"), 80);
    case "write_file":
    case "read_file":
      return str("path");
    case "list_files":
      return str("path") || "";
    case "memory_read":
    case "memory_write":
      return str("filename");
    case "web_search":
      return truncate(str("query"), 80);
    case "web_fetch":
      return truncate(str("url"), 80);
    default: {
      const first = Object.entries(input).find(([, v]) => typeof v === "string" && (v as string).length < 100);
      return first ? truncate(first[1] as string, 80) : "";
    }
  }
}

function agentBanner(name: string): string {
  const displayName = name.toUpperCase();
  const padded = displayName.padStart(Math.floor((31 + displayName.length) / 2)).padEnd(31);
  return `  ╔═══════════════════════════════════════╗
  ║  ${padded}      ║
  ║                                       ║
  ║  /sessions — list recent sessions     ║
  ║  /resume [name|#N] — resume session   ║
  ║  /name <text> — rename session        ║
  ║  /new — start fresh  /quit — exit     ║
  ╚═══════════════════════════════════════╝`;
}

interface AppState {
  messages: MessageData[];
  streamBuffer: string;
  thinkingBuffer: string;
  isStreaming: boolean;
  lastResponse: string | null;
  sessionId: string | null;
  sessionName: string | null;
  lastListing: SessionMeta[] | null;
  error: string | null;
  inputKey: number;
  contextTokens: number;
  toolActions: ToolAction[];
  agentName: string;
}

type Action =
  | { type: "ADD_USER_MESSAGE"; content: string }
  | { type: "ADD_SYSTEM_MESSAGE"; content: string }
  | { type: "STREAM_START" }
  | { type: "STREAM_TOKEN"; token: string }
  | { type: "THINKING_TOKEN"; token: string }
  | { type: "MESSAGE_COMPLETE"; rendered: string }
  | { type: "SET_SESSION"; sessionId: string | null }
  | { type: "SET_SESSION_NAME"; name: string | null }
  | { type: "SET_LISTING"; listing: SessionMeta[] | null }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RESET_INPUT" }
  | { type: "UPDATE_CONTEXT"; tokens: number }
  | { type: "TOOL_USE"; name: string }
  | { type: "TOOL_USE_DETAIL"; detail: string };

function reducer(state: AppState, action: Action): AppState {
  const assistantMsg = (content: string): MessageData => ({
    role: "assistant",
    content,
    agentName: state.agentName,
  });

  const flushPrevious = (): MessageData[] =>
    state.lastResponse !== null ? [...state.messages, assistantMsg(state.lastResponse)] : state.messages;

  switch (action.type) {
    case "ADD_USER_MESSAGE":
      return {
        ...state,
        messages: [...flushPrevious(), { role: "user", content: action.content }],
        lastResponse: null,
        error: null,
      };
    case "ADD_SYSTEM_MESSAGE":
      return {
        ...state,
        messages: [...flushPrevious(), { role: "system", content: action.content }],
        lastResponse: null,
      };
    case "STREAM_START":
      return {
        ...state,
        // Flush previous dynamic response into Static before starting a new one
        messages: flushPrevious(),
        lastResponse: null,
        streamBuffer: "",
        thinkingBuffer: "",
        isStreaming: true,
        error: null,
        toolActions: [],
      };
    case "STREAM_TOKEN":
      return { ...state, streamBuffer: state.streamBuffer + action.token };
    case "THINKING_TOKEN":
      return { ...state, thinkingBuffer: state.thinkingBuffer + action.token };
    case "MESSAGE_COMPLETE":
      return {
        ...state,
        messages: action.rendered ? [...state.messages, assistantMsg(action.rendered)] : state.messages,
        lastResponse: null,
        streamBuffer: "",
        thinkingBuffer: "",
        isStreaming: false,
        toolActions: [],
      };
    case "TOOL_USE":
      return { ...state, toolActions: [...state.toolActions, { name: action.name }] };
    case "TOOL_USE_DETAIL": {
      if (state.toolActions.length === 0) return state;
      const updated = [...state.toolActions];
      updated[updated.length - 1] = { ...updated[updated.length - 1], detail: action.detail };
      return { ...state, toolActions: updated };
    }
    case "SET_SESSION":
      return { ...state, sessionId: action.sessionId };
    case "SET_SESSION_NAME":
      return { ...state, sessionName: action.name };
    case "SET_LISTING":
      return { ...state, lastListing: action.listing };
    case "SET_ERROR":
      return { ...state, error: action.error, isStreaming: false, streamBuffer: "", thinkingBuffer: "" };
    case "RESET_INPUT":
      return { ...state, inputKey: state.inputKey + 1 };
    case "UPDATE_CONTEXT":
      return { ...state, contextTokens: action.tokens };
  }
}

function initialMessages(banner: string, sessionId: string | null): MessageData[] {
  return [
    { role: "system", content: banner },
    { role: "system", content: `[${sessionId ? "Resuming previous session" : "New session started"}]` },
  ];
}

function ContextBar({ tokens }: { tokens: number }) {
  const pct = Math.min(100, Math.round((tokens / MAX_CONTEXT) * 100));
  const width = 16;
  const filled = Math.round((pct / 100) * width);

  let barColor: string;
  if (pct >= 75) barColor = "redBright";
  else if (pct >= 50) barColor = "yellowBright";
  else barColor = "greenBright";

  return (
    <Box>
      <Text color={barColor}>{"█".repeat(filled)}</Text>
      <Text color="gray">{"░".repeat(width - filled)}</Text>
      <Text dimColor>
        {" "}
        {formatTokens(tokens)}/{formatTokens(MAX_CONTEXT)}
      </Text>
    </Box>
  );
}

export interface AppProps {
  initialSessionId: string | null;
  initialSessionName: string | null;
  agentContext: AgentContext;
  config: HarnessConfig;
}

export function App({ initialSessionId, initialSessionName, agentContext, config }: AppProps) {
  const { exit } = useApp();

  const banner = useMemo(() => agentBanner(agentContext.name), [agentContext.name]);
  const sessionDirs: SessionDirs = useMemo(
    () => ({ sessionsDir: agentContext.sessionsDir, lastSessionFile: agentContext.lastSessionFile }),
    [agentContext.sessionsDir, agentContext.lastSessionFile],
  );

  const [state, dispatch] = useReducer(reducer, {
    messages: initialMessages(banner, initialSessionId),
    streamBuffer: "",
    thinkingBuffer: "",
    isStreaming: false,
    lastResponse: null,
    sessionId: initialSessionId,
    sessionName: initialSessionName,
    lastListing: null,
    error: null,
    inputKey: 0,
    contextTokens: 0,
    toolActions: [],
    agentName: agentContext.name,
  });

  // Tool input accumulation for extracting details
  const toolInputRef = useRef("");
  const toolNameRef = useRef("");
  const inToolUseRef = useRef(false);

  // Command history
  const historyRef = useRef<string[]>([]);

  // Message queue — allows input while streaming
  const queueRef = useRef<string[]>([]);
  const [queueCount, setQueueCount] = useState(0);

  // Active query for interrupt support
  const activeQueryRef = useRef<Query | null>(null);
  const isStreamingRef = useRef(false);

  // Double Ctrl-C to exit
  const [ctrlCWarning, setCtrlCWarning] = useState(false);
  const ctrlCTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useInput((input, key) => {
    // Escape → interrupt streaming
    if (key.escape && isStreamingRef.current && activeQueryRef.current) {
      activeQueryRef.current.interrupt();
      queueRef.current = [];
      setQueueCount(0);
      return;
    }

    // Double Ctrl-C to exit
    const isCtrlC = input === "\x03" || (input === "c" && key.ctrl);
    if (!isCtrlC) return;

    if (ctrlCWarning) {
      exit();
      return;
    }

    setCtrlCWarning(true);
    if (ctrlCTimer.current) clearTimeout(ctrlCTimer.current);
    ctrlCTimer.current = setTimeout(() => setCtrlCWarning(false), 2000);
  });

  useEffect(() => {
    return () => {
      if (ctrlCTimer.current) clearTimeout(ctrlCTimer.current);
    };
  }, []);

  const processMessage = useCallback(
    async (trimmed: string) => {
      dispatch({ type: "ADD_USER_MESSAGE", content: trimmed });
      dispatch({ type: "STREAM_START" });
      isStreamingRef.current = true;

      try {
        const systemPrompt = await buildSystemPrompt(agentContext);
        const options = buildOptions(
          agentContext,
          {
            resume: state.sessionId ?? undefined,
            systemPrompt,
          },
          config,
        );

        let responseBuffer = "";
        let activeSessionId = state.sessionId;
        let wasInterrupted = false;

        const q = sendMessage(trimmed, options);
        activeQueryRef.current = q;

        for await (const msg of q) {
          if (msg.type === "system" && (msg as any).subtype === "init" && msg.session_id) {
            activeSessionId = msg.session_id;
            dispatch({ type: "SET_SESSION", sessionId: msg.session_id });
            if (!state.sessionId) {
              const meta = createSessionMeta(msg.session_id, trimmed);
              await saveSession(sessionDirs, meta);
              dispatch({ type: "SET_SESSION_NAME", name: meta.name });
            }
          }

          if (msg.type === "stream_event") {
            const event = (msg as any).event;

            if (event?.type === "message_start" && event.message?.usage) {
              dispatch({ type: "UPDATE_CONTEXT", tokens: totalInputTokens(event.message.usage) });
            }

            if (event?.type === "content_block_start" && event.content_block?.type === "tool_use") {
              const raw = event.content_block.name ?? "unknown";
              const clean = raw.replace(/^mcp__.+?__/, "");
              dispatch({ type: "TOOL_USE", name: clean });
              toolNameRef.current = clean;
              toolInputRef.current = "";
              inToolUseRef.current = true;
            }

            if (
              event?.type === "content_block_delta" &&
              event.delta?.type === "input_json_delta" &&
              inToolUseRef.current
            ) {
              toolInputRef.current += event.delta.partial_json;
            }

            if (event?.type === "content_block_stop" && inToolUseRef.current) {
              inToolUseRef.current = false;
              try {
                const input = JSON.parse(toolInputRef.current);
                const detail = extractToolDetail(toolNameRef.current, input);
                if (detail) dispatch({ type: "TOOL_USE_DETAIL", detail });
              } catch {}
            }

            if (
              event?.type === "content_block_delta" &&
              event.delta?.type === "thinking_delta" &&
              event.delta.thinking
            ) {
              dispatch({ type: "THINKING_TOKEN", token: event.delta.thinking });
            }

            if (event?.type === "content_block_start" && event.content_block?.type === "text") {
              if (responseBuffer.length > 0) {
                responseBuffer += "\n\n";
                dispatch({ type: "STREAM_TOKEN", token: "\n\n" });
              }
            }

            if (event?.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
              responseBuffer += event.delta.text;
              dispatch({ type: "STREAM_TOKEN", token: event.delta.text });
            }
          }

          if (msg.type === "assistant") {
            const usage = (msg as any).message?.usage;
            if (usage) {
              dispatch({ type: "UPDATE_CONTEXT", tokens: totalInputTokens(usage) });
            }

            if (!responseBuffer) {
              const text = (msg as any).message?.content
                ?.filter((block: any) => block.type === "text")
                .map((block: any) => block.text)
                .join("");
              if (text) {
                responseBuffer = text;
              }
            }
          }

          if (msg.type === "result" && (msg as any).is_interrupted) {
            wasInterrupted = true;
          }
        }

        activeQueryRef.current = null;
        isStreamingRef.current = false;

        const suffix = wasInterrupted ? "\n\n[interrupted]" : "";
        if (responseBuffer) {
          dispatch({ type: "MESSAGE_COMPLETE", rendered: renderMarkdown(responseBuffer) + suffix });
        } else {
          dispatch({ type: "MESSAGE_COMPLETE", rendered: suffix });
        }

        if (activeSessionId) {
          await touchSession(sessionDirs, activeSessionId);
        }
      } catch (err: any) {
        activeQueryRef.current = null;
        isStreamingRef.current = false;
        dispatch({ type: "SET_ERROR", error: err.message });
      }
    },
    [state.sessionId, agentContext, config, sessionDirs],
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      dispatch({ type: "RESET_INPUT" });

      // Commands always execute immediately
      if (trimmed === "/quit" || trimmed === "/exit") {
        exit();
        return;
      }

      if (trimmed === "/new") {
        dispatch({ type: "SET_SESSION", sessionId: null });
        dispatch({ type: "SET_SESSION_NAME", name: null });
        dispatch({ type: "ADD_SYSTEM_MESSAGE", content: "[New session started]" });
        return;
      }

      if (trimmed === "/sessions") {
        const sessions = await listSessions(sessionDirs);
        const top20 = sessions.slice(0, 20);
        dispatch({ type: "SET_LISTING", listing: top20 });
        if (top20.length === 0) {
          dispatch({ type: "ADD_SYSTEM_MESSAGE", content: "[No sessions found]" });
        } else {
          const lines = top20.map((s, i) => {
            const marker = s.id === state.sessionId ? " *" : "";
            return `  #${i + 1}  ${s.name}  (${relativeTime(s.lastUsedAt)})${marker}`;
          });
          dispatch({
            type: "ADD_SYSTEM_MESSAGE",
            content: `[Sessions]\n${lines.join("\n")}`,
          });
        }
        return;
      }

      if (trimmed.startsWith("/resume")) {
        const arg = trimmed.slice("/resume".length).trim();
        let targetId: string | null = null;
        let targetName: string | null = null;

        if (!arg) {
          targetId = await getLastSessionId(sessionDirs);
        } else if (arg.startsWith("#")) {
          const num = parseInt(arg.slice(1), 10);
          if (state.lastListing && num >= 1 && num <= state.lastListing.length) {
            const session = state.lastListing[num - 1];
            targetId = session.id;
            targetName = session.name;
          } else {
            dispatch({
              type: "ADD_SYSTEM_MESSAGE",
              content: `[Invalid session number. Run /sessions first]`,
            });
            return;
          }
        } else {
          const sessions = await listSessions(sessionDirs);
          const match = findSessionByName(arg, sessions);
          if (match) {
            targetId = match.id;
            targetName = match.name;
          } else {
            dispatch({
              type: "ADD_SYSTEM_MESSAGE",
              content: `[No session matching "${arg}"]`,
            });
            return;
          }
        }

        if (!targetId) {
          dispatch({ type: "ADD_SYSTEM_MESSAGE", content: "[No previous session found]" });
          return;
        }

        if (!targetName) {
          const meta = await loadSession(sessionDirs, targetId);
          targetName = meta?.name ?? null;
        }

        dispatch({ type: "SET_SESSION", sessionId: targetId });
        dispatch({ type: "SET_SESSION_NAME", name: targetName });
        dispatch({
          type: "ADD_SYSTEM_MESSAGE",
          content: targetName ? `[Resuming: ${targetName}]` : "[Resuming previous session]",
        });
        return;
      }

      if (trimmed.startsWith("/name")) {
        const newName = trimmed.slice("/name".length).trim();
        if (!newName) {
          dispatch({ type: "ADD_SYSTEM_MESSAGE", content: "[Usage: /name <text>]" });
          return;
        }
        if (!state.sessionId) {
          dispatch({ type: "ADD_SYSTEM_MESSAGE", content: "[No active session to rename]" });
          return;
        }
        await renameSession(sessionDirs, state.sessionId, newName);
        dispatch({ type: "SET_SESSION_NAME", name: newName });
        dispatch({ type: "ADD_SYSTEM_MESSAGE", content: `[Session renamed: ${newName}]` });
        return;
      }

      // Non-command message: add to history
      historyRef.current.push(trimmed);

      // If streaming, queue the message instead of sending
      if (isStreamingRef.current) {
        queueRef.current.push(trimmed);
        setQueueCount(queueRef.current.length);
        dispatch({ type: "ADD_USER_MESSAGE", content: trimmed });
        return;
      }

      // Process message, then drain the queue
      await processMessage(trimmed);
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift() as string;
        setQueueCount(queueRef.current.length);
        await processMessage(next);
      }
      setQueueCount(0);
    },
    [state.sessionId, state.lastListing, exit, sessionDirs, processMessage],
  );

  const showSessionLine = ctrlCWarning || queueCount > 0;

  return (
    <Box flexDirection="column">
      <ChatHistory messages={state.messages} />

      {state.isStreaming && (
        <StreamingResponse
          text={state.streamBuffer}
          thinking={state.thinkingBuffer}
          toolActions={state.toolActions}
          agentName={agentContext.name}
        />
      )}

      {state.error && (
        <Box marginTop={1}>
          <Text color="red">Error: {state.error}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{"─".repeat(process.stdout.columns || 80)}</Text>
        <InputArea
          isDisabled={false}
          isStreaming={state.isStreaming}
          onSubmit={handleSubmit}
          resetKey={state.inputKey}
          history={historyRef.current}
        />
        <Text dimColor>{"─".repeat(process.stdout.columns || 80)}</Text>
        <Box justifyContent="space-between">
          <Box>
            <Text color="magenta"> {agentContext.name}</Text>
            <Text dimColor> · </Text>
            <Text dimColor>{config.model}</Text>
            {process.env.HARNESS_SANDBOXED && <Text dimColor> · 🔒</Text>}
          </Box>
          <ContextBar tokens={state.contextTokens} />
        </Box>
        {showSessionLine && (
          <Box>
            {ctrlCWarning ? (
              <Text color="yellow"> Press Ctrl-C again to exit</Text>
            ) : (
              <Box>{queueCount > 0 && <Text color="yellow"> ({queueCount} queued)</Text>}</Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
