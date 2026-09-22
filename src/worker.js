const WEBHOOK_PATH = "/api/whatsapp/webhook";
const SEND_PATH = "/api/whatsapp/send";
const HEALTH_PATH = "/api/whatsapp/health";
const AUTOMATION_WAKE_PATH = "/api/automation/wake";
const OPERATOR_ACTION_PATH = "/api/operator/conversation";
const OPERATOR_MEDIA_PATH = "/api/operator/media";
const PQRS_PATH = "/api/pqrs";
const PQRS_STATUS_PATH = "/api/pqrs/status";
const PQRS_ADMIN_PATH = "/api/pqrs/admin";
const PRIVACY_PATH = "/privacidad";
const DATA_DELETION_PATH = "/eliminacion-de-datos";

function response(body, status = 200, headers = {}){
  return new Response(body, { status, headers: { "content-type":"text/plain; charset=utf-8", "cache-control":"no-store", ...headers } });
}

function json(body, status = 200){
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } });
}

const PQRS_PUBLIC_ORIGINS=new Set([
  "https://almaceneselrey.co",
  "https://www.almaceneselrey.co",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]);

function pqrsCorsHeaders(request){
  const origin=request.headers.get("origin")||"";
  return {
    ...(PQRS_PUBLIC_ORIGINS.has(origin)?{"access-control-allow-origin":origin,"vary":"origin"}:{}),
    "access-control-allow-methods":"POST,PATCH,OPTIONS",
    "access-control-allow-headers":"content-type,authorization",
    "access-control-max-age":"86400"
  };
}

function pqrsJson(request,body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...pqrsCorsHeaders(request)}});
}

function legalPage(title,description,content){
  return new Response(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${description}">
  <title>${title} | Grupo Almacenes El Rey</title>
  <style>
    :root{color-scheme:light;--ink:#171715;--muted:#66645f;--gold:#b48600;--paper:#f7f6f1;--card:#fff;--line:#dedbd1}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(820px,calc(100% - 32px));margin:48px auto;padding:clamp(28px,6vw,64px);background:var(--card);border:1px solid var(--line);border-radius:24px;box-shadow:0 18px 60px rgba(23,23,21,.08)}
    .eyebrow{margin:0 0 8px;color:var(--gold);font-size:.78rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}h1{margin:0;font-size:clamp(2rem,6vw,3.6rem);line-height:1.05;letter-spacing:-.04em}h2{margin:2.25rem 0 .5rem;font-size:1.25rem}p,li{color:var(--muted)}ul{padding-left:1.25rem}a{color:#705600;font-weight:700}.meta{margin:1rem 0 2rem;color:var(--muted)}.notice{padding:18px 20px;border-left:4px solid var(--gold);background:#fff9df;border-radius:10px}footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
  </style>
</head>
<body><main><p class="eyebrow">Grupo Almacenes El Rey</p><h1>${title}</h1>${content}<footer>Última actualización: 6 de septiembre de 2026 · Colombia</footer></main></body>
</html>`,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"public, max-age=3600","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
}

function privacyPolicy(){
  return legalPage("Política de privacidad","Política de tratamiento de datos del canal de WhatsApp de Grupo Almacenes El Rey",`
    <p class="meta">Esta política explica cómo tratamos la información de las personas que se comunican con nuestro canal de WhatsApp.</p>
    <p class="notice"><strong>Continuar la conversación después de recibir nuestro aviso de privacidad y responder “ACEPTO” constituye autorización para tratar los datos necesarios para atender la solicitud.</strong> También puedes responder “NO ACEPTO” y finalizar la atención automatizada.</p>
    <h2>1. Responsable</h2>
    <p>Grupo Almacenes El Rey, Colombia, es responsable del tratamiento realizado para atender este canal. Las solicitudes sobre datos personales pueden presentarse escribiendo al WhatsApp <a href="https://wa.me/573147899116">+57 314 789 9116</a>.</p>
    <h2>2. Información que tratamos</h2>
    <ul><li>Nombre, número de teléfono y datos de identificación del perfil de WhatsApp.</li><li>Mensajes, archivos y motivo de la consulta.</li><li>Sede de interés, productos consultados y datos necesarios para preparar una venta.</li><li>Dirección, barrio y datos de contacto cuando se solicita domicilio.</li><li>Medio de pago y comprobante de transferencia cuando el cliente decide aportarlo.</li><li>Historial técnico de entrega, lectura, atención y decisiones humanas necesarias para conservar la trazabilidad.</li></ul>
    <h2>3. Finalidades</h2>
    <p>Usamos los datos para responder consultas, informar horarios, sedes, promociones y disponibilidad; gestionar pedidos, pagos y domicilios; tramitar alternativas como Addi o Sistecrédito; solicitar validaciones a personal autorizado; prevenir fraude; prestar soporte y conservar la trazabilidad de la atención.</p>
    <h2>4. Automatización e inteligencia artificial</h2>
    <p>El canal usa automatización e inteligencia artificial para clasificar solicitudes y redactar respuestas con base en información comercial autorizada. La IA no confirma pagos, no aprueba créditos, no fija costos de domicilio y no garantiza existencias no verificadas: esos casos se remiten a una persona.</p>
    <h2>5. Proveedores</h2>
    <p>Para operar el servicio podemos encargar tratamiento a proveedores tecnológicos como Meta/WhatsApp, Cloudflare, n8n, Supabase y proveedores de modelos de inteligencia artificial. Solo se comparte la información necesaria para prestar y proteger el servicio. Algunos proveedores pueden procesar información fuera de Colombia bajo sus mecanismos contractuales y de seguridad.</p>
    <h2>6. Conservación y seguridad</h2>
    <p>Conservamos la información durante el tiempo razonablemente necesario para las finalidades descritas y para cumplir obligaciones legales, contables, de seguridad y atención de reclamaciones. Después se elimina o anonimiza. Aplicamos controles de acceso, trazabilidad y medidas técnicas razonables, aunque ningún sistema es completamente infalible.</p>
    <h2>7. Derechos de los titulares</h2>
    <p>Puedes conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; conocer el uso dado a la información; revocar la autorización o pedir la supresión cuando proceda; acceder gratuitamente a tus datos y presentar quejas ante la Superintendencia de Industria y Comercio una vez agotado el trámite directo.</p>
    <h2>8. Consultas, reclamos y eliminación</h2>
    <p>Escribe al WhatsApp indicado, identifica el número relacionado con la conversación y explica tu solicitud. Para pedir eliminación puedes enviar “ELIMINAR MIS DATOS” o consultar las <a href="${DATA_DELETION_PATH}">instrucciones de eliminación</a>. Podremos solicitar información razonable para verificar la identidad antes de actuar.</p>
    <h2>9. Cambios</h2>
    <p>Podemos actualizar esta política cuando cambien el servicio o las obligaciones aplicables. La versión vigente siempre estará publicada en esta dirección.</p>`);
}

function dataDeletionInstructions(){
  return legalPage("Eliminación de datos","Instrucciones para solicitar la eliminación de datos personales",`
    <p class="meta">Puedes solicitar acceso, corrección o eliminación de los datos asociados a tu conversación de WhatsApp.</p>
    <h2>Cómo solicitarla</h2>
    <ol><li>Desde el número utilizado en la conversación, escribe <strong>ELIMINAR MIS DATOS</strong> al WhatsApp <a href="https://wa.me/573147899116">+57 314 789 9116</a>.</li><li>Indica tu nombre y, si la conoces, la sede o el pedido relacionado.</li><li>Confirmaremos la recepción y podremos pedir una verificación razonable de identidad para evitar eliminar información de otra persona.</li></ol>
    <h2>Qué ocurre después</h2>
    <p>Revisaremos la solicitud y eliminaremos o anonimizaremos los datos que procedan dentro de los términos aplicables. Informaremos el resultado por el mismo canal. Podremos conservar la información estrictamente necesaria cuando exista una obligación legal, contable, contractual, de prevención de fraude o para la defensa de reclamaciones.</p>
    <h2>Alcance</h2>
    <p>La eliminación abarca la información controlada por Grupo Almacenes El Rey. Los datos que Meta/WhatsApp u otros proveedores traten como responsables independientes están sujetos a sus propias políticas y herramientas.</p>
    <p><a href="${PRIVACY_PATH}">Volver a la política de privacidad</a></p>`);
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
  if(!env.N8N_WEBHOOK_URL)throw new Error("n8n webhook is not configured");
  // Retry transient transport errors with the SAME event/message IDs. Ingress,
  // decisions and outbound messages already have independent idempotency keys.
  for(let attempt=0;attempt<3;attempt+=1){
    try{
      const result=await fetch(env.N8N_WEBHOOK_URL,{
        method:"POST",
        headers:{"content-type":"application/json","x-elrey-event-key":eventKey,"x-elrey-event-type":eventType,"x-elrey-lease-id":leaseId,"x-elrey-webhook-secret":env.N8N_WEBHOOK_SECRET||""},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(25000)
      });
      if(result.ok)return;
      const error=new Error(`n8n respondió ${result.status}`);
      error.permanent=result.status<500&&![408,429].includes(result.status);
      throw error;
    }catch(error){
      if(error.permanent||attempt===2)throw error;
      await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
    }
  }
}

function mediaExtension(mimeType,messageType){
  const byMime={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf","audio/ogg":"ogg","audio/mpeg":"mp3"};
  return byMime[mimeType]||({image:"jpg",document:"bin",audio:"ogg",sticker:"webp"}[messageType]||"bin");
}

function collectInboundMedia(payload){
  const records=[];
  for(const entry of Array.isArray(payload?.entry)?payload.entry:[]){
    for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
      for(const message of Array.isArray(change?.value?.messages)?change.value.messages:[]){
        const media=message?.[message.type];
        if(!message?.id||!media?.id)continue;
        records.push({metaMessageId:message.id,mediaId:media.id,messageType:message.type,originalName:media.filename||null});
      }
    }
  }
  return records;
}

async function persistOneInboundMedia(record,env){
  const messageResponse=await fetch(`${env.SUPABASE_URL}/rest/v1/whatsapp_messages?meta_message_id=eq.${encodeURIComponent(record.metaMessageId)}&select=id,conversation_id&limit=1`,{headers:supabaseHeaders(env)});
  if(!messageResponse.ok)throw new Error(`No fue posible localizar el mensaje multimedia (${messageResponse.status})`);
  const message=(await messageResponse.json())?.[0];
  if(!message)return;

  const existingResponse=await fetch(`${env.SUPABASE_URL}/rest/v1/whatsapp_attachments?message_id=eq.${encodeURIComponent(message.id)}&meta_media_id=eq.${encodeURIComponent(record.mediaId)}&select=id,storage_path&limit=1`,{headers:supabaseHeaders(env)});
  if(existingResponse.ok){const existing=(await existingResponse.json())?.[0];if(existing)return existing.storage_path;}

  const graphVersion=env.META_GRAPH_VERSION||"v26.0";
  const metadataResponse=await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(record.mediaId)}`,{headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`}});
  const metadata=await metadataResponse.json().catch(()=>({}));
  if(!metadataResponse.ok||!metadata.url)throw new Error(metadata?.error?.message||`Meta no entregó el archivo (${metadataResponse.status})`);
  const fileResponse=await fetch(metadata.url,{headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`}});
  if(!fileResponse.ok)throw new Error(`No fue posible descargar el archivo de Meta (${fileResponse.status})`);
  const mimeType=(fileResponse.headers.get("content-type")||metadata.mime_type||"application/octet-stream").split(";")[0].trim().toLowerCase();
  const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf","audio/ogg","audio/mpeg"]);
  if(!allowed.has(mimeType))throw new Error(`Tipo de archivo no permitido: ${mimeType}`);
  const bytes=await fileResponse.arrayBuffer();
  if(bytes.byteLength<1||bytes.byteLength>10*1024*1024)throw new Error("El archivo recibido supera el límite permitido");
  const extension=mediaExtension(mimeType,record.messageType);
  const storagePath=`${message.conversation_id}/${message.id}/${record.mediaId}.${extension}`;
  const uploadResponse=await fetch(`${env.SUPABASE_URL}/storage/v1/object/whatsapp-media/${storagePath.split("/").map(encodeURIComponent).join("/")}`,{
    method:"POST",headers:supabaseHeaders(env,{"content-type":mimeType,"x-upsert":"true"}),body:bytes
  });
  if(!uploadResponse.ok)throw new Error(`Supabase Storage rechazó el archivo (${uploadResponse.status})`);
  const attachmentResponse=await fetch(`${env.SUPABASE_URL}/rest/v1/whatsapp_attachments?on_conflict=message_id,meta_media_id`,{
    method:"POST",headers:supabaseHeaders(env,{prefer:"resolution=ignore-duplicates,return=minimal"}),
    body:JSON.stringify({conversation_id:message.conversation_id,message_id:message.id,meta_media_id:record.mediaId,storage_path:storagePath,original_name:record.originalName||`archivo-whatsapp.${extension}`,mime_type:mimeType,size_bytes:bytes.byteLength,sha256:await sha256(bytes)})
  });
  if(!attachmentResponse.ok)throw new Error(`No fue posible registrar el archivo (${attachmentResponse.status})`);
  return storagePath;
}

async function persistInboundMedia(payload,env){
  if(!env.WHATSAPP_ACCESS_TOKEN)return;
  for(const record of collectInboundMedia(payload)){
    let lastError;
    for(let attempt=0;attempt<3;attempt+=1){
      try{await persistOneInboundMedia(record,env);lastError=null;break;}
      catch(error){lastError=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));}
    }
    if(lastError)console.error("WhatsApp media persistence failed",record.metaMessageId,lastError.message);
  }
}

async function authenticatedOperator(request,env){
  const authorization=request.headers.get("authorization")||"";
  if(!authorization.startsWith("Bearer ")||!env.SUPABASE_URL||!supabaseKey(env))return null;
  const userResponse=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{
    headers:{apikey:supabaseKey(env),authorization}
  });
  if(!userResponse.ok)return null;
  const user=await userResponse.json();
  if(!user?.id)return null;
  const profileResponse=await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id`,{
    headers:supabaseHeaders(env)
  });
  if(!profileResponse.ok)return null;
  const profiles=await profileResponse.json();
  return profiles?.[0]?user:null;
}

async function wakeAutomation(request,env){
  if(!env.N8N_AUTOMATION_URL||!env.N8N_WEBHOOK_SECRET)return json({error:"Automation webhook is not configured"},503);
  const operator=await authenticatedOperator(request,env);
  if(!operator)return json({error:"Unauthorized"},401);
  let body;
  try{body=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.task_id||""))return json({error:"A task_id is required"},400);
  let lastError;
  for(let attempt=0;attempt<3;attempt+=1){
    try{
      const result=await fetch(env.N8N_AUTOMATION_URL,{
        method:"POST",
        headers:{"content-type":"application/json","x-elrey-webhook-secret":env.N8N_WEBHOOK_SECRET},
        body:JSON.stringify({task_id:body.task_id,operator_id:operator.id,trigger:"human_task_resolved"})
      });
      if(!result.ok)throw new Error(`n8n respondió ${result.status}`);
      return json({ok:true,task_id:body.task_id});
    }catch(error){
      lastError=error;
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
    }
  }
  return json({error:lastError?.message||"No fue posible activar la automatización"},502);
}

function collectMessageStatuses(payload,eventKey){
  const records=[];
  const entries=Array.isArray(payload?.entry)?payload.entry:[];
  entries.forEach((entry,entryIndex)=>{
    const changes=Array.isArray(entry?.changes)?entry.changes:[];
    changes.forEach((change,changeIndex)=>{
      const value=change?.value||{};
      const statuses=Array.isArray(value.statuses)?value.statuses:[];
      statuses.forEach((status,statusIndex)=>{
        if(!status?.id||!status?.status)return;
        records.push({
          p_meta_message_id:status.id,
          p_status:status.status,
          p_timestamp:status.timestamp?new Date(Number(status.timestamp)*1000).toISOString():null,
          p_raw_payload:{...status,contacts:value.contacts||[],metadata:value.metadata||{}},
          p_status_event_key:`${eventKey}:${entryIndex}:${changeIndex}:${statusIndex}:${status.id}:${status.status}`
        });
      });
    });
  });
  return records;
}

async function persistMessageStatuses(payload,eventKey,env){
  for(const record of collectMessageStatuses(payload,eventKey)){
    let lastError;
    for(let attempt=0;attempt<3;attempt+=1){
      try{
        await supabaseRpc("record_whatsapp_message_status",record,env);
        lastError=null;
        break;
      }catch(error){
        lastError=error;
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
      }
    }
    if(lastError)throw lastError;
  }
}

async function processWebhook(payload,eventKey,eventType,env){
  const claimed=await supabaseRpc("claim_whatsapp_event",{p_event_key:eventKey},env);
  const inbox=claimed?.[0];
  if(!inbox)return;
  return processClaimedWebhook(payload,eventKey,eventType,inbox,env);
}

async function processClaimedWebhook(payload,eventKey,eventType,inbox,env){
  try{
    const statuses=collectMessageStatuses(payload,eventKey);
    if(statuses.length)await persistMessageStatuses(payload,eventKey,env);
    const hasMessages=(payload.entry||[]).some(entry=>(entry.changes||[]).some(change=>Array.isArray(change.value?.messages)&&change.value.messages.length>0));
    if(hasMessages){
      // Meta may batch delivery statuses and customer messages in one event.
      // Statuses are already persisted here; only messages need an n8n run.
      const messagePayload={...payload,entry:payload.entry.map(entry=>({...entry,changes:(entry.changes||[]).map(change=>({...change,value:{...change.value,statuses:[]}}))}))};
      let automationError;
      try{await forwardToN8n(messagePayload,eventKey,eventType,inbox.lease_id,env);}catch(error){automationError=error;}
      await persistInboundMedia(payload,env);
      if(automationError)throw automationError;
    }
    await supabaseRpc("complete_whatsapp_event",{p_event_key:eventKey,p_lease_id:inbox.lease_id,p_error:null},env);
  }catch(error){
    await supabaseRpc("complete_whatsapp_event",{p_event_key:eventKey,p_lease_id:inbox.lease_id,p_error:error.message},env);
    throw error;
  }
}

// Durable inbox recovery runs in Cloudflare, not n8n. An empty inbox costs no
// n8n executions. Expired leases recover jobs interrupted after HTTP acknowledgement.
async function recoverWebhookInbox(env){
  const pending=await supabaseRpc("claim_pending_whatsapp_events",{p_limit:5},env)||[];
  await Promise.all(pending.map(async inbox=>{
    try{await processClaimedWebhook(inbox.payload,inbox.event_key,inbox.event_type,inbox,env);}
    catch(error){console.error("WhatsApp inbox retry failed",error.message);}
  }));
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

async function deliverQueuedWhatsAppMessage(messageId,env){
  if(!env.WHATSAPP_ACCESS_TOKEN||!env.WHATSAPP_PHONE_NUMBER_ID)return json({error:"WhatsApp production credentials are not configured"},503);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId||""))return json({error:"A queued message_id is required"},400);
  const leaseId=crypto.randomUUID();
  const claim=await supabaseRpc("claim_outbound_whatsapp_message",{p_message_id:messageId,p_lease_id:leaseId},env);
  if(!claim?.send){
    if(claim?.state==="sent")return json({ok:true,duplicate:true,message_id:claim.message_id,meta_message_id:claim.meta_message_id});
    return json({error:"Message is not available for automatic sending",state:claim?.state||"unknown",reason:claim?.reason||null},409);
  }
  const recipient=String(claim.to||"").trim();
  const isPhone=/^\d{8,15}$/.test(recipient);
  const isBsuid=/^[A-Z]{2}\.[A-Za-z0-9._:-]{6,253}$/i.test(recipient);
  if(!isPhone&&!isBsuid)return json({error:"Stored recipient is invalid"},500);
  const graphVersion=env.META_GRAPH_VERSION||"v26.0";
  let result;
  try{
    const body={messaging_product:"whatsapp",recipient_type:"individual",type:claim.type};
    if(isPhone)body.to=recipient;
    else body.recipient=recipient;
    if(claim.type==="text")body.text={preview_url:false,body:String(claim.text||"").slice(0,4096)};
    if(claim.type==="template")body.template=claim.template;
    if(claim.type==="image"){
      const bucket=String(claim.storage_bucket||"");
      const storagePath=String(claim.storage_path||"");
      if(bucket!=="payment-qrs"||!storagePath)throw new Error("El QR en cola no tiene un archivo válido");
      const objectResponse=await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`,{headers:supabaseHeaders(env)});
      if(!objectResponse.ok)throw new Error(`No fue posible leer el QR (${objectResponse.status})`);
      const mimeType=String(claim.mime_type||objectResponse.headers.get("content-type")||"image/png").split(";")[0];
      const form=new FormData();
      form.append("messaging_product","whatsapp");
      form.append("type",mimeType);
      form.append("file",new Blob([await objectResponse.arrayBuffer()],{type:mimeType}),`qr.${mediaExtension(mimeType,"image")}`);
      const uploadResponse=await fetch(`https://graph.facebook.com/${graphVersion}/${env.WHATSAPP_PHONE_NUMBER_ID}/media`,{method:"POST",headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`},body:form});
      const uploaded=await uploadResponse.json().catch(()=>({}));
      if(!uploadResponse.ok||!uploaded.id)throw new Error(uploaded?.error?.message||`Meta rechazó el QR (${uploadResponse.status})`);
      body.image={id:uploaded.id,caption:String(claim.caption||claim.text||"").slice(0,1024)};
    }
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

async function sendWhatsApp(request,env){
  if(!authorizedInternalRequest(request,env))return json({error:"Unauthorized"},401);
  let requestBody;
  try{requestBody=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  return deliverQueuedWhatsAppMessage(requestBody.message_id,env);
}

async function operatorConversationAction(request,env){
  const operator=await authenticatedOperator(request,env);
  if(!operator)return json({error:"Unauthorized"},401);
  let body;
  try{body=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  const conversationId=String(body.conversation_id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId))return json({error:"A conversation_id is required"},400);

  if(body.action==="takeover"){
    const result=await supabaseRpc("set_whatsapp_automation_paused",{
      p_conversation_id:conversationId,p_paused:Boolean(body.paused),p_operator_id:operator.id
    },env);
    return json(result||{ok:true});
  }

  const textBody=String(body.text||"").trim();
  const requestKey=String(body.request_id||"").trim();
  if(!textBody||requestKey.length<8)return json({error:"Text and request_id are required"},400);

  if(body.action==="message"){
    const queued=await supabaseRpc("queue_operator_whatsapp_message",{
      p_conversation_id:conversationId,p_body:textBody,p_request_key:requestKey,p_operator_id:operator.id
    },env);
    const messageId=queued?.message_id;
    return deliverQueuedWhatsAppMessage(messageId,env);
  }

  if(body.action==="instruction"){
    if(!env.N8N_AUTOMATION_URL||!env.N8N_WEBHOOK_SECRET)return json({error:"Automation webhook is not configured"},503);
    const result=await fetch(env.N8N_AUTOMATION_URL,{
      method:"POST",
      headers:{"content-type":"application/json","x-elrey-webhook-secret":env.N8N_WEBHOOK_SECRET},
      body:JSON.stringify({trigger:"operator_instruction",conversation_id:conversationId,instruction:textBody,request_id:requestKey,operator_id:operator.id})
    });
    if(!result.ok)return json({error:`n8n respondió ${result.status}`},502);
    return json({ok:true,conversation_id:conversationId});
  }

  return json({error:"Unsupported action"},400);
}

async function operatorMediaAction(request,env){
  const operator=await authenticatedOperator(request,env);
  if(!operator)return json({error:"Unauthorized"},401);
  let body;
  try{body=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  const messageId=String(body.message_id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId))return json({error:"A message_id is required"},400);
  const messageResponse=await fetch(`${env.SUPABASE_URL}/rest/v1/whatsapp_messages?id=eq.${encodeURIComponent(messageId)}&direction=eq.inbound&select=id,meta_message_id,message_type,media_id,raw_payload&limit=1`,{headers:supabaseHeaders(env)});
  if(!messageResponse.ok)return json({error:"No fue posible consultar el mensaje"},502);
  const message=(await messageResponse.json())?.[0];
  if(!message?.meta_message_id||!message?.media_id)return json({error:"El mensaje no contiene un archivo recuperable"},404);
  const media=message.raw_payload?.message?.[message.message_type]||{};
  try{
    const storagePath=await persistOneInboundMedia({metaMessageId:message.meta_message_id,mediaId:message.media_id,messageType:message.message_type,originalName:media.filename||null},env);
    return json({ok:true,storage_path:storagePath});
  }catch(error){return json({error:error.message||"No fue posible recuperar el archivo"},502);}
}

function cleanPqrsText(value,maxLength){
  return String(value||"").split(String.fromCharCode(0)).join("").trim().slice(0,maxLength);
}

function validPqrsEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value)&&value.length<=254;
}

function escapeEmailHtml(value){
  return String(value||"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}

async function pqrsRest(path,options,env){
  const result=await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,{...options,headers:supabaseHeaders(env,options?.headers||{})});
  const payload=await result.json().catch(()=>null);
  if(!result.ok)throw new Error(payload?.message||payload?.error||`Supabase respondió ${result.status}`);
  return payload;
}

async function logPqrsEmail(caseId,recipient,template,status,providerMessageId,error,env){
  try{
    await pqrsRest("pqrs_email_log",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({case_id:caseId,recipient,template,status,provider_message_id:providerMessageId||null,error:error||null})},env);
  }catch(logError){console.error("PQRS email log failed",logError.message);}
}

async function sendPqrsEmail({caseId,to,subject,html,template,replyTo},env){
  if(!env.RESEND_API_KEY||!env.PQRS_FROM_EMAIL){
    await logPqrsEmail(caseId,to,template,"skipped",null,"Resend no está configurado",env);
    return {sent:false,skipped:true};
  }
  try{
    const result=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,"content-type":"application/json"},
      body:JSON.stringify({from:env.PQRS_FROM_EMAIL,to:[to],subject,html,...(replyTo?{reply_to:replyTo}:{})})
    });
    const payload=await result.json().catch(()=>({}));
    if(!result.ok)throw new Error(payload?.message||`Resend respondió ${result.status}`);
    await logPqrsEmail(caseId,to,template,"sent",payload.id,null,env);
    return {sent:true,id:payload.id};
  }catch(error){
    await logPqrsEmail(caseId,to,template,"failed",null,error.message,env);
    console.error("PQRS email failed",error.message);
    return {sent:false,error:error.message};
  }
}

function pqrsEmailLayout(title,body){
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f2e9;font-family:Arial,sans-serif;color:#171715"><div style="max-width:650px;margin:0 auto;padding:36px 18px"><div style="background:#111;padding:24px;border-radius:18px 18px 0 0;color:#fbbb2e;font-size:22px;font-weight:800">Almacenes El Rey</div><div style="background:#fff;padding:30px;border-radius:0 0 18px 18px;border:1px solid #e5dfd0"><h1 style="font-size:25px;margin:0 0 18px">${escapeEmailHtml(title)}</h1>${body}<p style="margin-top:28px;color:#777;font-size:13px">Este mensaje fue generado por el sistema de PQRS de Grupo Almacenes El Rey.</p></div></div></body></html>`;
}

async function uploadPqrsAttachments(caseRecord,files,env){
  const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
  const uploaded=[];
  for(const file of files.slice(0,3)){
    if(!(file instanceof File)||file.size<1)continue;
    const mimeType=String(file.type||"").toLowerCase();
    if(!allowed.has(mimeType)||file.size>5*1024*1024)throw new Error("Cada archivo debe ser JPG, PNG, WEBP o PDF y pesar máximo 5 MB.");
    const extension=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"})[mimeType];
    const storagePath=`${caseRecord.id}/${crypto.randomUUID()}.${extension}`;
    const upload=await fetch(`${env.SUPABASE_URL}/storage/v1/object/pqrs-files/${storagePath.split("/").map(encodeURIComponent).join("/")}`,{method:"POST",headers:supabaseHeaders(env,{"content-type":mimeType,"x-upsert":"false"}),body:await file.arrayBuffer()});
    if(!upload.ok)throw new Error(`No fue posible guardar ${file.name}.`);
    await pqrsRest("pqrs_attachments",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({case_id:caseRecord.id,storage_path:storagePath,original_name:cleanPqrsText(file.name,255)||`archivo.${extension}`,mime_type:mimeType,size_bytes:file.size,uploaded_by_customer:true})},env);
    uploaded.push(storagePath);
  }
  return uploaded;
}

async function createPqrs(request,env){
  if(!env.SUPABASE_URL||!supabaseKey(env))return pqrsJson(request,{error:"El servicio de PQRS no está disponible temporalmente."},503);
  let form;
  try{form=await request.formData();}catch{return pqrsJson(request,{error:"No fue posible leer el formulario."},400);}
  if(cleanPqrsText(form.get("company"),100))return pqrsJson(request,{error:"Solicitud inválida."},400);
  const type=cleanPqrsText(form.get("type"),30);
  const customerName=cleanPqrsText(form.get("customer_name"),150);
  const customerEmail=cleanPqrsText(form.get("customer_email"),254).toLowerCase();
  const subject=cleanPqrsText(form.get("subject"),180);
  const description=cleanPqrsText(form.get("description"),5000);
  const allowedTypes=new Set(["peticion","queja","reclamo","sugerencia","felicitacion"]);
  if(!allowedTypes.has(type)||customerName.length<2||!validPqrsEmail(customerEmail)||subject.length<4||description.length<10||form.get("privacy_accepted")!=="true"){
    return pqrsJson(request,{error:"Revisa los campos obligatorios y acepta el tratamiento de datos."},422);
  }
  const branchId=cleanPqrsText(form.get("branch_id"),10)||null;
  if(branchId&&!/^b(?:10|[1-9])$/.test(branchId))return pqrsJson(request,{error:"La sede seleccionada no es válida."},422);
  const tokenBytes=crypto.getRandomValues(new Uint8Array(24));
  const accessToken=bytesToHex(tokenBytes);
  const tokenHash=await sha256(new TextEncoder().encode(accessToken));
  let created;
  try{
    const rows=await pqrsRest("pqrs_cases",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({
      case_number:"",type,status:"received",customer_name:customerName,document_number:cleanPqrsText(form.get("document_number"),40)||null,
      customer_email:customerEmail,customer_phone:cleanPqrsText(form.get("customer_phone"),40)||null,branch_id:branchId,
      subject,description,consultation_token_hash:tokenHash,privacy_accepted_at:new Date().toISOString()
    })},env);
    created=rows?.[0];
    if(!created)throw new Error("No se generó el radicado.");
    const files=form.getAll("attachments").filter(item=>item instanceof File&&item.size>0);
    await uploadPqrsAttachments(created,files,env);
  }catch(error){
    console.error("PQRS creation failed",error.message);
    return pqrsJson(request,{error:error.message||"No fue posible radicar la solicitud."},500);
  }
  const publicUrl=`https://almaceneselrey.co/?pqrs=consultar&radicado=${encodeURIComponent(created.case_number)}`;
  const customerBody=`<p>Hola <strong>${escapeEmailHtml(created.customer_name)}</strong>, recibimos tu ${escapeEmailHtml(created.type)}.</p><p style="font-size:18px">Tu número de radicado es <strong>${escapeEmailHtml(created.case_number)}</strong>.</p><p>Conserva este número y tu correo para consultar el estado.</p><p><a href="${publicUrl}" style="display:inline-block;background:#fbbb2e;color:#111;padding:13px 18px;border-radius:8px;text-decoration:none;font-weight:800">Consultar estado</a></p>`;
  const internalBody=`<p>Se recibió una nueva PQRS.</p><p><strong>Radicado:</strong> ${escapeEmailHtml(created.case_number)}<br><strong>Tipo:</strong> ${escapeEmailHtml(created.type)}<br><strong>Cliente:</strong> ${escapeEmailHtml(created.customer_name)}<br><strong>Asunto:</strong> ${escapeEmailHtml(created.subject)}</p><p>Ingresa a la intranet para revisarla y responderla.</p>`;
  const customerDelivery=await sendPqrsEmail({caseId:created.id,to:created.customer_email,subject:`Recibimos tu PQRS ${created.case_number}`,html:pqrsEmailLayout("PQRS recibida",customerBody),template:"case_received",replyTo:env.PQRS_REPLY_TO_EMAIL||undefined},env);
  if(env.PQRS_NOTIFICATION_EMAIL)await sendPqrsEmail({caseId:created.id,to:env.PQRS_NOTIFICATION_EMAIL,subject:`Nueva PQRS ${created.case_number}`,html:pqrsEmailLayout("Nueva PQRS",internalBody),template:"internal_notification"},env);
  return pqrsJson(request,{ok:true,case_number:created.case_number,email_sent:Boolean(customerDelivery.sent)},201);
}

async function consultPqrs(request,env){
  let body;
  try{body=await request.json();}catch{return pqrsJson(request,{error:"Solicitud inválida."},400);}
  const caseNumber=cleanPqrsText(body.case_number,30).toUpperCase();
  const email=cleanPqrsText(body.email,254).toLowerCase();
  if(!/^PQR-\d{4}-\d{6}$/.test(caseNumber)||!validPqrsEmail(email))return pqrsJson(request,{error:"Ingresa el radicado y el correo usados al crear la PQRS."},422);
  try{
    const cases=await pqrsRest(`pqrs_cases?case_number=eq.${encodeURIComponent(caseNumber)}&customer_email=eq.${encodeURIComponent(email)}&select=id,case_number,type,status,subject,latest_response,responded_at,created_at,updated_at`,{method:"GET"},env);
    const found=cases?.[0];
    if(!found)return pqrsJson(request,{error:"No encontramos una PQRS con esos datos."},404);
    const events=await pqrsRest(`pqrs_events?case_id=eq.${encodeURIComponent(found.id)}&public_visible=eq.true&select=event_type,to_status,message,created_at&order=created_at.asc`,{method:"GET"},env);
    return pqrsJson(request,{case:{...found,id:undefined},events});
  }catch{return pqrsJson(request,{error:"No fue posible consultar el estado."},500);}
}

async function updatePqrs(request,env,caseId){
  const operator=await authenticatedOperator(request,env);
  if(!operator)return pqrsJson(request,{error:"Unauthorized"},401);
  let body;
  try{body=await request.json();}catch{return pqrsJson(request,{error:"Invalid JSON"},400);}
  const statuses=new Set(["received","in_review","awaiting_information","completed","closed"]);
  const nextStatus=cleanPqrsText(body.status,30);
  const responseMessage=cleanPqrsText(body.response_message,5000);
  const internalNotes=cleanPqrsText(body.internal_notes,5000);
  if(!statuses.has(nextStatus))return pqrsJson(request,{error:"Estado inválido."},422);
  try{
    const current=(await pqrsRest(`pqrs_cases?id=eq.${encodeURIComponent(caseId)}&select=*`,{method:"GET"},env))?.[0];
    if(!current)return pqrsJson(request,{error:"PQRS no encontrada."},404);
    const now=new Date().toISOString();
    const update={status:nextStatus,internal_notes:internalNotes||null,assigned_to:operator.id,updated_at:now};
    if(responseMessage){update.latest_response=responseMessage;update.responded_at=now;}
    if(nextStatus==="completed"&&!current.completed_at)update.completed_at=now;
    if(nextStatus==="closed"&&!current.closed_at)update.closed_at=now;
    const saved=(await pqrsRest(`pqrs_cases?id=eq.${encodeURIComponent(caseId)}`,{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify(update)},env))?.[0];
    const profile=(await pqrsRest(`profiles?id=eq.${encodeURIComponent(operator.id)}&select=full_name`,{method:"GET"},env))?.[0];
    await pqrsRest("pqrs_events",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({case_id:caseId,event_type:responseMessage?"response":"status_changed",from_status:current.status,to_status:nextStatus,message:responseMessage||`Estado actualizado a ${nextStatus}.`,public_visible:Boolean(responseMessage)||current.status!==nextStatus,actor_id:operator.id,actor_name:profile?.full_name||"Equipo El Rey"})},env);
    let emailSent=false;
    if(responseMessage){
      const bodyHtml=`<p>Hola <strong>${escapeEmailHtml(current.customer_name)}</strong>,</p><p>Tenemos una actualización para tu PQRS <strong>${escapeEmailHtml(current.case_number)}</strong>:</p><div style="padding:18px;background:#f8f5ec;border-left:4px solid #fbbb2e;white-space:pre-line">${escapeEmailHtml(responseMessage)}</div><p><strong>Estado:</strong> ${escapeEmailHtml(nextStatus)}</p>`;
      const delivery=await sendPqrsEmail({caseId,to:current.customer_email,subject:`Respuesta a tu PQRS ${current.case_number}`,html:pqrsEmailLayout("Actualización de tu PQRS",bodyHtml),template:"case_response",replyTo:env.PQRS_REPLY_TO_EMAIL||undefined},env);
      emailSent=Boolean(delivery.sent);
    }
    return pqrsJson(request,{ok:true,case:saved,email_sent:emailSent});
  }catch(error){console.error("PQRS update failed",error.message);return pqrsJson(request,{error:error.message||"No fue posible actualizar la PQRS."},500);}
}

function health(env){
  return json({ok:true,webhookVerification:Boolean(env.WHATSAPP_VERIFY_TOKEN),signatureVerification:Boolean(env.WHATSAPP_APP_SECRET),inbox:Boolean(env.SUPABASE_URL&&supabaseKey(env)),automation:Boolean(env.N8N_WEBHOOK_URL&&env.N8N_WEBHOOK_SECRET),automationWake:Boolean(env.N8N_AUTOMATION_URL&&env.N8N_WEBHOOK_SECRET),outboundMessaging:Boolean(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.N8N_GATEWAY_SECRET)});
}

export default {
  async scheduled(_controller,env,context){
    context.waitUntil(recoverWebhookInbox(env));
  },
  async fetch(request,env,context){
    const url = new URL(request.url);
    if((url.pathname===PQRS_PATH||url.pathname===PQRS_STATUS_PATH||url.pathname.startsWith(`${PQRS_ADMIN_PATH}/`))&&request.method==="OPTIONS")return new Response(null,{status:204,headers:pqrsCorsHeaders(request)});
    if(url.pathname===PQRS_PATH&&request.method==="POST")return createPqrs(request,env);
    if(url.pathname===PQRS_STATUS_PATH&&request.method==="POST")return consultPqrs(request,env);
    if(url.pathname.startsWith(`${PQRS_ADMIN_PATH}/`)&&request.method==="PATCH"){
      const caseId=url.pathname.slice(`${PQRS_ADMIN_PATH}/`.length);
      if(!/^[0-9a-f-]{36}$/i.test(caseId))return pqrsJson(request,{error:"Identificador inválido."},400);
      return updatePqrs(request,env,caseId);
    }
    if(url.pathname===WEBHOOK_PATH&&request.method==="GET")return verifySubscription(request,env);
    if(url.pathname===WEBHOOK_PATH&&request.method==="POST")return receiveWebhook(request,env,context);
    if(url.pathname===SEND_PATH&&request.method==="POST")return sendWhatsApp(request,env);
    if(url.pathname===AUTOMATION_WAKE_PATH&&request.method==="POST")return wakeAutomation(request,env);
    if(url.pathname===OPERATOR_ACTION_PATH&&request.method==="POST")return operatorConversationAction(request,env);
    if(url.pathname===OPERATOR_MEDIA_PATH&&request.method==="POST")return operatorMediaAction(request,env);
    if(url.pathname===HEALTH_PATH&&request.method==="GET")return health(env);
    if(url.pathname===PRIVACY_PATH&&request.method==="GET")return privacyPolicy();
    if(url.pathname===DATA_DELETION_PATH&&request.method==="GET")return dataDeletionInstructions();
    if(url.pathname.startsWith("/api/"))return response("Not found",404);
    return env.ASSETS.fetch(request);
  }
};
