import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateAIResponse } from "./ai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const authChallenges = new Map();
const AUTH_CHALLENGE_TTL_MS = 10 * 60 * 1000;

const PURCHASE_LINKS = {
    pro: process.env.POLAR_PRO_CHECKOUT_URL || "",
    credits500: process.env.POLAR_500_CHECKOUT_URL || "",
    credits1200: process.env.POLAR_1200_CHECKOUT_URL || "",
};

function randomChallengeCode(length = 10) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < length; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}

function cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [challengeId, challenge] of authChallenges.entries()) {
        if (challenge.expiresAt <= now) {
            authChallenges.delete(challengeId);
        }
    }
}

function loadJsonObject(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

let projects = loadJsonObject("projects.json");

function saveProjects() {
    fs.writeFileSync("projects.json", JSON.stringify(projects, null, 2));
}

function ensureProject(projectId) {
    const project = projects[projectId];
    if (!project) return null;
    if (!Array.isArray(project.messages)) {
        project.messages = [];
    }
    return project;
}

/** Resolve Roblox username to user id + display info (server-side to avoid browser CORS). */
app.post("/api/roblox/lookup", async (req, res) => {
    const rawUsername = String(req.body?.username ?? "").trim();
    const username = rawUsername.replace(/^@+/, "").trim();
    if (!username) {
        return res.status(400).json({ error: "Username is required." });
    }
    try {
        const usernamePayload = {
            usernames: [username],
            excludeBannedUsers: true,
        };

        let userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(usernamePayload),
        });
        let userJson = await userRes.json();
        let row = userJson?.data?.[0];

        // Retry once including banned users so legitimate lookups don't fail on this flag.
        if (!row?.id) {
            userRes = await fetch("https://users.roblox.com/v1/usernames/users", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ ...usernamePayload, excludeBannedUsers: false }),
            });
            userJson = await userRes.json();
            row = userJson?.data?.[0];
        }

        if (!row?.id) {
            return res.status(404).json({ error: "No Roblox user found with that username. Try without @ and double-check spelling." });
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

app.post("/api/roblox/challenge/start", (req, res) => {
    cleanupExpiredChallenges();

    const userId = Number(req.body?.userId);
    const username = String(req.body?.username ?? "").trim();
    if (!Number.isFinite(userId) || userId <= 0 || !username) {
        return res.status(400).json({ error: "A valid user id and username are required." });
    }

    const challengeId = Math.random().toString(36).slice(2);
    const code = randomChallengeCode(10);

    authChallenges.set(challengeId, {
        userId,
        username,
        code,
        createdAt: Date.now(),
        expiresAt: Date.now() + AUTH_CHALLENGE_TTL_MS,
    });

    res.json({ challengeId, code, expiresInMs: AUTH_CHALLENGE_TTL_MS });
});

app.post("/api/roblox/challenge/verify", async (req, res) => {
    cleanupExpiredChallenges();

    const challengeId = String(req.body?.challengeId ?? "").trim();
    if (!challengeId) {
        return res.status(400).json({ error: "Challenge id is required." });
    }

    const challenge = authChallenges.get(challengeId);
    if (!challenge) {
        return res.status(404).json({ error: "Challenge not found or expired. Start a new one." });
    }

    if (challenge.expiresAt <= Date.now()) {
        authChallenges.delete(challengeId);
        return res.status(410).json({ error: "Challenge expired. Start a new one." });
    }

    try {
        const profileRes = await fetch(`https://users.roblox.com/v1/users/${challenge.userId}`);
        const profileJson = await profileRes.json();
        const bio = String(profileJson?.description ?? "");

        if (!bio.includes(challenge.code)) {
            return res.status(403).json({
                error: "Verification code not found in bio yet. Save your Roblox bio and try again.",
            });
        }

        authChallenges.delete(challengeId);

        const thumbRes = await fetch(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${challenge.userId}&size=150x150&format=Png&isCircular=true`
        );
        const thumbJson = await thumbRes.json();
        const avatarUrl = thumbJson?.data?.[0]?.imageUrl ?? null;

        return res.json({
            verified: true,
            userId: challenge.userId,
            username: challenge.username,
            name: profileJson?.displayName || profileJson?.name || challenge.username,
            avatarUrl,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message || "Verification failed." });
    }
});

app.get("/api/purchases/links", (_req, res) => {
    res.json(PURCHASE_LINKS);
});

app.get("/api/projects", (_req, res) => {
    const list = Object.values(projects)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => ({
            id: p.id,
            name: p.name,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            messageCount: Array.isArray(p.messages) ? p.messages.length : 0,
        }));
    res.json({ projects: list });
});

app.post("/api/projects", (req, res) => {
    const name = String(req.body?.name ?? "").trim() || "Untitled project";
    const projectId = Math.random().toString(36).slice(2);
    const now = Date.now();
    projects[projectId] = {
        id: projectId,
        name,
        createdAt: now,
        updatedAt: now,
        messages: [],
    };
    saveProjects();
    res.status(201).json({ project: projects[projectId] });
});

app.get("/api/projects/:id", (req, res) => {
    const project = ensureProject(req.params.id);
    if (!project) {
        return res.status(404).json({ error: "Project not found." });
    }
    res.json({ project });
});

app.post("/api/projects/:id/messages", async (req, res) => {
    const project = ensureProject(req.params.id);
    if (!project) {
        return res.status(404).json({ error: "Project not found." });
    }

    const prompt = String(req.body?.prompt ?? "").trim();
    const provider = req.body?.provider;
    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required." });
    }

    project.messages.push({ role: "user", content: prompt });

    try {
        const aiResult = await generateAIResponse(prompt, { provider, messages: project.messages });
        const assistantText = aiResult?.explanation || JSON.stringify(aiResult, null, 2);
        project.messages.push({ role: "assistant", content: assistantText, payload: aiResult });
        project.updatedAt = Date.now();
        saveProjects();
        return res.json({ assistant: assistantText, result: aiResult, project });
    } catch (err) {
        project.messages.pop();
        return res.status(500).json({ error: err.message || "Generation failed." });
    }
});

app.use(express.static("public"));

app.get("/Dashboard", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/dashboard", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/Purchase", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "purchase.html"));
});

app.get("/purchase", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "purchase.html"));
});

app.get(["/success", "/projects/:id", "/Dashboard", "/dashboard"], (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get(/^\/(dashboard)(\/.*)?$/i, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get(["/Purchase", "/Purchases", "/purchase", "/purchases"], (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "purchase.html"));
});

app.get(/^\/(purchase|purchases)(\/.*)?$/i, (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "purchase.html"));
});

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(3000, () => {
    console.log("Running on http://localhost:3000");
});
