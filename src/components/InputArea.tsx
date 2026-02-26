import { Box, Text, useStdout } from "ink";
import React from "react";
import { MultilineInput } from "./MultilineInput.js";

interface InputAreaProps {
  isDisabled: boolean;
  isStreaming?: boolean;
  onSubmit: (value: string) => void;
  resetKey: number;
  history?: string[];
}

const PREFIX = "You: ";

export function InputArea({ isDisabled, isStreaming, onSubmit, resetKey, history }: InputAreaProps) {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  return (
    <Box>
      <Text color="cyan" bold>
        {PREFIX}
      </Text>
      <MultilineInput
        key={resetKey}
        isDisabled={isDisabled}
        isStreaming={isStreaming}
        onSubmit={onSubmit}
        placeholder={isDisabled ? "" : "Type your message..."}
        availableWidth={columns - PREFIX.length}
        history={history}
      />
    </Box>
  );
}
