import { Box, Text } from "ink";
import React from "react";
import type { ToolAction } from "./App.js";
import { ThinkingAnimation } from "./ThinkingAnimation.js";

function thinkingPreview(text: string, maxLines = 3): string {
  const lines = text.trimEnd().split("\n");
  const tail = lines.slice(-maxLines);
  return tail.join("\n");
}

interface StreamingResponseProps {
  text: string;
  thinking: string;
  toolActions: ToolAction[];
  agentName: string;
}

export function StreamingResponse({ text, thinking, toolActions, agentName }: StreamingResponseProps) {
  const showThinking = thinking && !text;
  const displayName = agentName.charAt(0).toUpperCase() + agentName.slice(1);

  return (
    <Box flexDirection="column" marginTop={1}>
      {showThinking && (
        <Box flexDirection="column">
          <Text color="gray" italic>
            {thinkingPreview(thinking)}
          </Text>
        </Box>
      )}
      {text && (
        <>
          <Text color="magenta" bold>
            {displayName}:
          </Text>
          <Text>{text}</Text>
        </>
      )}
      {toolActions.map((action, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sequential tool log
        <Box key={i}>
          <Text dimColor>
            {"  "}→ {action.name}
          </Text>
          {action.detail && (
            <Text color="gray">
              {"  "}
              {action.detail}
            </Text>
          )}
        </Box>
      ))}
      <ThinkingAnimation compact={!!text || !!thinking} agentName={agentName} />
    </Box>
  );
}
