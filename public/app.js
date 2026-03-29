let pending = null;
let verified = false;

// ---------- AUTH ----------
const connectBtn = document.getElementById("roblox-connect-btn");
const verifyBtn = document.getElementById("roblox-verify-btn");
const cancelBtn = document.getElementById("roblox-verify-cancel-btn");

connectBtn?.addEventListener("click", () => {
    const username = document.getElementById("roblox-username-input").value.trim();

    if (!username) return alert("No username");

    const code = "ROS-" + Math.random().toString(36).slice(2, 8).toUpperCase();

    pending = { username, code };

    document.getElementById("auth-step-lookup").classList.add("hidden");
    document.getElementById("auth-step-verify").classList.remove("hidden");

    document.getElementById("auth-verify-username").textContent = username;
    document.getElementById("auth-verify-code").textContent = code;
});

cancelBtn?.addEventListener("click", () => {
    pending = null;

    document.getElementById("auth-step-verify").classList.add("hidden");
    document.getElementById("auth-step-lookup").classList.remove("hidden");
});

verifyBtn?.addEventListener("click", () => {
    if (!pending) return;

    verified = true;

    document.getElementById("auth-view").style.display = "none";

    alert("Verified!");
});

// ---------- CHAT ----------
const chat = document.getElementById("chat");
const input = document.getElementById("input");
const send = document.getElementById("send");

send?.addEventListener("click", sendMsg);

input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMsg();
});

function sendMsg() {
    const text = input.value.trim();
    if (!text) return;

    addMsg("user", text);
    input.value = "";

    setTimeout(() => {
        addMsg("ai", "🧠 response: " + text);
    }, 500);
}

function addMsg(role, text) {
    const div = document.createElement("div");

    div.className =
        role === "user"
            ? "text-right"
            : "text-left";

    div.innerHTML = `
        <div class="inline-block px-3 py-2 rounded text-sm ${
            role === "user"
                ? "bg-blue-600 text-white"
                : "bg-gray-200"
        }">
            ${text}
        </div>
    `;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}
