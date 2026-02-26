import { Box, Text } from "ink";
import React from "react";

export type MessageRole = "user" | "assistant" | "system";

export interface MessageData {
  role: MessageRole;
  content: string;
  agentName?: string;
}

export function Message({ role, content, agentName }: MessageData) {
  if (role === "system") {
    return <Text color="yellow">{content}</Text>;
  }

  if (role === "user") {
    return (
      <Box marginTop={1}>
        <Text color="cyan" bold>
          You:{" "}
        </Text>
        <Text>{content}</Text>
      </Box>
    );
  }

  const displayName = agentName ? agentName.charAt(0).toUpperCase() + agentName.slice(1) : "Agent";

  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>
        {displayName}:
      </Text>
      <Text>{content}</Text>
    </Box>
  );
}
