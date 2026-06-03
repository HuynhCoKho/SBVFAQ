const form = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question");
const sendButton = document.querySelector("#send-button");
const messages = document.querySelector("#messages");
const statusLine = document.querySelector("#status");
const sampleButton = document.querySelector(".sample");

const config = window.SBVFAQ_CONFIG || {};

function setStatus(text, isError = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle("error", isError);
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = role === "user" ? "Bạn" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  article.append(avatar, bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function ensureConfigured() {
  if (!config.APPS_SCRIPT_WEB_APP_URL) {
    throw new Error("Chưa cấu hình APPS_SCRIPT_WEB_APP_URL trong file config.js.");
  }
}

function askAppsScript(question) {
  ensureConfigured();
  const callbackName = `sbvfaqCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const timeoutMs = Number(config.REQUEST_TIMEOUT_MS || 45000);
  const url = new URL(config.APPS_SCRIPT_WEB_APP_URL);
  url.searchParams.set("question", question);
  url.searchParams.set("callback", callbackName);

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Quá thời gian chờ Apps Script trả lời."));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (payload) => {
      cleanup();
      if (!payload || payload.ok === false) {
        reject(new Error(payload?.error || "Apps Script trả về lỗi không xác định."));
        return;
      }
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Không tải được Apps Script Web App. Hãy kiểm tra URL deploy và quyền truy cập."));
    };

    script.src = url.toString();
    document.body.append(script);
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;

  appendMessage("user", question);
  questionInput.value = "";
  questionInput.focus();
  sendButton.disabled = true;
  setStatus("Đang tra cứu FAQ và gọi AI...");

  const pending = appendMessage("bot", "Đang xử lý...");
  try {
    const payload = await askAppsScript(question);
    pending.querySelector(".bubble").textContent = payload.answer || "Không có câu trả lời.";
    const count = payload.matches?.length || 0;
    setStatus(count ? `Đã tham chiếu ${count} mục FAQ liên quan và lưu Log.` : "Đã lưu Log.");
  } catch (error) {
    pending.querySelector(".bubble").textContent = "Xin lỗi, hệ thống chưa trả lời được. Vui lòng thử lại sau.";
    setStatus(error.message, true);
  } finally {
    sendButton.disabled = false;
  }
}

form.addEventListener("submit", handleSubmit);
questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
sampleButton.addEventListener("click", () => {
  questionInput.value = sampleButton.textContent.trim();
  questionInput.focus();
});
