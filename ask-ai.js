import "dotenv/config";
import readline from "node:readline";
import { chatPuter, PUTER_MODELS } from "./ai.js";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
    console.log("Puter AI — set PUTER_AUTH_TOKEN in your environment first.\n");
    console.log("Models (short names):");
    for (const [key, id] of Object.entries(PUTER_MODELS)) {
        console.log(`  ${key.padEnd(10)} → ${id}`);
    }
    console.log("  (Or enter a full Puter model id, e.g. anthropic/claude-opus-4-6)\n");

    const modelInput = (await ask("Model [openai]: ")).trim() || "openai";
    const prompt = (await ask("Your question: ")).trim();

    if (!prompt) {
        console.error("Empty prompt. Exiting.");
        rl.close();
        process.exit(1);
    }

    const provider = modelInput;

    console.log("\n--- Response ---\n");
    try {
        const text = await chatPuter(prompt, { provider });
        console.log(text);
    } catch (err) {
        console.error(err.message || String(err));
        process.exitCode = 1;
    }

    rl.close();
}

main();
