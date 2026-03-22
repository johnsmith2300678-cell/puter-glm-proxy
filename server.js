const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

const MODEL_MAP = {
  // ── GLM (best for angst/RP) ──────────────────────────
  "glm-4.7":                "z-ai/glm-4.7",
  "glm-4.7-flash":          "z-ai/glm-4.7-flash",
  "glm-5":                  "z-ai/glm-5",

  // ── Claude ────────────────────────────────────────────
  "claude-sonnet":          "claude-sonnet-4-6",
  "claude-opus":            "claude-opus-4-6",
  "claude-haiku":           "claude-haiku-4-5",

  // ── DeepSeek ──────────────────────────────────────────
  "deepseek-chat":          "deepseek/deepseek-chat",
  "deepseek-r1":            "deepseek/deepseek-r1",

  // ── Gemini ────────────────────────────────────────────
  "gemini-flash":           "google/gemini-2.0-flash",
  "gemini-2.5-flash":       "google/gemini-2.5-flash",
  "gemini-2.5-pro":         "google/gemini-2.5-pro",

  // ── Grok ──────────────────────────────────────────────
  "grok-3":                 "x-ai/grok-3",
  "grok-3-mini":            "x-ai/grok-3-mini",

  // ── Mistral ───────────────────────────────────────────
  "mistral-large":          "mistral/mistral-large-latest",

  // ── GPT ───────────────────────────────────────────────
  "gpt-4o":                 "gpt-4o",
  "gpt-4o-mini":            "gpt-4o-mini",
};

function resolveModel(requested) {
  if (!requested) return "z-ai/glm-4.7";
  return MODEL_MAP[requested.toLowerCase()] || requested;
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Puter GLM Proxy is running!" });
});

app.get("/v1/models", (req, res) => {
  const models = Object.keys(MODEL_MAP).map((id) => ({
    id, object: "model", created: 1700000000, owned_by: "puter",
  }));
  res.json({ object: "list", data: models });
});

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "").trim() || process.env.PUTER_AUTH_TOKEN || "";

    if (!token) {
      return res.status(401).json({ error: { message: "No Puter auth token provided.", type: "auth_error" } });
    }

    const { messages, model, stream, max_tokens, temperature } = req.body;
    const puterModel = resolveModel(model);

    console.log(`[Request] Model: ${model} → ${puterModel}`);

    // ── Roleplay enhancer system prompt ──────────────────
    const rpSystemPrompt = {
      role: "system",
      content: `You are an expert creative writer specializing in emotionally rich roleplay. Follow these rules strictly:
- Always stay in character no matter what. Never break immersion.
- Write responses with vivid emotional depth, body language, and internal thoughts.
- Mirror the tone of the conversation — if it's angsty, be angsty. If it's tense, be tense.
- Use descriptive, literary prose. Show don't tell.
- Never summarize emotions — express them through actions, dialogue, and subtle details.
- Keep responses focused and immersive. Avoid filler words or repetition.
- Remember previous context and stay consistent with the character's personality and history.`
    };

    const hasSystemPrompt = messages && messages[0]?.role === "system";
    const enhancedMessages = hasSystemPrompt
      ? messages
      : [rpSystemPrompt, ...(messages || [])];

    const puterRes = await fetch("https://api.puter.com/puterai/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: puterModel,
        messages: enhancedMessages,
        max_tokens: max_tokens || 2048,
        temperature: temperature || 0.9,
        stream: false,
      }),
    });

    if (!puterRes.ok) {
      const errText = await puterRes.text();
      console.error(`[Puter Error] ${puterRes.status}: ${errText}`);
      return res.status(502).json({ error: { message: `Puter API error: ${puterRes.status} - ${errText}`, type: "upstream_error" } });
    }

    const puterData = await puterRes.json();
    const content = puterData?.choices?.[0]?.message?.content || "";

    const responseId = `chatcmpl-${Date.now()}`;

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const chunk = {
        id: responseId, object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000), model: puterModel,
        choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    return res.json({
      id: responseId, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: puterModel,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });

  } catch (err) {
    console.error("[Server Error]", err);
    return res.status(500).json({ error: { message: err.message, type: "server_error" } });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Puter GLM Proxy running on port ${PORT}`);
});
