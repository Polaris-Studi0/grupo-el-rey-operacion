import {readBotRows} from './bot-preview.js';
import {normalizeCampaignPhones} from './whatsapp-campaigns.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(b,status=200)=>Response.json(b,{status,headers:{'cache-control':'no-store'}});
function headers(env){const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;return {apikey:key,'content-type':'application/json',...(!key?.startsWith('sb_secret_')?{authorization:`Bearer ${key}`}:{})};}
async function save(env,id,values){const r=await fetch(`${env.SUPABASE_URL}/rest/v1/whatsapp_demo_sends?id=eq.${id}`,{method:'PATCH',headers:headers(env),body:JSON.stringify({...values,updated_at:new Date().toISOString()})});if(!r.ok)throw Error('No se pudo confirmar el estado; revisa el envío antes de repetirlo.');}
export async function handleWhatsappDemo(request,env,{authenticate,rpc}){
 if(env.WHATSAPP_DEMO_ENABLED!=='true')return json({error:'Demo no habilitado.'},404);
 let actor;try{actor=await authenticate(request,env);}catch{return json({error:'No se pudo verificar tu sesión.'},503);}
 if(!actor)return json({error:'Inicia sesión.'},401);if(actor.role!=='admin')return json({error:'Solo administradores.'},403);
 try{
  if(request.method==='GET')return json({sends:await readBotRows(env,'whatsapp_demo_sends',{select:'id,phone_e164,status,error,created_at',order:'created_at.desc',limit:'10'})});
  if(request.method!=='POST')return json({error:'Método no permitido.'},405);
  const raw=await request.text();if(raw.length>2000)return json({error:'Solicitud inválida.'},400);const b=JSON.parse(raw);
  if(!UUID.test(b.request_id||'')||!UUID.test(b.asset_id||'')||typeof b.phone!=='string')return json({error:'Selecciona un número y una imagen.'},400);
  const [phone]=normalizeCampaignPhones([b.phone]);
  const claim=await rpc('claim_whatsapp_demo',{p_actor:actor.id,p_id:b.request_id,p_phone:phone,p_asset:b.asset_id},env);
  if(claim.error)return json({error:claim.error},422);
  if(!claim.send)return json({ok:['sent','delivered','read'].includes(claim.result.status),duplicate:true,result:claim.result});
  const asset=claim.asset;let started=false;
  try{
   const image=await fetch(`${env.SUPABASE_URL}/storage/v1/object/bot-images/${asset.storage_path.split('/').map(encodeURIComponent).join('/')}`,{headers:headers(env),signal:AbortSignal.timeout(15000)});
   if(!image.ok)throw Error('No se pudo leer la imagen.');
   const form=new FormData();form.append('messaging_product','whatsapp');form.append('type',asset.mime_type);form.append('file',new Blob([await image.arrayBuffer()],{type:asset.mime_type}),asset.original_name);
   const graph=`https://graph.facebook.com/${env.META_GRAPH_VERSION||'v26.0'}/${env.WHATSAPP_PHONE_NUMBER_ID}`;
   const upload=await fetch(graph+'/media',{method:'POST',headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(15000)});
   const media=await upload.json();if(!upload.ok||!media.id)throw Error('WhatsApp no aceptó la imagen. Usa JPG o PNG de hasta 5 MB.');
   started=true;
   const sent=await fetch(graph+'/messages',{method:'POST',headers:{authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:phone.slice(1),type:'image',image:{id:media.id}}),signal:AbortSignal.timeout(15000)});
   const reply=await sent.json();
   if(!sent.ok){started=false;throw Error(reply.error?.code===131047?'Ese número debe escribir primero al WhatsApp de El Rey para habilitar el demo.':'WhatsApp rechazó el envío. Revisa que el número sea correcto y haya escrito recientemente.');}
   if(!reply.messages?.[0]?.id)throw Error('No se pudo confirmar el envío.');
   await save(env,b.request_id,{status:'sent',meta_message_id:reply.messages[0].id,error:null});
   return json({ok:true,result:{id:b.request_id,status:'sent',phone_e164:phone}});
  }catch(error){
   const status=started?'uncertain':'failed';await save(env,b.request_id,{status,error:started?'Envío por verificar. No vuelvas a enviarlo hasta comprobar WhatsApp.':error.message});
   return json({ok:false,result:{id:b.request_id,status,phone_e164:phone},error:started?'Envío por verificar. No vuelvas a enviarlo hasta comprobar WhatsApp.':error.message},502);
  }
 }catch{return json({error:'No se pudo completar la solicitud. Reintenta con la misma imagen y número para consultar su estado.'},503);}
}
