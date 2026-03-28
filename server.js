import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import { generateAIResponse } from "./ai.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

/** Resolve Roblox username to user id + display info (server-side to avoid browser CORS). */
app.post("/api/roblox/lookup", async (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    if (!username) {
        return res.status(400).json({ error: "Username is required." });
    }
    try {
        const userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
                usernames: [username],
                excludeBannedUsers: true,
            }),
        });
        const userJson = await userRes.json();
        const row = userJson?.data?.[0];
        if (!row?.id) {
            return res.status(404).json({ error: "No Roblox user found with that username." });
        }
        const userId = row.id;
        const thumbRes = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`
        );
        const thumbJson = await thumbRes.json();
        const avatarUrl = thumbJson?.data?.[0]?.imageUrl ?? null;

        res.json({
            userId,
            username: row.requestedUsername ?? username,
            name: row.name ?? row.displayName ?? String(userId),
            avatarUrl,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || "Roblox lookup failed." });
    }
});

let jobs = {};

// load database (empty or invalid file must not crash startup)
function loadJobs() {
    const path = "jobs.json";
    if (!fs.existsSync(path)) {
        return {};
    }
    const raw = fs.readFileSync(path, "utf8").trim();
    if (!raw) {
        return {};
    }
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

jobs = loadJobs();

function saveJobs() {
    fs.writeFileSync("jobs.json", JSON.stringify(jobs, null, 2));
}

// CREATE JOB
app.post("/generate", async (req, res) => {
    const prompt = req.body.prompt;
    const provider = req.body.provider ?? req.body.model;

    let aiResult;
    try {
        aiResult = await generateAIResponse(prompt, { provider });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message || String(err) });
    }

    const jobId = Math.random().toString(36).slice(2);

    jobs[jobId] = {
        prompt,
        provider: provider || process.env.AI_PROVIDER || "openai",
        result: aiResult,
        created: Date.now()
    };

    saveJobs();

    res.json({ jobId });
});

// GET JOB
app.get("/jobs/:id", (req, res) => {
    res.json(jobs[req.params.id] || {});
});

app.listen(3000, () => {
    console.log("Running on http://localhost:3000");
});