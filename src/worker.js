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
  if(!appSecret)return false;
  if(!signatureHeader?.startsWith("sha256="))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(appSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,rawBody);
  return constantTimeEqual(`sha256=${bytesToHex(signature)}`,signatureHeader);
}

async function sha256(value){return bytesToHex(await crypto.subtle.digest("SHA-256",value));}

function supabaseKey(env){
  return env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||"";
}

function supabaseHeaders(env,additionalHeaders={}){
  const apiKey=supabaseKey(env);
  const headers={apikey:apiKey,"content-type":"application/json",...additionalHeaders};
  // Las nuevas llaves sb_secret_* se autentican únicamente mediante apikey.
  // Authorization: Bearer se conserva solo para la llave JWT service_role heredada.
  if(apiKey&&!apiKey.startsWith("sb_secret_"))headers.authorization=`Bearer ${apiKey}`;
  return headers;
}

function describeWebhook(payload){
  const change=payload?.entry?.[0]?.changes?.[0];
  const value=change?.value||{};
  const message=value.messages?.[0];
  const status=value.statuses?.[0];
  return {eventType:message?"message":status?`message_${status.status||"status"}`:change?.field||"unknown"};
}

async function persistInbox(payload,eventKey,eventType,env){
  if(!env.SUPABASE_URL||!supabaseKey(env))throw new Error("Supabase inbox is not configured");
  const result=await fetch(`${env.SUPABASE_URL}/rest/v1/whatsapp_webhook_inbox?on_conflict=event_key`,{
    method:"POST",
    headers:supabaseHeaders(env,{prefer:"resolution=ignore-duplicates,return=minimal"}),
    body:JSON.stringify({event_key:eventKey,event_type:eventType,payload})
  });
  if(!result.ok)throw new Error(`Supabase inbox respondió ${result.status}`);
}

async function supabaseRpc(name,body,env){
  const result=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:supabaseHeaders(env),
    body:JSON.stringify(body)
  });
  if(!result.ok)throw new Error(`Supabase RPC ${name} respondió ${result.status}`);
  const contentType=result.headers.get("content-type")||"";
  return contentType.includes("application/json")?result.json():null;
}

async function forwardToN8n(payload,eventKey,eventType,leaseId,env){
  if(!env.N8N_WEBHOOK_URL)return;
  const result=await fetch(env.N8N_WEBHOOK_URL,{
    method:"POST",
    headers:{"content-type":"application/json","x-elrey-event-key":eventKey,"x-elrey-event-type":eventType,"x-elrey-lease-id":leaseId,"x-elrey-webhook-secret":env.N8N_WEBHOOK_SECRET||""},
    body:JSON.stringify(payload)
  });
  if(!result.ok)throw new Error(`n8n respondió ${result.status}`);
}

async function processWebhook(payload,eventKey,eventType,env){
  if(!env.N8N_WEBHOOK_URL)return;
  const claimed=await supabaseRpc("claim_whatsapp_event",{p_event_key:eventKey},env);
  const inbox=claimed?.[0];
  if(!inbox)return;
  try{
    await forwardToN8n(payload,eventKey,eventType,inbox.lease_id,env);
    await supabaseRpc("complete_whatsapp_event",{p_event_key:eventKey,p_lease_id:inbox.lease_id,p_error:null},env);
  }catch(error){
    await supabaseRpc("complete_whatsapp_event",{p_event_key:eventKey,p_lease_id:inbox.lease_id,p_error:error.message},env);
    throw error;
  }
}

async function receiveWebhook(request,env,context){
  const rawBody=await request.arrayBuffer();
  if(!env.WHATSAPP_APP_SECRET)return response("Webhook signature verification is not configured",503);
  if(!await validMetaSignature(rawBody,request.headers.get("x-hub-signature-256"),env.WHATSAPP_APP_SECRET))return response("Invalid signature",401);
  let payload;
  try{payload=JSON.parse(new TextDecoder().decode(rawBody));}catch{return response("Invalid JSON",400);}
  if(payload?.object!=="whatsapp_business_account")return response("Ignored");
  const description=describeWebhook(payload);
  const eventKey=`payload:${await sha256(rawBody)}`;
  try{await persistInbox(payload,eventKey,description.eventType,env);}catch(error){console.error("WhatsApp persistence failed",error.message);return response("Temporary persistence failure",503);}
  context.waitUntil(processWebhook(payload,eventKey,description.eventType,env).catch(error=>console.error("WhatsApp processing failed",error.message)));
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
  let requestBody;
  try{requestBody=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestBody.message_id||""))return json({error:"A queued message_id is required"},400);
  const leaseId=crypto.randomUUID();
  const claim=await supabaseRpc("claim_outbound_whatsapp_message",{p_message_id:requestBody.message_id,p_lease_id:leaseId},env);
  if(!claim?.send){
    if(claim?.state==="sent")return json({ok:true,duplicate:true,message_id:claim.message_id,meta_message_id:claim.meta_message_id});
    return json({error:"Message is not available for automatic sending",state:claim?.state||"unknown",reason:claim?.reason||null},409);
  }
  if(!/^\d{8,15}$/.test(claim.to||""))return json({error:"Stored recipient is invalid"},500);
  const body={messaging_product:"whatsapp",recipient_type:"individual",to:claim.to,type:claim.type};
  if(claim.type==="text")body.text={preview_url:false,body:String(claim.text||"").slice(0,4096)};
  if(claim.type==="template")body.template=claim.template;
  const graphVersion=env.META_GRAPH_VERSION||"v26.0";
  let result;
  try{
    result=await fetch(`https://graph.facebook.com/${graphVersion}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:"POST",headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,"content-type":"application/json"},body:JSON.stringify(body)});
  }catch(error){
    await supabaseRpc("complete_outbound_whatsapp_message",{p_message_id:claim.message_id,p_lease_id:leaseId,p_meta_message_id:null,p_response:{},p_error:error.message,p_uncertain:true},env);
    return json({error:"Meta delivery result is uncertain; manual review is required"},502);
  }
  const metaResponse=await result.json().catch(()=>({}));
  const metaMessageId=metaResponse?.messages?.[0]?.id||null;
  if(result.ok&&metaMessageId){
    await supabaseRpc("complete_outbound_whatsapp_message",{p_message_id:claim.message_id,p_lease_id:leaseId,p_meta_message_id:metaMessageId,p_response:metaResponse,p_error:null,p_uncertain:false},env);
  }else{
    const metaError=metaResponse?.error?.message||`Meta respondió ${result.status}`;
    await supabaseRpc("complete_outbound_whatsapp_message",{p_message_id:claim.message_id,p_lease_id:leaseId,p_meta_message_id:null,p_response:metaResponse,p_error:metaError,p_uncertain:result.ok},env);
  }
  return json(metaResponse,result.ok&&metaMessageId?result.status:result.ok?502:result.status);
}

function health(env){
  return json({ok:true,webhookVerification:Boolean(env.WHATSAPP_VERIFY_TOKEN),signatureVerification:Boolean(env.WHATSAPP_APP_SECRET),inbox:Boolean(env.SUPABASE_URL&&supabaseKey(env)),automation:Boolean(env.N8N_WEBHOOK_URL&&env.N8N_WEBHOOK_SECRET),outboundMessaging:Boolean(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.N8N_GATEWAY_SECRET)});
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
