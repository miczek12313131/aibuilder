/**
 * Puter OpenAI-compatible HTTP API.
 * @see https://developer.puter.com/tutorials/use-openai-sdk-with-puter/
 */
const PUTER_OPENAI_BASE = "https://api.puter.com/puterai/openai/v1";

export const PUTER_MODELS = {
    openai: "openai/gpt-5.4-mini",
    claude: "anthropic/claude-sonnet-4-6",
    deepseek: "deepseek/deepseek-v3.2",
    gemini: "google/gemini-3-flash-preview",
};

const DEFAULT_PROVIDER = "openai";

function resolveModel(providerOrId) {
    if (!providerOrId) {
        const env = process.env.AI_PROVIDER;
        const key = env && PUTER_MODELS[env] ? env : DEFAULT_PROVIDER;
        return PUTER_MODELS[key];
    }
    return PUTER_MODELS[providerOrId] || providerOrId;
}

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

export async function chatPuter(prompt, options = {}) {
    const model = resolveModel(options.provider);
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

const SYSTEM_PROMPT = [
    "You are RoScript's code assistant for Roblox (Luau).",
    "Output ONLY valid JSON, with no markdown and no extra text.",
    "",
    "JSON shape:",
    '{"explanation":"string","changes":[{"path":"string","type":"replace","source":"string"}]}',
    "",
    "Rules:",
    '- "path" must be a Roblox-like path, e.g. "ServerScriptService.Main".',
    '- "type" is always "replace".',
    '- "source" is full Luau source code escaped for JSON.',
    '- "explanation" is concise user-facing text for UI display.',
].join("\n");

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

export async function generateAIResponse(prompt, options = {}) {
    const model = resolveModel(options.provider);
    const normalizedMessages = normalizeMessages(options.messages);

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...(normalizedMessages && normalizedMessages.length
            ? normalizedMessages
            : [{ role: "user", content: String(prompt ?? "") }]),
    ];

    const raw = await puterChatCompletions(messages, model);

    let parsed;
    try {
        parsed = JSON.parse(extractJsonObject(raw));
    } catch (e) {
        const err = new Error(`Failed to parse AI JSON: ${e.message}. Raw preview: ${raw.slice(0, 400)}`);
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
