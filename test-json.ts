function repairAndParseJSON<T = unknown>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Empty response from AI model");
  }

  // 1. Remove markdown code fences & trim
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 2. Fast path: Direct JSON.parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue
  }

  // 3. Extract outermost JSON structure
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

  if (startIdx !== -1 && endIdx > startIdx) {
    const extracted = text.slice(startIdx, endIdx + 1);
    try {
      return JSON.parse(extracted) as T;
    } catch {
      text = extracted;
    }
  }

  // 4. Tokenizer-based reconstruction
  let out = "";
  let i = 0;
  const len = text.length;
  const stack: ("{" | "[")[] = [];

  while (i < len) {
    const ch = text[i];

    // Whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      out += ch;
      i++;
      continue;
    }

    // Single-line comments
    if (ch === "/" && text[i + 1] === "/") {
      while (i < len && text[i] !== "\n") i++;
      continue;
    }

    // Multi-line comments
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < len - 1 && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Strings (double or single quoted)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      out += '"';
      let escaped = false;
      while (i < len) {
        const c = text[i];
        if (escaped) {
          if (c === '"') {
            out += '\\"';
          } else if (c === "'") {
            out += "'";
          } else {
            out += "\\" + c;
          }
          escaped = false;
          i++;
          continue;
        }
        if (c === "\\") {
          escaped = true;
          i++;
          continue;
        }
        if (c === quote) {
          out += '"';
          i++;
          break;
        }
        if (c === '"' && quote === "'") {
          out += '\\"';
          i++;
          continue;
        }
        if (c === "\n") {
          out += "\\n";
          i++;
          continue;
        }
        if (c === "\r") {
          out += "\\r";
          i++;
          continue;
        }
        if (c === "\t") {
          out += "\\t";
          i++;
          continue;
        }
        out += c;
        i++;
      }
      continue;
    }

    // Structure delimiters
    if (ch === "{") {
      stack.push("{");
      out += "{";
      i++;
      continue;
    }
    if (ch === "[") {
      stack.push("[");
      out += "[";
      i++;
      continue;
    }
    if (ch === "}") {
      if (stack[stack.length - 1] === "{") stack.pop();
      // Drop trailing comma before }
      out = out.replace(/,\s*$/, "");
      out += "}";
      i++;
      continue;
    }
    if (ch === "]") {
      if (stack[stack.length - 1] === "[") stack.pop();
      // Drop trailing comma before ]
      out = out.replace(/,\s*$/, "");
      out += "]";
      i++;
      continue;
    }
    if (ch === ":" || ch === ",") {
      out += ch;
      i++;
      continue;
    }

    // Numbers (positive / negative integers or floats)
    if (/[0-9\-]/.test(ch)) {
      let numStr = "";
      while (i < len && /[0-9eE\.\-+]/.test(text[i])) {
        numStr += text[i];
        i++;
      }
      out += numStr;
      continue;
    }

    // Identifiers / Unquoted keys / Booleans / Null
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = "";
      while (i < len && /[a-zA-Z0-9_$\-]/.test(text[i])) {
        ident += text[i];
        i++;
      }

      // Check if followed by colon (unquoted key)
      let lookAhead = i;
      while (lookAhead < len && (text[lookAhead] === " " || text[lookAhead] === "\t" || text[lookAhead] === "\n" || text[lookAhead] === "\r")) {
        lookAhead++;
      }

      if (text[lookAhead] === ":") {
        out += `"${ident}"`;
      } else if (ident === "true" || ident === "True") {
        out += "true";
      } else if (ident === "false" || ident === "False") {
        out += "false";
      } else if (ident === "null" || ident === "None") {
        out += "null";
      } else {
        out += `"${ident}"`;
      }
      continue;
    }

    // Any other character
    out += ch;
    i++;
  }

  // Handle truncated JSON by closing open stacks
  while (stack.length > 0) {
    const top = stack.pop();
    out = out.replace(/,\s*$/, "");
    if (top === "{") out += "}";
    if (top === "[") out += "]";
  }

  // Final cleanup of trailing commas before closing braces/brackets
  out = out.replace(/,\s*([\}\]])/g, "$1");

  try {
    return JSON.parse(out) as T;
  } catch (finalErr) {
    throw new Error(
      `Gemini did not return valid JSON: ${finalErr instanceof Error ? finalErr.message : String(finalErr)} (preview: ${text.slice(0, 300)})`
    );
  }
}

// Test cases
console.log("TEST 1: String with commas and colon inside value (the exact position 8032 issue)");
const testSentenceWithColon = `{
  "overview": "The reviewed literature addresses OSINT across diverse domains. The first paper examines Domain a, methodology: quantitative analysis, findings: high accuracy.",
  unquoted_key: 'single quoted value',
  trailing_comma_array: [1, 2, 3, ],
  trailing_comma_obj: { a: 1, },
  python_literals: { is_active: True, is_none: None },
}`;

const res1 = repairAndParseJSON<any>(testSentenceWithColon);
console.log("Overview successfully parsed:", res1.overview);
console.log("Unquoted key:", res1.unquoted_key);
console.log("Trailing comma array:", res1.trailing_comma_array);
console.log("Python literals:", res1.python_literals);

console.log("\nTEST 2: Long Literature Review snippet");
const testLiterature = `{
  "overview": "The reviewed literature addresses the evolution, practical application, and technical challenges of Open Source Intelligence (OSINT) across diverse domains such as infrastructure reconnaissance, fugitive tracking, and general intelligence workflows. The first paper examines Domain a",
  "themes": ["OSINT", "Machine Learning"],
  "papers": [
    {
      "index": 1,
      "title": "A Survey of OSINT",
      "authors": ["Alice", "Bob"],
      "year": 2023,
      "venue": "IEEE Access",
      "summary": "This paper reviews tools, e.g., Shodan, Maltego, etc.",
      "keywords": ["OSINT", "Security"],
      "objectives": ["Identify tools"],
      "methodology": "Qualitative survey",
      "findings": ["OSINT is effective"],
      "limitations": ["Privacy concerns"]
    }
  ],
  "confidence": { "score": 90, "level": "high", "rationale": "Clear coverage" }
}`;

const res2 = repairAndParseJSON<any>(testLiterature);
console.log("Literature parsed successfully! Papers count:", res2.papers.length);

console.log("\nAll JSON test cases passed perfectly!");
