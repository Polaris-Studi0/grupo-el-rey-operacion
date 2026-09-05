const WEBHOOK_PATH = "/api/whatsapp/webhook";

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

function verifyWebhook(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    env.WHATSAPP_VERIFY_TOKEN &&
    token === env.WHATSAPP_VERIFY_TOKEN
  ) {
    return textResponse(challenge);
  }

  return textResponse("Webhook verification failed", 403);
}

async function receiveWebhook(request) {
  try {
    const payload = await request.json();
    const entries = Array.isArray(payload?.entry) ? payload.entry.length : 0;
    console.log("WhatsApp webhook received", { entries });
    return textResponse("EVENT_RECEIVED");
  } catch {
    return textResponse("Invalid JSON", 400);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === WEBHOOK_PATH) {
      if (request.method === "GET") return verifyWebhook(request, env);
      if (request.method === "POST") return receiveWebhook(request);
      return textResponse("Method not allowed", 405);
    }

    if (url.pathname.startsWith("/api/")) {
      return textResponse("Not found", 404);
    }

    return env.ASSETS.fetch(request);
  },
};
