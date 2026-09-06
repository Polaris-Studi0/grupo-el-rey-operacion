const WEBHOOK_PATH = "/api/whatsapp/webhook";
const SEND_PATH = "/api/whatsapp/send";
const HEALTH_PATH = "/api/whatsapp/health";

function response(body, status = 200, headers = {}){
  return new Response(body, { status, headers: { "content-type":"text/plain; charset=utf-8", "cache-control":"no-store", ...headers } });
}

function json(body, status = 200){
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } });
}

function verifySubscription(request, env){
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if(mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN && challenge) return response(challenge);
  return response("Verification failed", 403);
}

function bytesToHex(bytes){
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("");
}

function constantTimeEqual(left,right){
  if(left.length!==right.length)return false;
  let difference=0;
  for(let index=0;index<left.length;index+=1)difference|=left.charCodeAt(index)^right.charCodeAt(index);
  return difference===0;
}

async function validMetaSignature(rawBody,signatureHeader,appSecret){
  if(!appSecret)return true;
  if(!signatureHeader?.startsWith("sha256="))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(appSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,rawBody);
  return constantTimeEqual(`sha256=${bytesToHex(signature)}`,signatureHeader);
}

async function sha256(value){return bytesToHex(await crypto.subtle.digest("SHA-256",value));}

function describeWebhook(payload){
  const change=payload?.entry?.[0]?.changes?.[0];
  const value=change?.value||{};
  const message=value.messages?.[0];
  const status=value.statuses?.[0];
  return {eventType:message?"message":status?`message_${status.status||"status"}`:change?.field||"unknown",id:message?.id||status?.id};
}

async function persistInbox(payload,eventKey,eventType,env){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return true;
  const result=await fetch(`${env.SUPABASE_URL}/rest/v1/whatsapp_webhook_inbox?on_conflict=event_key`,{
    method:"POST",
    headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,"content-type":"application/json",prefer:"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({event_key:eventKey,event_type:eventType,payload})
  });
  if(!result.ok)throw new Error(`Supabase inbox respondió ${result.status}`);
  const inserted=await result.json();
  return inserted.length>0;
}

async function forwardToN8n(payload,eventKey,eventType,env){
  if(!env.N8N_WEBHOOK_URL)return;
  const result=await fetch(env.N8N_WEBHOOK_URL,{
    method:"POST",
    headers:{"content-type":"application/json","x-elrey-event-key":eventKey,"x-elrey-event-type":eventType,"x-elrey-webhook-secret":env.N8N_WEBHOOK_SECRET||""},
    body:JSON.stringify(payload)
  });
  if(!result.ok)throw new Error(`n8n respondió ${result.status}`);
}

async function processWebhook(payload,rawBody,env){
  const description=describeWebhook(payload);
  const eventKey=description.id||await sha256(rawBody);
  const isNew=await persistInbox(payload,eventKey,description.eventType,env);
  if(isNew)await forwardToN8n(payload,eventKey,description.eventType,env);
}

async function receiveWebhook(request,env,context){
  const rawBody=await request.arrayBuffer();
  if(!await validMetaSignature(rawBody,request.headers.get("x-hub-signature-256"),env.WHATSAPP_APP_SECRET))return response("Invalid signature",401);
  let payload;
  try{payload=JSON.parse(new TextDecoder().decode(rawBody));}catch{return response("Invalid JSON",400);}
  if(payload?.object!=="whatsapp_business_account")return response("Ignored");
  context.waitUntil(processWebhook(payload,rawBody,env).catch(error=>console.error("WhatsApp processing failed",error.message)));
  return response("EVENT_RECEIVED");
}

function authorizedInternalRequest(request,env){
  const expected=env.N8N_GATEWAY_SECRET;
  const received=request.headers.get("x-elrey-gateway-secret");
  return Boolean(expected&&received&&constantTimeEqual(expected,received));
}

async function sendWhatsApp(request,env){
  if(!authorizedInternalRequest(request,env))return json({error:"Unauthorized"},401);
  if(!env.WHATSAPP_ACCESS_TOKEN||!env.WHATSAPP_PHONE_NUMBER_ID)return json({error:"WhatsApp production credentials are not configured"},503);
  let message;
  try{message=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  if(!/^\d{8,15}$/.test(message.to||""))return json({error:"The recipient must be an international number without +"},400);
  if(!["text","template"].includes(message.type))return json({error:"Only text and template messages are allowed"},400);
  const body={messaging_product:"whatsapp",recipient_type:"individual",to:message.to,type:message.type};
  if(message.type==="text")body.text={preview_url:false,body:String(message.text||"").slice(0,4096)};
  if(message.type==="template")body.template=message.template;
  const graphVersion=env.META_GRAPH_VERSION||"v26.0";
  const result=await fetch(`https://graph.facebook.com/${graphVersion}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:"POST",headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,"content-type":"application/json"},body:JSON.stringify(body)});
  return json(await result.json(),result.status);
}

function health(env){
  return json({ok:true,webhookVerification:Boolean(env.WHATSAPP_VERIFY_TOKEN),signatureVerification:Boolean(env.WHATSAPP_APP_SECRET),inbox:Boolean(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY),automation:Boolean(env.N8N_WEBHOOK_URL&&env.N8N_WEBHOOK_SECRET),outboundMessaging:Boolean(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.N8N_GATEWAY_SECRET)});
}

export default {
  async fetch(request,env,context){
    const url = new URL(request.url);
    if(url.pathname===WEBHOOK_PATH&&request.method==="GET")return verifySubscription(request,env);
    if(url.pathname===WEBHOOK_PATH&&request.method==="POST")return receiveWebhook(request,env,context);
    if(url.pathname===SEND_PATH&&request.method==="POST")return sendWhatsApp(request,env);
    if(url.pathname===HEALTH_PATH&&request.method==="GET")return health(env);
    if(url.pathname.startsWith("/api/"))return response("Not found",404);
    return env.ASSETS.fetch(request);
  }
};
