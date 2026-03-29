(function () {
    const STORAGE_KEY = "roscript_roblox_user";
    const CREDITS_KEY = "roscript_credits_balance";

    const MODEL_OPTIONS = [
        { value: "openai", label: "OpenAI · GPT-5.4 Mini" },
        { value: "claude", label: "Claude · Sonnet 4.6" },
        { value: "deepseek", label: "DeepSeek · V3.2" },
        { value: "gemini", label: "Gemini · 3 Flash" },
    ];

    let pendingVerification = null;
    let projects = [];
    let activeProjectId = null;

    let projectRequestToken = 0;

    window.DEBUG = true;
    const log = (...args) => window.DEBUG && console.log("[RoScripter]", ...args);

    // ---------------- SAFE DOM ----------------
    function el(id) {
        const node = document.getElementById(id);
        if (!node) log("Missing element:", id);
        return node;
    }

    function escapeHtml(s) {
        const d = document.createElement("div");
        d.textContent = String(s ?? "");
        return d.innerHTML;
    }

    function avatarUrlForUser(u) {
        if (!u) return "";
        if (u.avatarUrl) return u.avatarUrl;
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=0891b2&color=fff&size=128`;
    }

    // ---------------- STORAGE ----------------
    const getStoredUser = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const saveUser = (u) => localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    const clearUser = () => localStorage.removeItem(STORAGE_KEY);

    const getStoredCredits = () => {
        const raw = localStorage.getItem(CREDITS_KEY);
        const n = Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
    };

    // ---------------- UI ----------------
    function showAuth() {
        el("auth-view")?.classList.remove("hidden");
        el("studio-view")?.classList.add("hidden");
    }

    function showStudio() {
        el("auth-view")?.classList.add("hidden");
        el("studio-view")?.classList.remove("hidden");
    }

    function renderCredits() {
        const pill = el("credits-pill");
        if (pill) pill.textContent = `Credits: ${getStoredCredits() ?? "--"}`;
    }

    function updateNavUser() {
        const slot = el("nav-user-slot");
        const u = getStoredUser();

        if (!slot) return;

        if (!u) {
            slot.classList.add("hidden");
            slot.innerHTML = "";
            return;
        }

        slot.classList.remove("hidden");
        slot.innerHTML = `
            <img src="${avatarUrlForUser(u)}" class="w-8 h-8 rounded-full border object-cover"/>
            <span class="text-sm font-medium truncate max-w-[120px]">
                ${escapeHtml(u.name || u.username)}
            </span>
        `;
    }

    // ---------------- PROJECTS ----------------
    function getActiveProject() {
        return projects.find(p => p.id === activeProjectId);
    }

    function renderProjects() {
        const list = el("project-list");
        if (!list) return;

        if (!projects.length) {
            list.innerHTML = `<p class="text-xs opacity-60">No projects yet.</p>`;
            return;
        }

        list.innerHTML = projects.map(p => `
            <button data-id="${p.id}" class="project-tab w-full text-left px-2 py-1.5 text-xs rounded
                ${p.id === activeProjectId ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700"}">
                ${escapeHtml(p.name)}
            </button>
        `).join("");

        list.querySelectorAll(".project-tab").forEach(btn => {
            btn.onclick = () => openProject(btn.dataset.id);
        });
    }

    function renderChat() {
        const chat = el("ai-chat-history");
        const title = el("active-project-name");

        const project = getActiveProject();

        if (title) title.textContent = project?.name || "No project selected";
        if (!chat) return;

        if (!project?.messages?.length) {
            chat.innerHTML = `<p class="text-xs opacity-60">Start chatting...</p>`;
            return;
        }

        chat.innerHTML = project.messages.map(m => {
            const isUser = m.role === "user";
            return `
                <div class="mb-2">
                    <div class="max-w-[85%] px-3 py-2 rounded text-xs whitespace-pre-wrap break-words
                        ${isUser ? "ml-auto bg-blue-600 text-white" : "mr-auto bg-gray-200 dark:bg-gray-700"}">
                        ${escapeHtml(m.content)}
                    </div>
                </div>
            `;
        }).join("");

        chat.scrollTop = chat.scrollHeight;
    }

    async function fetchProject(id) {
        const r = await fetch(`/api/projects/${id}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Failed project fetch");
        return d.project;
    }

    async function refreshProjects() {
        const token = ++projectRequestToken;

        const r = await fetch("/api/projects");
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Failed projects");

        projects = d.projects || [];

        if (!activeProjectId && projects.length) {
            activeProjectId = projects[0].id;
        }

        renderProjects();

        if (activeProjectId) {
            const full = await fetchProject(activeProjectId);
            if (token !== projectRequestToken) return;

            const idx = projects.findIndex(p => p.id === full.id);
            if (idx >= 0) projects[idx] = full;

            renderChat();
        }
    }

    async function openProject(id) {
        activeProjectId = id;
        const full = await fetchProject(id);

        const idx = projects.findIndex(p => p.id === id);
        if (idx >= 0) projects[idx] = full;
        else projects.unshift(full);

        renderProjects();
        renderChat();

        history.pushState({}, "", `/projects/${id}`);
    }

    async function createProject() {
        const input = el("new-project-name");
        const name = (input?.value || "").trim() || `Project ${projects.length + 1}`;

        const r = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });

        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Create failed");

        await refreshProjects();
        await openProject(d.project.id);
    }

    // ---------------- CHAT ----------------
    async function sendPrompt() {
        const ta = el("ai-prompt");
        const btn = el("ai-send-btn");

        const prompt = (ta?.value || "").trim();
        if (!prompt || !activeProjectId) return;

        btn && (btn.disabled = true);

        try {
            const r = await fetch(`/api/projects/${activeProjectId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, provider: el("ai-model")?.value || "openai" })
            });

            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Send failed");

            const idx = projects.findIndex(p => p.id === activeProjectId);
            if (idx >= 0) projects[idx] = d.project;

            renderChat();
            ta.value = "";
        } catch (e) {
            window.showToast?.(e.message);
        } finally {
            btn && (btn.disabled = false);
        }
    }

    // ---------------- AUTH ----------------
   async function connectRoblox() {
    const input = el("roblox-username-input");
    const username = (input?.value || "").trim().replace(/^@+/, "");
    if (!username) return;

    try {
        const lookupRes = await fetch("/api/roblox/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username })
        });

        const lookup = await lookupRes.json();
        console.log("LOOKUP:", lookup);

        if (!lookup.userId) {
            throw new Error("Lookup failed");
        }

        const challengeRes = await fetch("/api/roblox/challenge/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lookup)
        });

        const challenge = await challengeRes.json();
        console.log("CHALLENGE:", challenge);

        if (!challenge.challengeId || !challenge.code) {
            throw new Error("Challenge failed");
        }

        pendingVerification = challenge;

        const verifyBox = el("auth-step-verify");
        const lookupBox = el("auth-step-lookup");

        lookupBox?.classList.add("hidden");
        verifyBox?.classList.remove("hidden");

        // 💥 pokaż kod użytkownikowi (jeśli masz UI)
        const codeEl = el("challenge-code");
        if (codeEl) codeEl.textContent = challenge.code;

    } catch (e) {
        console.error("connectRoblox error:", e);
        window.showToast?.(e.message || "auth failed");
    }
}

   async function verifyRoblox() {
    if (!pendingVerification) return;

    try {
        const r = await fetch("/api/roblox/challenge/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                challengeId: pendingVerification.challengeId,
                code: pendingVerification.code
            })
        });

        const d = await r.json();
        console.log("VERIFY RESPONSE:", d);

        if (!r.ok) throw new Error(d.error || "Verify failed");

        saveUser(d);
        pendingVerification = null;

        sync();
        window.showToast?.("verified 🔥");

    } catch (e) {
        console.error("verify error:", e);
        window.showToast?.("verify failed");
    }
}

    function logout() {
        clearUser();
        projects = [];
        activeProjectId = null;
        sync();
    }

    // ---------------- SYNC ----------------
    function sync() {
        const u = getStoredUser();

        renderCredits();
        updateNavUser();

        if (u) {
            showStudio();
            refreshProjects().catch(() => {});
        } else {
            showAuth();
        }
    }

    // ---------------- INIT ----------------
    document.addEventListener("DOMContentLoaded", () => {
        el("roblox-connect-btn")?.addEventListener("click", connectRoblox);
        el("roblox-verify-btn")?.addEventListener("click", verifyRoblox);
        el("roblox-logout-btn")?.addEventListener("click", logout);
        el("ai-send-btn")?.addEventListener("click", sendPrompt);

        el("new-project-btn")?.addEventListener("click", () =>
            createProject().catch(e => window.showToast?.(e.message))
        );

        el("ai-prompt")?.addEventListener("keydown", e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendPrompt();
            }
        });

        const match = location.pathname.match(/\/projects\/([a-z0-9]+)/i);
        if (match) activeProjectId = match[1];

        sync();
    });

})();
