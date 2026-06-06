import type { FastMCP } from "fastmcp";
import { requireAuth } from "fastmcp";
import { z } from "zod";

export function registerFunTools(server: FastMCP<any>) {
  server.addTool({
    name: "magic_8_ball",
    description:
      "Ask the Magic 8-Ball a yes/no question and receive a mystical answer",
    parameters: z.object({
      question: z.string().describe("Your yes/no question"),
    }),
    canAccess: requireAuth,
    execute: async ({ question }) => {
      const answers = [
        "It is certain.",
        "Without a doubt.",
        "Yes, definitely.",
        "You may rely on it.",
        "Reply hazy, try again.",
        "Ask again later.",
        "Better not tell you now.",
        "Don't count on it.",
        "My sources say no.",
        "Very doubtful.",
        "Outlook not so good.",
      ];
      const answer = answers[Math.floor(Math.random() * answers.length)];
      return `Question: "${question}"\nAnswer: ${answer}`;
    },
  });

  server.addTool({
    name: "dad_joke",
    description: "Generate a random dad joke. Groaning is optional.",
    parameters: z.object({
      topic: z.string().describe("Optional topic hint").optional(),
    }),
    canAccess: requireAuth,
    execute: async () => {
      const jokes = [
        "Why don't skeletons fight each other? They don't have the guts.",
        "I'm reading a book about anti-gravity. It's impossible to put down!",
        "What do you call a fake noodle? An impasta!",
        "Why did the scarecrow win an award? Because he was outstanding in his field!",
        "I used to hate facial hair, but then it grew on me.",
        "What do you call cheese that isn't yours? Nacho cheese!",
        "Why can't a bicycle stand on its own? It's two-tired.",
        "I told my wife she was drawing her eyebrows too high. She looked surprised.",
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    },
  });

  server.addTool({
    name: "coin_flip",
    description: "Flip a coin (or multiple coins) and get the results",
    parameters: z.object({
      count: z
        .number()
        .describe("Number of coins to flip (1-10)")
        .optional()
        .default(1),
    }),
    canAccess: requireAuth,
    execute: async ({ count }) => {
      const n = Math.min(Math.max(count, 1), 10);
      const results = Array.from({ length: n }, () =>
        Math.random() > 0.5 ? "Heads" : "Tails"
      );
      const heads = results.filter((r) => r === "Heads").length;
      return `Results: ${results.join(", ")}\nHeads: ${heads}, Tails: ${n - heads}`;
    },
  });

  server.addTool({
    name: "mood_color",
    description: "Converts a mood/emotion into a hex color with explanation",
    parameters: z.object({
      mood: z
        .string()
        .describe("A mood or emotion (e.g., happy, anxious, calm)"),
    }),
    canAccess: requireAuth,
    execute: async ({ mood }) => {
      const moodMap: Record<string, { color: string; reason: string }> = {
        happy: { color: "#FFD700", reason: "Warm gold — radiating joy" },
        sad: { color: "#4169E1", reason: "Royal blue — deep and reflective" },
        angry: { color: "#DC143C", reason: "Crimson — intense and fiery" },
        calm: { color: "#98FB98", reason: "Pale green — serene and balanced" },
        anxious: { color: "#FF6347", reason: "Tomato — restless warmth" },
        excited: { color: "#FF4500", reason: "Orange-red — electric energy" },
        peaceful: { color: "#87CEEB", reason: "Sky blue — tranquil and open" },
        nostalgic: {
          color: "#DEB887",
          reason: "Burlywood — warm and familiar",
        },
        creative: {
          color: "#9370DB",
          reason: "Medium purple — imaginative and flowing",
        },
        energetic: {
          color: "#00FF7F",
          reason: "Spring green — vibrant and alive",
        },
      };
      const key = mood.toLowerCase();
      const match = moodMap[key] || {
        color: "#808080",
        reason: "Gray — undefined, mysterious",
      };
      return `Mood: ${mood}\nColor: ${match.color}\nWhy: ${match.reason}`;
    },
  });
}
