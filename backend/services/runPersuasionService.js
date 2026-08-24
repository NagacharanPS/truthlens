import "dotenv/config";
import { readFileSync } from "node:fs";
import process from "node:process";
import Groq from "groq-sdk";

const groqApiKey = (process.env.GROQ_API_KEY || "").trim();
const inputText = readFileSync(0, "utf8");

if (!groqApiKey || groqApiKey === "your_groq_api_key_here") {
  process.stderr.write("GROQ_API_KEY is missing.");
  process.exit(1);
}

const PATTERN_NAMES = [
  "Authority Impersonation",
  "Isolation Tactic",
  "False Urgency",
  "Reciprocity Trap",
  "Fear and Rescue",
  "Social Proof Manipulation",
  "Crypto and Investment Lure",
  "Blackmail and Sextortion",
  "Fake Prize and Fee Fraud",
  "Bank Detail Change Fraud",
  "Family Emergency Money Request",
];

const groq = new Groq({ apiKey: groqApiKey });

try {
  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a scam psychology analyst. Analyze the message for 11 manipulation tactics.
Score each tactic 0-10 (0=not present, 10=strongly present).
Return ONLY valid JSON:
{
  "patternScores": {
    "Authority Impersonation": 0,
    "Isolation Tactic": 0,
    "False Urgency": 0,
    "Reciprocity Trap": 0,
    "Fear and Rescue": 0,
    "Social Proof Manipulation": 0,
    "Crypto and Investment Lure": 0,
    "Blackmail and Sextortion": 0,
    "Fake Prize and Fee Fraud": 0,
    "Bank Detail Change Fraud": 0,
    "Family Emergency Money Request": 0
  },
  "explanation": "one sentence summary of the main manipulation tactics found",
  "overallPersuasionScore": 0
}
If no manipulation is found, all scores should be 0.`,
      },
      {
        role: "user",
        content: inputText,
      },
    ],
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message?.content || "";
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;

  process.stdout.write(jsonStr);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : "Groq persuasion analysis failed.");
  process.exit(1);
}
