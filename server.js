const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

const MODEL_MAP = {
  "glm-4.7":          "z-ai/glm-4.7",
  "glm-4.7-flash":    "z-ai/glm-4.7-flash",
  "glm-5":            "z-ai/glm-5",
  "glm-5-turbo":      "z-ai/glm-5-turbo",
  "glm4.7":           "z-ai/glm-4.7",
  "glm5":             "z-ai/glm-5",
  "deepseek-chat":    "deepseek-chat",
  "gpt-4o":           "gpt-4o",
  "gpt-4o-mini":      "gpt-4o-mini",
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

    const puterRes = await fetch("https://api.puter.com/puterai/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: puterModel,
        messages: messages,
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
