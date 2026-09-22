import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime } from "./lib/constants.js";
import { getPqrsAttachmentUrl, listPqrsCases, listPqrsEvents, subscribeToPqrs, updatePqrsCase } from "./lib/api.js";

const TYPES={peticion:"Petición",queja:"Queja",reclamo:"Reclamo",sugerencia:"Sugerencia",felicitacion:"Felicitación"};
const STATUSES={
  received:{label:"Recibida",tone:"blue"},
  in_review:{label:"En revisión",tone:"yellow"},
  awaiting_information:{label:"Esperando información",tone:"gray"},
  completed:{label:"Completada",tone:"green"},
  closed:{label:"Cerrada",tone:"dark"}
};

function Status({value}){const item=STATUSES[value]||{label:value,tone:"gray"};return <span className={`pqrs-status ${item.tone}`}>{item.label}</span>;}

export default function PqrsHub(){
  const [cases,setCases]=useState([]);
  const [selected,setSelected]=useState(null);
  const [events,setEvents]=useState([]);
  const [statusFilter,setStatusFilter]=useState("active");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [status,setStatus]=useState("in_review");
  const [response,setResponse]=useState("");
  const [internalNotes,setInternalNotes]=useState("");

  const refresh=useCallback(async()=>{
    try{setCases(await listPqrsCases());setError("");}
    catch(loadError){setError(loadError.message);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{refresh();const unsubscribe=subscribeToPqrs(refresh);return unsubscribe;},[refresh]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),5000);return()=>clearTimeout(timer);},[notice]);

  async function openCase(item){
    setSelected(item);setStatus(item.status);setInternalNotes(item.internal_notes||"");setResponse("");setError("");
    try{setEvents(await listPqrsEvents(item.id));}catch(loadError){setError(loadError.message);}
  }

  async function saveCase(sendResponse=false){
    if(sendResponse&&!response.trim()){setError("Escribe la respuesta que recibirá el cliente.");return;}
    setBusy(true);setError("");
    try{
      const result=await updatePqrsCase(selected.id,{status,internal_notes:internalNotes,response_message:sendResponse?response:""});
      await refresh();
      const updated={...selected,...result.case};setSelected(updated);setEvents(await listPqrsEvents(selected.id));setResponse("");
      setNotice(sendResponse?(result.email_sent?"Respuesta guardada y enviada al correo del cliente.":"Respuesta guardada. El correo se enviará cuando conectemos Resend."):"PQRS actualizada.");
    }catch(saveError){setError(saveError.message);}finally{setBusy(false);}
  }

  async function openAttachment(attachment){
    const popup=window.open("about:blank","_blank");
    try{const url=await getPqrsAttachmentUrl(attachment.storage_path);if(popup)popup.location.href=url;}
    catch(openError){if(popup)popup.close();setError(openError.message);}
  }

  const filtered=useMemo(()=>cases.filter(item=>{
    const term=search.trim().toLowerCase();
    const matches=!term||`${item.case_number} ${item.customer_name} ${item.customer_email} ${item.subject}`.toLowerCase().includes(term);
    const statusMatches=statusFilter==="all"||(statusFilter==="active"?!["closed","completed"].includes(item.status):item.status===statusFilter);
    return matches&&statusMatches;
  }),[cases,search,statusFilter]);

  return <section className="pqrs-hub">
    <div className="section-title"><div><p className="eyebrow">SERVICIO AL CLIENTE</p><h2>PQRS <span>{filtered.length}</span></h2></div><div className="pqrs-public-links"><a href="https://almaceneselrey.co/?pqrs=radicar" target="_blank" rel="noreferrer">Ver formulario público ↗</a></div></div>
    <div className="filters"><label className="search"><span>⌕</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar radicado, cliente o asunto"/></label><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="active">Pendientes</option><option value="all">Todas</option>{Object.entries(STATUSES).map(([value,item])=><option value={value} key={value}>{item.label}</option>)}</select></div>
    {error&&<div className="error-banner"><span>{error}</span><button onClick={()=>setError("")}>×</button></div>}
    {notice&&<div className="pqrs-notice">✓ {notice}</div>}
    {loading?<div className="empty"><p>Cargando PQRS…</p></div>:filtered.length?<div className="pqrs-list">
      {filtered.map(item=><button className="pqrs-row" key={item.id} onClick={()=>openCase(item)}>
        <div><b>{item.case_number}</b><small>{formatDateTime(item.created_at)}</small></div>
        <div><b>{item.customer_name}</b><small>{item.customer_email}</small></div>
        <div><span className="pqrs-type">{TYPES[item.type]||item.type}</span><strong>{item.subject}</strong></div>
        <div>{item.branch?.name&&<small>{item.branch.name}</small>}<Status value={item.status}/></div><span>→</span>
      </button>)}
    </div>:<div className="empty"><span>✓</span><h3>No hay PQRS en esta vista</h3><p>Los nuevos radicados aparecerán aquí en tiempo real.</p></div>}

    {selected&&<div className="modal-layer"><button className="modal-scrim" onClick={()=>setSelected(null)} aria-label="Cerrar"/><section className="pqrs-detail" role="dialog" aria-modal="true">
      <header><div><p className="eyebrow">{TYPES[selected.type]||selected.type}</p><h2>{selected.case_number}</h2></div><button className="modal-x" onClick={()=>setSelected(null)}>×</button></header>
      <div className="pqrs-detail-grid"><div><small>CLIENTE</small><b>{selected.customer_name}</b><span>{selected.customer_email}{selected.customer_phone?` · ${selected.customer_phone}`:""}</span></div><div><small>SEDE</small><b>{selected.branch?.name||"General"}</b><Status value={selected.status}/></div></div>
      <article className="pqrs-message"><small>ASUNTO</small><h3>{selected.subject}</h3><p>{selected.description}</p></article>
      {selected.attachments?.length>0&&<div className="pqrs-files"><small>ARCHIVOS ADJUNTOS</small>{selected.attachments.map(file=><button key={file.id} onClick={()=>openAttachment(file)}>↗ {file.original_name}</button>)}</div>}
      <div className="pqrs-form-grid"><label>Estado<select value={status} onChange={event=>setStatus(event.target.value)}>{Object.entries(STATUSES).map(([value,item])=><option value={value} key={value}>{item.label}</option>)}</select></label><label>Notas internas<textarea value={internalNotes} onChange={event=>setInternalNotes(event.target.value)} placeholder="Solo visibles para el equipo"/></label></div>
      <label className="pqrs-response">Respuesta al cliente<textarea value={response} onChange={event=>setResponse(event.target.value)} placeholder="Escribe aquí la respuesta formal que quedará en el expediente y se enviará por correo."/></label>
      <div className="pqrs-actions"><button className="secondary" onClick={()=>saveCase(false)} disabled={busy}>Guardar cambios</button><button className="primary" onClick={()=>saveCase(true)} disabled={busy}>{busy?"Guardando…":"Guardar y enviar respuesta"}</button></div>
      <div className="pqrs-timeline"><h3>Historial</h3>{events.map(event=><div key={event.id}><i/><span><b>{event.actor_name||"Sistema"}</b><small>{formatDateTime(event.created_at)}</small><p>{event.message}</p></span></div>)}</div>
    </section></div>}
  </section>;
}
