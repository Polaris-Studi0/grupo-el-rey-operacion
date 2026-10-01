import { useEffect, useRef, useState } from 'react';
import { BRANCHES, formatDateTime } from './lib/constants.js';
import { botImageUrl, listConversationPage, listOperatorInstructions, operateWhatsappConversation, previewBotResponse } from './lib/api.js';
import { mergeHistory, prepareOperatorRequest } from './lib/chat-history.js';

export default function ConversationDrawer({conversation,onClose,onOpenAttachment,onRecoverAttachment,onChanged}){
  async function openBotImage(path){const popup=window.open('about:blank','_blank');try{const url=await botImageUrl(path);if(popup)popup.location.href=url;}catch(e){popup?.close();setError(e.message);}}
  const storageKey=`whatsapp-action:${conversation.id}`;
  const [pending,setPending]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey))||null;}catch{return null;}});
  const [draft,setDraft]=useState(pending?.body.text||'');
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState(null);
  const [historyError,setHistoryError]=useState('');
  const [messages,setMessages]=useState([]);
  const [attachments,setAttachments]=useState([]);
  const [instructions,setInstructions]=useState([]);
  const [older,setOlder]=useState(null);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const newest=useRef(null);
  const active=useRef(true);
  const requestBusy=useRef(false);

  useEffect(()=>{
    let alive=true,running=false,initialized=false;
    active.current=true;
    const merge=(page,advanceCursor=true)=>{
      setMessages(rows=>mergeHistory(rows,page.messages));
      setAttachments(rows=>mergeHistory(rows,page.attachments));
      const last=mergeHistory([],page.messages).at(-1);
      if(last&&advanceCursor)newest.current={id:last.id,created_at:last.created_at};
    };
    async function sync(){
      if(running)return;
      running=true;
      try{
        if(!initialized||!newest.current){
          const page=await listConversationPage(conversation.id);
          if(!alive)return;
          merge(page);setOlder(page.cursor);setHasMore(page.hasMore);initialized=true;
        }else{
          // Catch up sequentially so a burst larger than one page cannot leave a gap.
          if(newest.current){
            let page;
            do{
              page=await listConversationPage(conversation.id,{after:newest.current});
              if(!alive)return;
              if(page.messages.length)merge(page);
            }while(page.hasMore);
          }
          const latest=await listConversationPage(conversation.id);
          if(!alive)return;
          // Refresh delivery states without jumping over messages arriving
          // between catch-up and this fetch. The next poll fills that gap.
          merge(latest,false);
        }
        const notes=await listOperatorInstructions(conversation.id);
        if(alive){setInstructions(notes);setHistoryError('');}
      }catch(e){if(alive)setHistoryError(e.message);}
      finally{running=false;if(alive)setLoading(false);}
    }
    sync();const timer=setInterval(sync,5000);
    return()=>{alive=false;active.current=false;clearInterval(timer);};
  },[conversation.id]);

  async function loadOlder(){
    if(loading||!hasMore)return;
    setLoading(true);
    try{
      const page=await listConversationPage(conversation.id,{before:older});
      if(!active.current)return;
      setMessages(rows=>mergeHistory(rows,page.messages));setAttachments(rows=>mergeHistory(rows,page.attachments));
      setOlder(page.cursor);setHasMore(page.hasMore);setHistoryError('');
    }catch(e){if(active.current)setHistoryError(e.message);}
    finally{if(active.current)setLoading(false);}
  }
  function remember(value){
    setPending(value);
    if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);
  }
  async function act(action,values={}){
    if(requestBusy.current)return;
    requestBusy.current=true;setBusy(action);setError('');setNotice('');
    try{
      const request=pending||prepareOperatorRequest(null,conversation,action,values);
      remember(request);
      const result=await operateWhatsappConversation(request.body);
      remember(null);if(action!=='takeover')setDraft('');
      setNotice(result.inflight_messages?'Hay un envío anterior en curso o por verificar; podría llegar al cliente.':action==='instruction'?'Instrucción guardada. El bot nuevo la tendrá pendiente; no se envió al cliente.':action==='takeover'?(result.automation_paused?'Control manual activado. Los mensajes automáticos en cola quedaron bloqueados.':'Control manual liberado. La atención automática sigue en mantenimiento.'):'Mensaje enviado al cliente.');
      await onChanged({silent:true});
    }catch(e){
      // Only definitive validation failures release the request key. Network and
      // uncertain Meta outcomes keep it across retries and browser reloads.
      if([400,403,404,422].includes(e.status)||e.code==='40001')remember(null);
      setError(e.message);
    }finally{requestBusy.current=false;setBusy('');}
  }
  async function tryBot(){
    if(requestBusy.current)return;
    requestBusy.current=true;setBusy('preview');setError('');setPreview(null);
    try{
      const result=await previewBotResponse(conversation);
      if(active.current)setPreview(result);
    }catch(e){if(active.current)setError(e.message);}
    finally{requestBusy.current=false;if(active.current)setBusy('');}
  }
  const latestPublicMessage=messages.filter(m=>m.direction==='inbound'||['sent','delivered','read'].includes(m.delivery_status)).at(-1);
  const previewStale=preview&&(preview.control_version!==conversation.automation_control_version||preview.latest_message_id!==latestPublicMessage?.id);
  const branch=BRANCHES.find(b=>b.id===conversation.branch_id)?.name||'Sin sede';
  return <div className="overlay"><button className="backdrop" aria-label="Cerrar" onClick={onClose}/><aside className="drawer chat-drawer"><button className="close" onClick={onClose}>×</button>
    <p className="eyebrow">CONVERSACIÓN DE WHATSAPP</p><h2>{conversation.contact?.preferred_name||conversation.contact?.display_name||conversation.contact?.phone_e164}</h2>
    <div className="chat-contact-meta"><span>{conversation.contact?.phone_e164}</span><span>{branch}</span></div>
    <section className={`consent-card ${conversation.consent_status}`}><div><small>TRATAMIENTO DE DATOS</small><b>{conversation.consent_status==='granted'?'Autorización expresa registrada':conversation.consent_status==='denied'?'Autorización rechazada':'Autorización pendiente'}</b></div><span>{conversation.consented_at?formatDateTime(conversation.consented_at):'No se puede vender hasta obtener respuesta'}</span></section>
    {historyError&&<p className="operator-error">No se pudo actualizar el historial: {historyError}</p>}
    <section className="chat-transcript">
      {hasMore&&<button disabled={loading} onClick={loadOlder}>{loading?'Cargando…':'Cargar mensajes anteriores'}</button>}
      {!messages.length&&<div className="empty compact"><h3>{loading?'Cargando conversación…':'Sin mensajes procesados'}</h3></div>}
      {messages.map(message=>{const files=attachments.filter(file=>file.message_id===message.id);return <article key={message.id} className={`chat-message ${message.direction}`}><div><small>{message.sender_type==='customer'?'Cliente':message.sender_type==='human'?'Equipo':'Asistente'}</small><p>{message.body||`[${message.message_type}]`}</p>{message.message_type==='image'&&message.raw_payload?.storage_bucket==='bot-images'&&<button className="chat-attachment" onClick={()=>openBotImage(message.raw_payload.storage_path)}>Ver imagen enviada</button>}{files.map(file=><button className="chat-attachment" key={file.id} onClick={()=>onOpenAttachment(file.storage_path)}>Ver {file.original_name||'archivo adjunto'}</button>)}{message.direction==='inbound'&&message.media_id&&!files.length&&<button className="chat-attachment" onClick={()=>onRecoverAttachment(message.id)}>Recuperar archivo</button>}<span>{formatDateTime(message.created_at)} · {message.failure_reason==='manual_control_cancelled'?'Cancelado al tomar control':message.delivery_status}</span></div></article>;})}
    </section>
    {conversation.summary&&<section className="chat-summary"><small>RESUMEN OPERATIVO</small><p>{conversation.summary}</p></section>}
    <section className="operator-console"><header><div><small>CONTROL DEL EQUIPO</small><b>{conversation.automation_paused?'Atención manual activa':'Atención automática en mantenimiento'}</b></div><button disabled={Boolean(busy||pending)} onClick={()=>act('takeover',{paused:!conversation.automation_paused})}>{conversation.automation_paused?'Liberar control manual':'Tomar control'}</button></header>
      <textarea maxLength={4096} disabled={Boolean(busy||pending)} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Escribe al cliente o guarda una indicación interna"/>
      {error&&<p className="operator-error">{error}</p>}{notice&&<p role="status" className="operator-notice">{notice}</p>}
      {pending&&!busy?<button onClick={()=>act(pending.body.action)}>Comprobar / reintentar la acción pendiente</button>:<footer><button disabled={Boolean(busy)||!draft.trim()} onClick={()=>act('instruction',{text:draft})}>Guardar indicación</button><button className="primary" disabled={Boolean(busy)||!draft.trim()} onClick={()=>act('message',{text:draft})}>{busy==='message'?'Enviando…':'Enviar como equipo'}</button></footer>}
      <p className="operator-help">Enviar como equipo toma el control. Las indicaciones son internas y conservan el modo de atención. La IA nueva aún está en preparación.</p>
      <section className="bot-preview" aria-label="Prueba del bot">
        <div><b>Probar el bot con esta conversación</b><p>Lee el último mensaje y prepara una respuesta. La prueba no envía mensajes ni crea pedidos o avisos.</p></div>
        <button disabled={Boolean(busy||pending)||loading||conversation.automation_paused||conversation.consent_status!=='granted'||conversation.status==='closed'||!conversation.branch_id} onClick={tryBot}>{busy==='preview'?'Preparando respuesta…':'Generar respuesta de prueba'}</button>
        {conversation.automation_paused&&<p>El bot está detenido mientras tienes el control manual.</p>}
        {preview&&<div role="status"><p className="bot-preview-reply">{preview.reply_text}</p>{preview.requires_human&&<p>Esta respuesta necesita intervención del equipo. La prueba no creó una solicitud.</p>}{preview.warnings?.map(warning=><p key={warning}>{warning}</p>)}{previewStale?<p>La conversación cambió. Genera una respuesta nueva antes de usarla.</p>:<button disabled={Boolean(busy||pending)} onClick={()=>{setDraft(preview.reply_text);setNotice('Respuesta copiada al borrador. Revísala antes de enviarla como equipo.');}}>Usar como borrador</button>}</div>}
      </section>
      {instructions.length>0&&<details className="operator-instructions"><summary>Indicaciones guardadas ({instructions.length})</summary>{instructions.map(note=><article key={note.request_id}><small>{formatDateTime(note.created_at)} · {note.status==='pending_bot'?'Pendiente para el bot':'Procesada'}</small><p>{note.payload.text}</p></article>)}</details>}
    </section>
  </aside></div>;
}
