const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

const MODEL_MAP = {
  "glm-4.7":            "z-ai/glm-4.7",
  "glm-4.7-flash":      "z-ai/glm-4.7-flash",
  "glm-5":              "z-ai/glm-5",
  "glm-5-turbo":        "z-ai/glm-5-turbo",
  "glm4.7":             "z-ai/glm-4.7",
  "glm5":               "z-ai/glm-5",
  "deepseek-chat":      "deepseek-chat",
  "gpt-4o":             "gpt-4o",
  "gpt-4o-mini":        "gpt-4o-mini",
  "gemini-2.0-flash":   "gemini-2.0-flash",
};

function resolvModel(requested) {
  if (!requested) return "z-ai/glm-4.7";
  return MODEL_MAP[requested.toLowerCase()] || requested;
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Puter GLM Proxy is running!" });
});

app.get("/v1/models", (req, res) => {
  const models = Object.keys(MODEL_MAP).map((id) => ({
    id,
    object: "model",
    created: 1700000000,
    owned_by: "puter",
  }));
  res.json({ object: "list", data: models });
});

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token =
      authHeader.replace("Bearer ", "").trim() ||
      process.env.PUTER_AUTH_TOKEN ||
      "";

    if (!token) {
      return res.status(401).json({
        error: {
          message: "No Puter auth token provided.",
          type: "auth_error",
        },
      });
    }

    const { messages, model, stream, max_tokens, temperature } = req.body;
    const puterModel = resolvModel(model);

    console.log(`[Request] Model: ${model} → ${puterModel}`);

    cons
