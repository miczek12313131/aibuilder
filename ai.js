/**
 * Puter OpenAI-compatible HTTP API (no @heyputer/puter.js WebSocket — avoids Node 22 Undici stack overflow).
 * @see https://developer.puter.com/tutorials/use-openai-sdk-with-puter/
 */
const PUTER_OPENAI_BASE = "https://api.puter.com/puterai/openai/v1";

/** Puter model IDs — see https://developer.puter.com/ai/models/ */
export const PUTER_MODELS = {
    /** OpenAI GPT-5.4 Mini */
    openai: "openai/gpt-5.4-mini",
    /** Anthropic Claude Sonnet 4.6 */
    claude: "anthropic/claude-sonnet-4-6",
    /** DeepSeek V3.2 */
    deepseek: "deepseek/deepseek-v3.2",
    /** Google Gemini 3 Flash */
    gemini: "google/gemini-3-flash-preview",
};

const DEFAULT_PROVIDER = "openai";

function resolveModel(providerOrId) {
    if (!providerOrId) {
        const env = process.env.AI_PROVIDER;
        const key = env && PUTER_MODELS[env] ? env : DEFAULT_PROVIDER;
        return PUTER_MODELS[key];
    }
    if (PUTER_MODELS[providerOrId]) {
        return PUTER_MODELS[providerOrId];
    }
    return providerOrId;
}

/**
 * @param {Array<{ role: string; content: string }>} messages
 * @param {string} model
 */
async function puterChatCompletions(messages, model) {
    const token = process.env.PUTER_AUTH_TOKEN;
    if (!token) {
        throw new Error(
            "Missing PUTER_AUTH_TOKEN. Create a token at https://puter.com/dashboard#account and set the env var."
        );
    }

    const res = await fetch(`${PUTER_OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ model, messages }),
    });

    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Puter API ${res.status}: ${text.slice(0, 800)}`);
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Puter API returned non-JSON: ${text.slice(0, 500)}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (content == null) {
        throw new Error("Puter API returned no message content.");
    }
    return String(content);
}

/**
 * Plain chat (no RoScript JSON schema). Use for interactive CLI or general Q&A.
 * @param {string} prompt
  * @param {{ provider?: keyof typeof PUTER_MODELS | string; messages?: Array<{ role: string; content: string }> }} [options]
 * @returns {Promise<{ changes: Array<{ path: string; type: string; source: string }> }>} 
 */
export async function chatPuter(prompt, options = {}) {
    const model = resolveModel(options.provider);
    const normalizedMessages = normalizeMessages(options.messages);
    return puterChatCompletions([{ role: "user", content: prompt }], model);
}

function extractJsonObject(text) {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence ? fence[1].trim() : trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) {
        throw new Error("AI response did not contain a JSON object");
    }
    return candidate.slice(start, end + 1);
}

const SYSTEM_PROMPT = `You are an expert Roblox Lua engineer working inside Roblox Studio.

Your job is to generate SAFE, MINIMAL, and CORRECT script changes based on a user request.

You MUST follow these rules strictly:

The JSON must match this shape exactly:
{"explanation":"string","changes":[{"path":"string","type":"replace","source":"string"}]}

Rules:
- "path" is a Roblox-style path like "ServerScriptService.Main" or "ReplicatedStorage.Module".
- "type" is always "replace" for now (full script body replacement).
- "source" is complete Luau source code, properly escaped for JSON.
- Include a concise user-facing "explanation" that can be shown in the website chat.
- Generate code that matches the user's request.`;
1. Output ONLY valid JSON. No explanations, no markdown, no extra text.
2. The JSON format MUST be:

{
  "changes": [
    {
      "path": "Full.Path.To.Script",
      "type": "create | replace | update",
      "source": "Lua code here"
    }
  ]
}

3. Rules for paths:
- Use valid Roblox hierarchy paths
- Examples:
  - ServerScriptService.Main
  - StarterPlayer.StarterPlayerScripts.Client
  - ReplicatedStorage.Modules.Inventory

4. NEVER invent unknown services or invalid paths.
5. NEVER modify multiple systems unless needed.
6. Keep scripts SMALL and focused.
7. Always write clean, production-ready Lua code.
8. Use Roblox services properly (GetService).
9. If a script does not exist, use type "create".
10. If modifying existing logic, use "replace".

11. DO NOT:
- Explain anything
- Add comments outside Lua
- Output anything except JSON

12. Code quality rules:
- No unnecessary prints
- No debug leftovers
- Use clear variable names
- Avoid global variables
- Use proper event connections

13. Safety rules:
- Do NOT delete core systems
- Do NOT overwrite unrelated scripts
- Only modify what is required for the request

You are part of an automated system. Incorrect format will break the pipeline.`;

function normalizeMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return null;
    }
    return messages
        .map((msg) => {
            const role = msg?.role === "assistant" ? "assistant" : "user";
            const content = String(msg?.content ?? "").trim();
            return content ? { role, content } : null;
        })
        .filter(Boolean);
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return null;
    }
    return messages
        .map((msg) => {
            const role = msg?.role === "assistant" ? "assistant" : "user";
            const content = String(msg?.content ?? "").trim();
            return content ? { role, content } : null;
        })
        .filter(Boolean);
}

/**
 * @param {string} prompt
 * @param {{ provider?: keyof typeof PUTER_MODELS | string; messages?: Array<{ role: string; content: string }> }} [options]
 * @returns {Promise<{ changes: Array<{ path: string; type: string; source: string }> }>} 
 */
export async function generateAIResponse(prompt, options = {}) {
    const model = resolveModel(options.provider);
    const normalizedMessages = normalizeMessages(options.messages);

    
    const raw = await puterChatCompletions(
        [
            { role: "system", content: SYSTEM_PROMPT },
            ...(normalizedMessages && normalizedMessages.length
                ? normalizedMessages
                : [{ role: "user", content: prompt }]),
        ],
        model
    );

    let parsed;
    try {
        parsed = JSON.parse(extractJsonObject(raw));
    } catch (e) {
        const err = new Error(
            `Failed to parse AI JSON: ${e.message}. Raw preview: ${raw.slice(0, 400)}`
        );
        err.cause = e;
        throw err;
    }

    if (!parsed || !Array.isArray(parsed.changes)) {
        throw new Error('AI JSON must include a "changes" array');
    }

    if (typeof parsed.explanation !== "string") {
        parsed.explanation = "I generated the requested Roblox changes.";
    }

    return parsed;
}
