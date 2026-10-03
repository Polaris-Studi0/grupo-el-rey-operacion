import {readBotRows} from './bot-preview.js';
const WABA='1108612821745260';
const UUID=/^[0-9a-f-]{36}$/i;
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
function headers(env){const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;return {apikey:key,'content-type':'application/json',...(!key?.startsWith('sb_secret_')?{authorization:`Bearer ${key}`}:{})};}
async function patch(env,table,filters,values){const u=new URL(`/rest/v1/${table}`,env.SUPABASE_URL);u.search=new URLSearchParams(filters);const r=await fetch(u,{method:'PATCH',headers:headers(env),body:JSON.stringify(values)});if(!r.ok)throw Error('No fue posible guardar el resultado de la campaña.');}
async function graph(env,path,body){const r=await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION||'v26.0'}/${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(d.error?.message||'Meta no pudo procesar la solicitud.'),{metaRejected:true});return d;}
export function normalizeCampaignPhones(values){
 if(!Array.isArray(values)||values.length>1000)throw Error('Selecciona hasta 1000 teléfonos.');
 return [...new Set(values.map(p=>{let v=String(p).replace(/[\s()+.-]/g,'');if(/^3\d{9}$/.test(v))v='57'+v;if(!/^[1-9]\d{7,14}$/.test(v))throw Error(`Revisa el formato del número: ${String(p).slice(0,25)}`);return '+'+v;}))];
}
export function templateDetails(t){
 const components=t.components||[],header=components.find(c=>c.type==='HEADER'),body=components.find(c=>c.type==='BODY');
 if(t.status!=='APPROVED'||t.category!=='MARKETING'||header?.format!=='IMAGE'||!body?.text)return null;
 if(components.some(c=>!['HEADER','BODY','FOOTER','BUTTONS'].includes(c.type)))return null;
 const tokens=[...new Set(body.text.match(/\{\{[^}]+\}\}/g)||[])];
 if(tokens.some((v,i)=>v!==`{{${i+1}}}`)||tokens.length>10)return null;
 const buttons=components.find(c=>c.type==='BUTTONS')?.buttons||[];
 if(buttons.some(b=>!['URL','PHONE_NUMBER','QUICK_REPLY'].includes(b.type)||/\{\{/.test(b.url||'')))return null;
 return {name:t.name,language:t.language,body:body.text,footer:components.find(c=>c.type==='FOOTER')?.text||'',variables:tokens.length,buttons};
}
export async function campaignTemplates(env,name=''){
 const query=new URLSearchParams({fields:'name,language,status,category,components',limit:'100',...(name?{name}:{})});
 const d=await graph(env,`${env.WHATSAPP_BUSINESS_ACCOUNT_ID||WABA}/message_templates?${query}`);
 return (d.data||[]).map(templateDetails).filter(Boolean);
}
export async function ownerNotificationTemplates(env){
 const query=new URLSearchParams({fields:'name,language,status,category,components',limit:'100'});
 const result=await graph(env,`${env.WHATSAPP_BUSINESS_ACCOUNT_ID||WABA}/message_templates?${query}`);
 return (result.data||[]).filter(t=>t.category==='UTILITY').map(({name,language,status,components})=>({name,language,status,components}));
}
export function buildCampaignTemplate(t,values){
 if(!Array.isArray(values)||values.length!==t.variables||values.some(v=>typeof v!=='string'||!v.trim()||v.length>500))throw Error('Completa los campos de la plantilla.');
 const components=values.length?[{type:'body',parameters:values.map(text=>({type:'text',text:text.trim()}))}]:[];
 t.buttons.forEach((b,i)=>{if(b.type==='QUICK_REPLY')components.push({type:'button',sub_type:'quick_reply',index:String(i),parameters:[{type:'payload',payload:/baja|dejar|no recibir|detener/i.test(b.text)?'STOP_PUBLICIDAD':b.text.slice(0,100)}]});});
 const preview=t.body.replace(/\{\{(\d+)\}\}/g,(_,n)=>values[Number(n)-1]);
 if(!/\bBAJA\b/i.test(preview+' '+t.footer)&&!components.some(c=>c.type==='button'&&c.parameters[0].payload==='STOP_PUBLICIDAD'))throw Error('Incluye «Responde BAJA para dejar de recibir publicidad» en un campo de la plantilla o usa una plantilla con botón de baja.');
 return {name:t.name,language:{code:t.language},components,preview,footer:t.footer};
}
async function verifySavedTemplate(env,saved){
 const t=(await campaignTemplates(env,saved.name)).find(t=>t.name===saved.name&&t.language===saved.language.code);
 if(!t)throw Error('La plantilla ya no está aprobada o no admite este flyer.');
 const values=saved.components.find(c=>c.type==='body')?.parameters.map(p=>p.text)||[];
 const current=buildCampaignTemplate(t,values);
 if(canonical(current)!==canonical(saved))throw Error('La plantilla cambió. Prepara de nuevo la campaña para revisar su contenido.');
 return current;
}
export async function handleCampaigns(request,env,{authenticate,rpc}){
 if(env.WHATSAPP_CAMPAIGNS_ENABLED!=='true')return json({error:'La publicidad está aplazada.'},404);
 let actor;try{actor=await authenticate(request,env);}catch{return json({error:'No fue posible verificar tu sesión.'},503);}
 if(!actor)return json({error:'Inicia sesión.'},401);if(actor.role!=='admin')return json({error:'Solo administradores.'},403);
 try{
  if(request.method==='GET')return json({templates:await campaignTemplates(env)});
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  const raw=await request.text();if(raw.length>50000)return json({error:'Solicitud demasiado grande.'},413);const b=JSON.parse(raw);
  if(b.action==='prepare'){
   const phones=normalizeCampaignPhones(b.phones);if(!phones.length||!UUID.test(b.asset_id||''))throw Error('Selecciona flyer y destinatarios.');
   const t=(await campaignTemplates(env,b.template_name)).find(t=>t.name===b.template_name&&t.language===b.language);if(!t)throw Error('Selecciona una plantilla de publicidad aprobada con imagen.');
   const template=buildCampaignTemplate(t,b.values||[]);
   return json(await rpc('prepare_whatsapp_campaign',{p_actor:actor.id,p_name:b.name,p_asset:b.asset_id,p_template:template,p_phones:phones,p_permission_evidence:b.permission_confirmed===true?String(b.permission_evidence||''):''},env));
  }
  if(!UUID.test(b.id||''))throw Error('Campaña inválida.');
  if(b.action==='start'){
   const c=(await readBotRows(env,'whatsapp_campaigns',{id:`eq.${b.id}`,select:'*',limit:'1'}))[0];if(!c)throw Error('Campaña no encontrada.');
   await verifySavedTemplate(env,c.template);
   return json(await rpc('start_whatsapp_campaign',{p_id:b.id,p_actor:actor.id},env));
  }
  if(b.action==='cancel'){await rpc('cancel_whatsapp_campaign',{p_id:b.id,p_actor:actor.id},env);return json({ok:true});}
  return json({error:'Acción inválida.'},400);
 }catch(e){return json({error:e.message||'No fue posible preparar la campaña.'},400);}
}
export async function recoverCampaigns(env,{rpc}){
 if(env.WHATSAPP_CAMPAIGNS_ENABLED!=='true'||!env.WHATSAPP_ACCESS_TOKEN||!env.WHATSAPP_PHONE_NUMBER_ID)return false;
 const batch=await rpc('claim_whatsapp_campaign',{},env);if(!batch)return false;
 const {campaign,recipients,asset}=batch;if(!recipients.length)return true;
 let template,media;
 try{
  if(!asset||asset.kind!=='flyer')throw Error('El flyer ya no está disponible.');
  template=await verifySavedTemplate(env,campaign.template);
  const image=await fetch(`${env.SUPABASE_URL}/storage/v1/object/bot-images/${asset.storage_path}`,{headers:headers(env)});if(!image.ok)throw Error('No fue posible leer el flyer.');
  const form=new FormData();form.append('messaging_product','whatsapp');form.append('type',asset.mime_type);form.append('file',new Blob([await image.arrayBuffer()],{type:asset.mime_type}),asset.original_name);
  media=await graph(env,`${env.WHATSAPP_PHONE_NUMBER_ID}/media`,form);if(!media.id)throw Error('Meta no aceptó la imagen.');
 }catch(e){for(const r of recipients)await patch(env,'whatsapp_campaign_recipients',{id:`eq.${r.id}`,status:'eq.sending'},{status:'failed',error:e.message,updated_at:new Date().toISOString()});return true;}
 for(const r of recipients){
  // Recheck opt-out and cancellation immediately before each external send.
  const [permission,current]=await Promise.all([readBotRows(env,'whatsapp_marketing_permissions',{phone_e164:`eq.${r.phone_e164}`,select:'status',limit:'1'}),readBotRows(env,'whatsapp_campaigns',{id:`eq.${campaign.id}`,select:'status',limit:'1'})]);
  if(permission[0]?.status!=='granted'||current[0]?.status!=='queued'){await patch(env,'whatsapp_campaign_recipients',{id:`eq.${r.id}`,status:'eq.sending'},{status:'skipped',error:'Campaña detenida o permiso retirado'});continue;}
  let result;
  try{const payload={name:template.name,language:template.language,components:template.components};result=await graph(env,`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{messaging_product:'whatsapp',to:r.phone_e164.slice(1),type:'template',template:{...payload,components:[{type:'header',parameters:[{type:'image',image:{id:media.id}}]},...payload.components]}});if(!result.messages?.[0]?.id)throw Error('Meta no confirmó el envío');}
  catch(e){await patch(env,'whatsapp_campaign_recipients',{id:`eq.${r.id}`,status:'eq.sending'},{status:e.metaRejected?'failed':'uncertain',error:e.message,updated_at:new Date().toISOString()});continue;}
  // An error saving acceptance must leave the claim uncertain, never requeue it.
  await patch(env,'whatsapp_campaign_recipients',{id:`eq.${r.id}`,status:'eq.sending'},{status:'sent',meta_message_id:result.messages[0].id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()});
 }
 return true;
}
export function isMarketingOptOut(message){const s=String(message.button?.payload||message.interactive?.button_reply?.id||message.text?.body||message.button?.text||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');return /^(baja|stop|stop_publicidad|no mas publicidad|no quiero (?:mas )?(?:publicidad|promociones)|dejar de recibir(?: publicidad| promociones)?)[.!]?$/.test(s);}
export async function recordMarketingOptOuts(payload,env,rpc){
 for(const e of payload.entry||[])for(const c of e.changes||[])for(const m of c.value?.messages||[])if(isMarketingOptOut(m)&&/^[1-9]\d{7,14}$/.test(m.from)){await rpc('marketing_opt_out',{p_phone:'+'+m.from,p_evidence:`Solicitud por WhatsApp: ${m.id}`},env);await rpc('ingest_whatsapp_message',{p_phone_e164:'+'+m.from,p_whatsapp_id:m.from,p_display_name:null,p_meta_message_id:m.id,p_message_type:m.type,p_body:m.text?.body||m.button?.text||'BAJA',p_media_id:null,p_raw_payload:{message:m},p_source:'whatsapp',p_branch_id:null},env);}
}

export function withoutMarketingOptOuts(payload){return {...payload,entry:(payload.entry||[]).map(e=>({...e,changes:(e.changes||[]).map(c=>({...c,value:{...c.value,messages:(c.value?.messages||[]).filter(m=>!isMarketingOptOut(m))}})).filter(c=>c.value.messages.length)})).filter(e=>e.changes.length)};}
