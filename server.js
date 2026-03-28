import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import { generateAIResponse } from "./ai.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

let jobs = {};

// load database
if (fs.existsSync("jobs.json")) {
    jobs = JSON.parse(fs.readFileSync("jobs.json"));
}

function saveJobs() {
    fs.writeFileSync("jobs.json", JSON.stringify(jobs, null, 2));
}

// CREATE JOB
app.post("/generate", async (req, res) => {
    const prompt = req.body.prompt;

    const aiResult = await generateAIResponse(prompt);

    const jobId = Math.random().toString(36).slice(2);

    jobs[jobId] = {
        prompt,
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