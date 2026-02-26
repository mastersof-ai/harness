import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

const COLORS = [
  "#3d1100", // barely glowing
  "#6b1d00", // dark ember
  "#a63200", // ember
  "#d94e00", // low flame
  "#ff7700", // flame
  "#ff9f00", // bright flame
  "#ffc800", // yellow
  "#ffe066", // white-hot
];

const LABELS = ["thinking", "reasoning", "considering", "reflecting"];

interface ThinkingAnimationProps {
  compact?: boolean;
  agentName: string;
}

export function ThinkingAnimation({ compact = false, agentName }: ThinkingAnimationProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 70);
    return () => clearInterval(id);
  }, []);

  const width = compact ? 20 : 32;

  // Three overlapping sine waves create an organic interference pattern
  const fireBar = [];
  for (let i = 0; i < width; i++) {
    const v =
      Math.sin(i * 0.28 - tick * 0.13) +
      Math.sin(i * 0.45 + tick * 0.19) * 0.65 +
      Math.sin(i * 0.12 + tick * 0.07) * 0.45;
    const normalized = Math.max(0, Math.min(1, (v / 2.1 + 1) / 2));
    const idx = Math.round(normalized * 7);
    fireBar.push(
      <Text key={i} color={COLORS[idx]}>
        {BLOCKS[idx]}
      </Text>,
    );
  }

  const label = LABELS[Math.floor(tick / 30) % LABELS.length];
  const dots = ".".repeat((Math.floor(tick / 8) % 3) + 1);
  const displayName = agentName.charAt(0).toUpperCase() + agentName.slice(1);

  if (compact) {
    return (
      <Box marginTop={1}>
        <Text>{"  "}</Text>
        {fireBar}
        <Text color="gray">
          {" "}
          {label}
          {dots}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text>{"  "}</Text>
        {fireBar}
      </Box>
      <Box>
        <Text color="magenta" bold>
          {"  "}
          {displayName}{" "}
        </Text>
        <Text color="gray">
          {label}
          {dots}
        </Text>
      </Box>
    </Box>
  );
}
