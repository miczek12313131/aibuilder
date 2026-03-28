(function () {
    const STORAGE_KEY = "roscript_roblox_user";

    const MODEL_OPTIONS = [
        { value: "openai", label: "OpenAI · GPT-5.4 Mini" },
        { value: "claude", label: "Claude · Sonnet 4.6" },
        { value: "deepseek", label: "DeepSeek · V3.2" },
        { value: "gemini", label: "Gemini · 3 Flash" },
    ];

    function getStoredUser() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const u = JSON.parse(raw);
            if (u && typeof u.userId === "number" && u.username) return u;
        } catch (_) {}
        return null;
    }

    function saveUser(payload) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    function clearUser() {
        localStorage.removeItem(STORAGE_KEY);
    }

    function showAuthView() {
        const auth = document.getElementById("auth-view");
        const studio = document.getElementById("studio-view");
        if (auth) auth.classList.remove("hidden");
        if (studio) studio.classList.add("hidden");
    }

    function showStudioView() {
        const auth = document.getElementById("auth-view");
        const studio = document.getElementById("studio-view");
        if (auth) auth.classList.add("hidden");
        if (studio) studio.classList.remove("hidden");
    }

    function updateNavUser() {
        const slot = document.getElementById("nav-user-slot");
        if (!slot) return;
        const u = getStoredUser();
        if (!u) {
            slot.classList.add("hidden");
            slot.classList.remove("flex");
            slot.innerHTML = "";
            return;
        }
        slot.classList.remove("hidden");
        slot.classList.add("flex");
        slot.innerHTML = `
            <img src="${avatarUrlForUser(u)}" alt="" class="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-600 object-cover" width="32" height="32" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-200 max-w-[120px] truncate">${escapeHtml(u.name || u.username)}</span>
        `;
    }

    function escapeHtml(s) {
        const d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
    }

    function avatarUrlForUser(u) {
        if (!u) return "";
        if (u.avatarUrl) return u.avatarUrl;
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=0891b2&color=fff&size=128`;
    }

    function syncModalToUser() {
        const u = getStoredUser();
        const err = document.getElementById("auth-error");
        if (err) {
            err.classList.add("hidden");
            err.textContent = "";
        }
        if (u) {
            const av = document.getElementById("studio-avatar");
            const dn = document.getElementById("studio-display-name");
            const uid = document.getElementById("studio-user-id");
            if (av) {
                av.src = avatarUrlForUser(u);
                av.alt = u.name || u.username;
            }
            if (dn) dn.textContent = u.name || u.username;
            if (uid) uid.textContent = `ID: ${u.userId} · @${u.username}`;
            showStudioView();
        } else {
            showAuthView();
        }
    }

    window.openAppModal = function openAppModal() {
        const modal = document.getElementById("app-modal");
        if (!modal) return;
        syncModalToUser();
        modal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
        if (window.lucide) lucide.createIcons();
    };

    window.closeAppModal = function closeAppModal() {
        const modal = document.getElementById("app-modal");
        if (!modal) return;
        modal.classList.add("hidden");
        document.body.style.overflow = "auto";
    };

    async function onConnectRoblox() {
        const input = document.getElementById("roblox-username-input");
        const errEl = document.getElementById("auth-error");
        const btn = document.getElementById("roblox-connect-btn");
        const username = (input?.value || "").trim();
        if (!username) {
            if (errEl) {
                errEl.textContent = "Enter your Roblox username.";
                errEl.classList.remove("hidden");
            }
            return;
        }
        if (errEl) errEl.classList.add("hidden");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Connecting…";
        }
        try {
            const res = await fetch("/api/roblox/lookup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || res.statusText);
            }
            saveUser({
                userId: data.userId,
                username: data.username,
                name: data.name,
                avatarUrl: data.avatarUrl,
                connectedAt: Date.now(),
            });
            syncModalToUser();
            updateNavUser();
            if (typeof window.showToast === "function") {
                window.showToast("Roblox account connected.");
            }
        } catch (e) {
            if (errEl) {
                errEl.textContent = e.message || "Could not connect.";
                errEl.classList.remove("hidden");
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Connect";
            }
        }
    }

    function onLogout() {
        clearUser();
        syncModalToUser();
        updateNavUser();
        const out = document.getElementById("ai-output");
        if (out) {
            out.classList.add("hidden");
            out.textContent = "";
        }
        const ta = document.getElementById("ai-prompt");
        if (ta) ta.value = "";
        if (typeof window.showToast === "function") {
            window.showToast("Logged out.");
        }
    }

    async function onSendPrompt() {
        const ta = document.getElementById("ai-prompt");
        const sel = document.getElementById("ai-model");
        const out = document.getElementById("ai-output");
        const btn = document.getElementById("ai-send-btn");
        const prompt = (ta?.value || "").trim();
        if (!prompt) {
            if (typeof window.showToast === "function") window.showToast("Enter a prompt first.");
            return;
        }
        if (!getStoredUser()) {
            if (typeof window.showToast === "function") window.showToast("Connect your Roblox account first.");
            return;
        }
        const provider = sel?.value || "openai";
        if (btn) {
            btn.disabled = true;
            btn.textContent = "…";
        }
        if (out) {
            out.classList.remove("hidden");
            out.textContent = "Generating…";
        }
        try {
            const res = await fetch("/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, provider }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            const jobId = data.jobId;
            let job = {};
            for (let i = 0; i < 60; i++) {
                const jr = await fetch(`/jobs/${jobId}`);
                job = await jr.json();
                if (job && job.result) break;
                await new Promise((r) => setTimeout(r, 500));
            }
            if (out) {
                out.textContent = job.result
                    ? JSON.stringify(job.result, null, 2)
                    : "Timed out waiting for result.";
            }
            if (typeof window.showToast === "function") window.showToast("Generation complete.");
        } catch (e) {
            if (out) out.textContent = "Error: " + (e.message || String(e));
            if (typeof window.showToast === "function") window.showToast(e.message || "Request failed.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Send";
            }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const modelSelect = document.getElementById("ai-model");
        if (modelSelect && modelSelect.options.length === 0) {
            MODEL_OPTIONS.forEach((o) => {
                const opt = document.createElement("option");
                opt.value = o.value;
                opt.textContent = o.label;
                modelSelect.appendChild(opt);
            });
        }

        document.getElementById("roblox-connect-btn")?.addEventListener("click", onConnectRoblox);
        document.getElementById("roblox-username-input")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                onConnectRoblox();
            }
        });
        document.getElementById("roblox-logout-btn")?.addEventListener("click", onLogout);
        document.getElementById("ai-send-btn")?.addEventListener("click", onSendPrompt);
        document.getElementById("ai-prompt")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onSendPrompt();
            }
        });

        updateNavUser();
    });

    window.openSignupModal = window.openAppModal;
    window.closeSignupModal = window.closeAppModal;
})();
