// Colombia uses UTC-5 all year. Boundaries are exclusive at closing.
export const hoursEnabled=env=>env.BOT_SERVICE_HOURS_ENABLED==='true';
export function serviceWindow(at=new Date()){
  const local=new Date(new Date(at).getTime()-5*60*60*1000);
  const minute=local.getUTCHours()*60+local.getUTCMinutes();
  const opening=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),14));
  if(minute>=9*60)opening.setUTCDate(opening.getUTCDate()+1);
  return {attention_open:minute>=9*60&&minute<20*60,delivery_open:minute>=9*60&&minute<19*60,next_opening:opening.toISOString()};
}
export function closedNotice(at=new Date()){
  const local=new Date(new Date(at).getTime()-5*60*60*1000);
  return `Gracias por escribirnos. Nuestro horario de atención es de 9:00 a. m. a 8:00 p. m., hora de Colombia. Ahora estamos fuera de horario. ${local.getUTCHours()<9?'Hoy':'Mañana'} a partir de las 9:00 a. m. te escribiré para continuar. Los domicilios se gestionan hasta las 7:00 p. m.`;
}
export async function deferServiceTurn(conversation,inbound,kind,env,{rpc,deliver},notify=true){
  const saved=await rpc('defer_bot_service_turn',{p_conversation_id:conversation.id,p_inbound_message_id:inbound.message_id,p_control_version:conversation.automation_control_version,p_kind:kind,p_notify:notify},env);
  if(saved?.message_id){
    const sent=await deliver(saved.message_id,env,{conversation_id:conversation.id,inbound_message_id:inbound.message_id,control_version:conversation.automation_control_version,require_consent:true});
    if(!sent.ok){const detail=await sent.json().catch(()=>({}));if(!['pilot_context_changed','blocked'].includes(detail.state))throw Error('El aviso de horario quedó pendiente');}
  }
  return saved;
}
export async function recoverServiceWaits(env,{rpc,deliver}){
  if(!hoursEnabled(env)||!serviceWindow().attention_open)return false;
  const next=await rpc('prepare_next_bot_service_reminder',{},env);
  if(!next)return false;
  if(next.message_id){
    // The SQL claim validates consent, latest inbound, control and reply window.
    await deliver(next.message_id,env);
    await rpc('finish_bot_service_reminder',{p_wait_id:next.wait_id},env);
  }
  return true;
}
