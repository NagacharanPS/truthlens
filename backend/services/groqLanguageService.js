import "dotenv/config";
import Groq from "groq-sdk";

const groqApiKey = (process.env.GROQ_API_KEY || "").trim();

function extractJsonContent(content) {
  const trimmed = content?.trim() || "";
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

export async function normalizeMultilingualText(inputText) {
  if (!inputText?.trim()) {
    throw new Error("inputText is required.");
  }

  if (!groqApiKey || groqApiKey === "your_groq_api_key_here") {
    throw new Error("GROQ_API_KEY is missing from the backend environment.");
  }

  // Build the client only when the backend really has a key.
  const groq = new Groq({
    apiKey: groqApiKey,
  });

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        // Keep the prompt strict so the Python backend can safely parse the reply.
        content: `
You are a multilingual scam-message preprocessing assistant.
Detect the input language, fix spelling mistakes, translate it to English,
and return ONLY valid JSON:
{
 "detectedLanguage": "",
 "originalText": "",
 "correctedText": "",
 "englishText": "",
 "suspiciousKeywords": []
}
        `,
      },
      {
        role: "user",
        content: inputText,
      },
    ],
    temperature: 0.2,
  });

  const responseContent = completion.choices[0]?.message?.content;

  if (!responseContent) {
    throw new Error("Groq returned an empty response.");
  }

  return JSON.parse(extractJsonContent(responseContent));
}
