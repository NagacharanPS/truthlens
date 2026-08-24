import { readFileSync } from "node:fs";
import process from "node:process";

import { normalizeMultilingualText } from "./groqLanguageService.js";

// FastAPI sends the raw message over stdin so we can keep Groq backend-only.
const inputText = readFileSync(0, "utf8");

try {
  const result = await normalizeMultilingualText(inputText);
  // Stdout stays machine-readable because Python parses this JSON directly.
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : "Groq language processing failed.");
  process.exit(1);
}
