export async function generateAIResponse(prompt) {
    // MOCK AI (replace later with OpenAI)

    return {
        changes: [
            {
                path: "ServerScriptService.Main",
                type: "replace",
                source: `print("AI: ${prompt}")`
            }
        ]
    };
}