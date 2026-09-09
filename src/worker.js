const WEBHOOK_PATH = "/api/whatsapp/webhook";
const SEND_PATH = "/api/whatsapp/send";
const HEALTH_PATH = "/api/whatsapp/health";
const AUTOMATION_WAKE_PATH = "/api/automation/wake";
const OPERATOR_ACTION_PATH = "/api/operator/conversation";
const OPERATOR_MEDIA_PATH = "/api/operator/media";
const PRIVACY_PATH = "/privacidad";
const DATA_DELETION_PATH = "/eliminacion-de-datos";

function response(body, status = 200, headers = {}){
  return new Response(body, { status, headers: { "content-type":"text/plain; charset=utf-8", "cache-control":"no-store", ...headers } });
}

function json(body, status = 200){
  return new Response(JSON.stringify(body), { status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } });
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
  if(!env.N8N_WEBHOOK_URL)return;
  const result=await fetch(env.N8N_WEBHOOK_URL,{
    method:"POST",
    headers:{"content-type":"application/json","x-elrey-event-key":eventKey,"x-elrey-event-type":eventType,"x-elrey-lease-id":leaseId,"x-elrey-webhook-secret":env.N8N_WEBHOOK_SECRET||""},
    body:JSON.stringify(payload)
  });
  if(!result.ok)throw new Error(`n8n respondió ${result.status}`);
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
  try{
    const statuses=collectMessageStatuses(payload,eventKey);
    if(statuses.length)await persistMessageStatuses(payload,eventKey,env);
    const hasMessages=(payload.entry||[]).some(entry=>(entry.changes||[]).some(change=>Array.isArray(change.value?.messages)&&change.value.messages.length>0));
    if(hasMessages&&env.N8N_WEBHOOK_URL){
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

function health(env){
  return json({ok:true,webhookVerification:Boolean(env.WHATSAPP_VERIFY_TOKEN),signatureVerification:Boolean(env.WHATSAPP_APP_SECRET),inbox:Boolean(env.SUPABASE_URL&&supabaseKey(env)),automation:Boolean(env.N8N_WEBHOOK_URL&&env.N8N_WEBHOOK_SECRET),automationWake:Boolean(env.N8N_AUTOMATION_URL&&env.N8N_WEBHOOK_SECRET),outboundMessaging:Boolean(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.N8N_GATEWAY_SECRET)});
}

export default {
  async fetch(request,env,context){
    const url = new URL(request.url);
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
