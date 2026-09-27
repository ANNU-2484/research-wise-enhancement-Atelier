import { jsonrepair } from "jsonrepair";

export function safeParseJSON<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty response from AI model");
  }

  // 1. Remove markdown code fences & whitespace
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 2. Direct JSON.parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue
  }

  // 3. Try jsonrepair directly on text
  try {
    const repaired = jsonrepair(text);
    return JSON.parse(repaired) as T;
  } catch {
    // Continue
  }

  // 4. Extract outermost JSON structure ({...} or [...])
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf("]");
  }

  if (startIdx !== -1) {
    const candidate = endIdx > startIdx ? text.slice(startIdx, endIdx + 1) : text.slice(startIdx);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Continue
    }
    try {
      const repaired = jsonrepair(candidate);
      return JSON.parse(repaired) as T;
    } catch {
      // Continue
    }
  }

  // 5. If JSON was truncated mid-stream, close open quotes and brackets then repair
  try {
    let truncated = text;
    let quoteCount = 0;
    for (let i = 0; i < truncated.length; i++) {
      if (truncated[i] === '"' && (i === 0 || truncated[i - 1] !== '\\')) quoteCount++;
    }
    if (quoteCount % 2 !== 0) truncated += '"';

    const openBraces = (truncated.match(/\{/g) || []).length - (truncated.match(/\}/g) || []).length;
    const openBrackets = (truncated.match(/\[/g) || []).length - (truncated.match(/\]/g) || []).length;
    for (let b = 0; b < openBrackets; b++) truncated += "]";
    for (let b = 0; b < openBraces; b++) truncated += "}";

    const repaired = jsonrepair(truncated);
    return JSON.parse(repaired) as T;
  } catch {
    // Continue
  }

  const cleanPreview = text.length > 300 ? `${text.slice(0, 300)}...` : text;
  throw new Error(`Gemini did not return valid JSON. (preview: ${cleanPreview})`);
}

// Tests
console.log("TEST 1: Standard JSON");
console.log(safeParseJSON('{"a": 1, "b": "hello"}'));

console.log("TEST 2: Markdown wrapped JSON");
console.log(safeParseJSON('```json\n{"a": 1, "b": "hello"}\n```'));

console.log("TEST 3: Trailing commas & single quotes");
console.log(safeParseJSON("{'a': 1, 'b': 'hello',}"));

console.log("TEST 4: Unescaped internal quotes");
console.log(safeParseJSON('{ "research_method": "mixed — the proposed research methodology combines qualitative policy analysis with quantitative evaluation of automated "OSINT" filtering models. This mixed approach is justified by the dual need to address technical challenges (information overload )" }'));

console.log("TEST 5: Truncated JSON");
console.log(safeParseJSON('{"research_method": "mixed — the proposed methodology...", "algorithms": [{"name": "CNN"'));

console.log("\nAll tests passed successfully!");
