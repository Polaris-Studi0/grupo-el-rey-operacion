import { useEffect, useMemo, useState } from "react";
import { BRANCHES, formatDateTime, formatMoney } from "./lib/constants.js";
import { confirmBotStock, getBranchPaymentQrUrl, getChatAttachmentUrl, listChatbotData, recoverChatAttachment, resolveHumanTask, saveCatalogItem, saveKnowledge, subscribeToChatbot, uploadBranchPaymentQr } from "./lib/api.js";

import WhatsappDemo from "./WhatsappDemo.jsx";
import WhatsappCampaigns from "./WhatsappCampaigns.jsx";
import BotImages from "./BotImages.jsx";
import ConversationDrawer from "./ConversationDrawer.jsx";

const CAMPAIGNS_ENABLED=false; // Publicidad aplazada por Samuel; conservar el borrador de implementación.
const TASK_LABELS={product_lookup:"Consultar producto",delivery_quote:"Cotizar domicilio",payment_verification:"Verificar pago",credit_application:"Gestionar crédito",general:"Revisión manual"};
const STATUS_LABELS={open:"Activa",waiting_customer:"Esperando cliente",waiting_human:"Esperando respuesta",converted:"Compra creada",closed:"Cerrada"};
const CATEGORY_LABELS={general:"General",schedule:"Horarios",location:"Ubicación",promotion:"Promociones",policy:"Políticas",payment:"Pagos",delivery:"Domicilios",faq:"Preguntas frecuentes"};

function branchName(id){return BRANCHES.find(branch=>branch.id===id)?.name||"Sin sede";}

function Metric({ label, value, note, tone="" }){
  return <article className={`chat-metric ${tone}`}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>;
}

function Conversations({ data, onOpenAttachment, onRecoverAttachment, onChanged }){
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState(null);const [scope,setScope]=useState("active");
  const rows=useMemo(()=>data.conversations.filter(item=>{const term=query.trim().toLowerCase();if(scope==="active"&&item.status==="closed"||scope==="history"&&item.status!=="closed")return false;return !term||`${item.contact?.display_name||""} ${item.contact?.preferred_name||""} ${item.contact?.phone_e164||""} ${item.current_intent||""}`.toLowerCase().includes(term);}),[data.conversations,query,scope]);
  const liveSelected=selected?data.conversations.find(item=>item.id===selected.id)||selected:null;
  return <><div className="chat-toolbar"><select aria-label="Conversaciones" value={scope} onChange={e=>setScope(e.target.value)}><option value="active">Chats actuales</option><option value="history">Historial de chats</option><option value="all">Todos</option></select><label className="search"><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar cliente, teléfono o intención"/></label></div><div className="panel conversation-list"><div className="conversation-head"><span>Cliente</span><span>Sede / origen</span><span>Estado</span><span>Último contacto</span><span/></div>{rows.length===0?<div className="empty"><h3>Aún no hay conversaciones</h3><p>Las conversaciones aparecerán cuando el webhook procese mensajes reales.</p></div>:rows.map(item=><button key={item.id} className="conversation-row" onClick={()=>setSelected(item)}><div><b>{item.contact?.preferred_name||item.contact?.display_name||"Cliente sin nombre"}</b><span>{item.contact?.phone_e164}</span></div><div><b>{branchName(item.branch_id)}</b><span>Inicio: {formatDateTime(item.created_at)}</span><small>{item.session_closed_reason==="inactivity_24h"?"Cerrada tras 24 h sin mensajes":""}</small></div><div><span className={`conversation-status ${item.status}`}>{STATUS_LABELS[item.status]||item.status}</span><small>{item.automation_paused?"Control manual":item.current_intent||"Intención por identificar"}</small></div><div><b>{formatDateTime(item.last_message_at)}</b><span>{item.consent_status==="granted"?"Datos autorizados":"Consentimiento pendiente"}</span></div><i>→</i></button>)}</div>{liveSelected&&<ConversationDrawer key={liveSelected.id} conversation={liveSelected} onClose={()=>setSelected(null)} onOpenAttachment={onOpenAttachment} onRecoverAttachment={onRecoverAttachment} onChanged={onChanged}/>}</>;
}

function Tasks({ tasks, messages, attachments, onOpenAttachment, onRecoverAttachment, onResolved }){
  const [answer,setAnswer]=useState({});const [amount,setAmount]=useState({});const [approved,setApproved]=useState({});const [counts,setCounts]=useState({});
  const [busy,setBusy]=useState(null);const [error,setError]=useState("");
  async function submit(task,status){
    const commerce=!!task.context?.commerce;const payment=["payment_verification","credit_application"].includes(task.task_type);
    const value=answer[task.id]?.trim();const resolution={answer:value|| (status==="resolved"?(payment?"Pago aprobado":"Tarifa de domicilio confirmada"):"No disponible")};
    if(commerce&&status==="resolved"){
      if(task.context?.commerce?.kind==="confirmed_item"){resolution.available_qty=Number(counts[task.id]);resolution.approved_item=approved[task.id]===true;resolution.answer=value||"Existencias confirmadas para la selección";}
      if(task.task_type==="delivery_quote")resolution.delivery_fee=Number(amount[task.id]);
      if(payment){resolution.approved=approved[task.id]===true;resolution.amount=Number(amount[task.id]);}
    }
    setBusy(task.id);setError("");
    try{await resolveHumanTask(task.id,status,resolution,commerce);await onResolved();}
    catch(e){setError(e.message);}finally{setBusy(null);}
  }
  const pending=tasks.filter(task=>["pending","in_progress"].includes(task.status));
  return <div className="task-board">{error&&<p className="operator-error" role="alert">{error}</p>}{pending.length===0?<div className="panel empty"><span>✓</span><h3>No hay consultas pendientes</h3><p>Los casos que la IA no puede decidir aparecerán aquí.</p></div>:pending.map(task=>{
    const inboundId=task.context?.inbound_message_id;const files=attachments.filter(file=>file.message_id===inboundId);
    const recentMedia=messages.find(message=>message.id===inboundId&&message.conversation_id===task.conversation_id&&message.direction==="inbound"&&message.media_id);
    const commerce=!!task.context?.commerce;const payment=commerce&&["payment_verification","credit_application"].includes(task.task_type);
    const fee=commerce&&task.task_type==="delivery_quote";const hasAmount=amount[task.id]!==undefined&&amount[task.id]!==""&&Number.isSafeInteger(Number(amount[task.id]))&&Number(amount[task.id])>=0;
    const selectedItem=task.context?.commerce?.kind==="confirmed_item"?task.context.commerce.selection:null;
    const ready=selectedItem?approved[task.id]&&counts[task.id]!==undefined&&counts[task.id]!==""&&Number.isSafeInteger(Number(counts[task.id]))&&Number(counts[task.id])>=selectedItem.quantity:fee?hasAmount:payment?hasAmount&&approved[task.id]&&Number(amount[task.id])===task.context.commerce.amount:!!answer[task.id]?.trim();
    return <article className={`human-task ${task.priority}`} key={task.id}>
      <header><div><span>{TASK_LABELS[task.task_type]||task.task_type}</span><b>{task.title}</b></div><time>{formatDateTime(task.created_at)}</time></header>
      <p style={{whiteSpace:"pre-line"}}>{task.question}</p><div className="task-context"><span>{branchName(task.branch_id)}</span></div>
      {files.length?<div className="task-files">{files.map(file=><button key={file.id} onClick={()=>onOpenAttachment(file.storage_path)}>Ver {task.task_type==="payment_verification"?"comprobante":file.original_name||"archivo"}</button>)}</div>:recentMedia?<div className="task-files"><button onClick={()=>onRecoverAttachment(recentMedia.id)}>Recuperar comprobante</button></div>:task.task_type==="payment_verification"&&<p className="task-file-waiting">No hay un comprobante vinculado disponible.</p>}
      {selectedItem&&<><p><strong>{selectedItem.name}{selectedItem.variant?` · ${selectedItem.variant}`:""}</strong> · {formatMoney(selectedItem.unit_price_cop)} cada uno · Cliente solicita {selectedItem.quantity}.</p><label>Existencias físicas de este producto<input type="number" min={selectedItem.quantity} step="1" value={counts[task.id]??""} onChange={e=>setCounts({...counts,[task.id]:e.target.value})}/></label><label className="check"><input type="checkbox" checked={approved[task.id]||false} onChange={e=>setApproved({...approved,[task.id]:e.target.checked})}/> Confirmo este producto, su precio y el conteo indicado.</label><p className="form-note">Se guardará en el inventario de esta sede, sin descuento promocional. El conteo vale hasta las 8 p. m. de hoy.</p></>}
      {(fee||payment)&&<label>{fee?"Valor confirmado del domicilio (COP)":"Importe verificado (COP)"}<input type="number" min="0" step="1" value={amount[task.id]??""} onChange={e=>setAmount({...amount,[task.id]:e.target.value})}/></label>}
      {payment&&<><p>Total de esta compra: <strong>{formatMoney(task.context.commerce.amount)}</strong></p><label className="check"><input type="checkbox" checked={approved[task.id]||false} onChange={e=>setApproved({...approved,[task.id]:e.target.checked})}/> Verifiqué el pago o la aprobación del crédito por este importe.</label></>}
      {!payment&&!["payment_verification","credit_application","delivery_quote"].includes(task.task_type)&&task.branch_id&&<BotImages kind="task" branchId={task.branch_id} taskId={task.id}/>}
      <textarea value={answer[task.id]||""} onChange={e=>setAnswer({...answer,[task.id]:e.target.value})} placeholder={commerce?"Aclaración para el cliente (obligatoria al rechazar)":"Escribe la información confirmada para el cliente"}/>
      <footer><button disabled={busy===task.id||!answer[task.id]?.trim()} onClick={()=>submit(task,"rejected")}>No disponible</button><button className="primary" disabled={busy===task.id||!ready} onClick={()=>submit(task,"resolved")}>{busy===task.id?"Guardando…":selectedItem?"Confirmar existencias y continuar":payment?"Aprobar pago":fee?"Confirmar domicilio":"Confirmar respuesta"}</button></footer>
    </article>;
  })}</div>;
}

function Knowledge({ records, onSaved }){
  const initial={branch_id:"",category:"general",title:"",content:"",active:true};
  const [form,setForm]=useState(initial);const [busy,setBusy]=useState(false);
  async function submit(event){event.preventDefault();setBusy(true);try{await saveKnowledge({...form,branch_id:form.branch_id||null});setForm(initial);await onSaved();}finally{setBusy(false);}}
  return <div className="chat-manager"><form className="panel knowledge-form" onSubmit={submit}><p className="eyebrow">FUENTE CONTROLADA</p><h3>Agregar información</h3><label>Alcance<select value={form.branch_id} onChange={event=>setForm({...form,branch_id:event.target.value})}><option value="">Todas las sedes</option>{BRANCHES.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Categoría<select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{Object.entries(CATEGORY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Título<input value={form.title} onChange={event=>setForm({...form,title:event.target.value})} required/></label><label>Información confirmada<textarea value={form.content} onChange={event=>setForm({...form,content:event.target.value})} required placeholder="Escribe datos concretos. La IA solo responderá con información activa y vigente."/></label><button className="primary" disabled={busy}>{busy?"Guardando…":"Guardar conocimiento"}</button></form><div className="panel knowledge-list">{records.length===0?<div className="empty compact"><h3>Sin información cargada</h3><p>Agrega horarios, ubicaciones, políticas y promociones.</p></div>:records.map(record=><article key={record.id}><div><span>{CATEGORY_LABELS[record.category]}</span><b>{record.title}</b><small>{record.branch_id?branchName(record.branch_id):"Todas las sedes"}</small></div><p>{record.content}</p><em>{record.active?"ACTIVA":"INACTIVA"}</em></article>)}</div></div>;
}

function PaymentQrs({ records, onSaved }){
  const [branchId,setBranchId]=useState("b1");const [file,setFile]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event){event.preventDefault();setBusy(true);setError("");try{await uploadBranchPaymentQr(branchId,file);setFile(null);event.currentTarget.reset();await onSaved();}catch(uploadError){setError(uploadError.message);}finally{setBusy(false);}}
  async function preview(path){const popup=window.open("about:blank","_blank");try{const url=await getBranchPaymentQrUrl(path);if(popup)popup.location.href=url;}catch(previewError){if(popup)popup.close();setError(previewError.message);}}
  return <div className="chat-manager"><form className="panel knowledge-form" onSubmit={submit}><p className="eyebrow">PAGOS POR TRANSFERENCIA</p><h3>Código QR por sede</h3><label>Sede<select value={branchId} onChange={event=>setBranchId(event.target.value)}>{BRANCHES.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Imagen del QR<input type="file" accept="image/png,image/jpeg" onChange={event=>setFile(event.target.files?.[0]||null)} required/></label><p className="form-note">JPG o PNG, máximo 5 MB. Al subir otro QR para la misma sede se reemplaza el anterior.</p>{error&&<p className="operator-error">{error}</p>}<button className="primary" disabled={busy||!file}>{busy?"Subiendo…":"Guardar QR de la sede"}</button></form><div className="panel qr-list">{BRANCHES.map(branch=>{const record=records.find(item=>item.branch_id===branch.id);return <article key={branch.id}><div><b>{branch.name}</b><span>{record?record.original_name:"Pendiente por cargar"}</span></div>{record?<><em>{["image/jpeg","image/png"].includes(record.mime_type)?"QR ACTIVO":"SUBIR JPG O PNG"}</em><button onClick={()=>preview(record.storage_path)}>Ver imagen</button></>:<em className="missing">SIN QR</em>}</article>;})}</div></div>;
}

function Inventory({ inventory, onSaved }){
  const initial={branch_id:"b1",product_id:"",sku:"",name:"",description:"",price:0,available_qty:0,low_stock_threshold:2,seasonal:false,active:true,promotional_price:"",promotion_from:"",promotion_until:"",confirm_stock:false};
  const [form,setForm]=useState(initial);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event){event.preventDefault();setBusy(true);setError("");try{const saved=await saveCatalogItem(form);setForm({...form,product_id:saved.product_id,confirm_stock:false});await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function confirm(item){setBusy(true);setError("");try{await confirmBotStock(item.branch_id,item.product_id,item.available_qty);await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
  function edit(item){setForm({...initial,...item,...item.product,product_id:item.product_id,active:item.active,promotional_price:item.promotional_price??"",promotion_from:item.promotion_from?new Date(Date.parse(item.promotion_from)-5*3600000).toISOString().slice(0,16):"",promotion_until:item.promotion_until?new Date(Date.parse(item.promotion_until)-5*3600000).toISOString().slice(0,16):"",confirm_stock:false});}
  return <div className="chat-manager"><form className="panel knowledge-form" onSubmit={submit}>
    <p className="eyebrow">CATÁLOGO Y EXISTENCIAS</p><h3>{form.product_id?"Editar producto":"Agregar producto por sede"}</h3>
    {error&&<p className="operator-error" role="alert">{error}</p>}
    <label>Sede<select value={form.branch_id} disabled={!!form.product_id} onChange={e=>setForm({...form,branch_id:e.target.value})}>{BRANCHES.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    <div className="mini-grid"><label>SKU<input value={form.sku||""} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label>Existencias físicas<input required type="number" min="0" step="1" value={form.available_qty} onChange={e=>setForm({...form,available_qty:Number(e.target.value)})}/></label></div>
    <label>Producto<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
    <label>Descripción<input value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <div className="mini-grid"><label>Precio regular<input required type="number" min="0" step="1" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></label><label>Precio promocional<input type="number" min="0" step="1" value={form.promotional_price} onChange={e=>setForm({...form,promotional_price:e.target.value})}/></label></div>
    {form.promotional_price!==""&&<div className="mini-grid"><label>Inicio (Colombia)<input required type="datetime-local" value={form.promotion_from} onChange={e=>setForm({...form,promotion_from:e.target.value})}/></label><label>Fin (Colombia)<input required type="datetime-local" value={form.promotion_until} onChange={e=>setForm({...form,promotion_until:e.target.value})}/></label></div>}
    <label className="check"><input type="checkbox" checked={form.seasonal} onChange={e=>setForm({...form,seasonal:e.target.checked})}/> Producto de temporada o pauta</label>
    <label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Disponible en el catálogo de esta sede</label>
    <label className="check"><input type="checkbox" checked={form.confirm_stock} onChange={e=>setForm({...form,confirm_stock:e.target.checked})}/> Confirmo que conté estas existencias hoy. El bot podrá ofrecerlas hasta las 8 p. m.</label>
    <button className="primary" disabled={busy}>{busy?"Guardando…":"Guardar producto"}</button>{form.product_id&&<button type="button" onClick={()=>setForm(initial)}>Cancelar edición</button>}
    {form.product_id?<BotImages kind="product" branchId={form.branch_id} productId={form.product_id}/>:<p className="form-note">Guarda el producto para añadir sus fotos.</p>}
  </form><div className="panel inventory-list">{inventory.length===0?<div className="empty compact"><h3>Catálogo vacío</h3><p>Agrega una promoción real y confirma sus existencias para probar la compra.</p></div>:inventory.map(item=>{
    const available=item.available_qty-item.reserved_qty;const date=item.stock_confirmed_at?new Date(Date.parse(item.stock_confirmed_at)-5*3600000).toISOString().slice(0,10):"";
    const valid=date&&Date.now()<Date.parse(`${date}T20:00:00-05:00`);const promo=item.promotional_price!=null&&(!item.promotion_from||Date.parse(item.promotion_from)<=Date.now())&&(!item.promotion_until||Date.parse(item.promotion_until)>Date.now());
    return <article key={`${item.branch_id}-${item.product_id}`}><div><b>{item.product?.name}</b><span>{item.product?.sku||"Sin SKU"} · {branchName(item.branch_id)}</span><small>{valid?"Conteo confirmado hasta las 8 p. m.":"Necesita confirmar existencias"}</small></div><strong>{formatMoney(promo?item.promotional_price:item.price)}</strong><div><b>{available}</b><span>disponibles</span><small>{item.reserved_qty} reservadas</small><button onClick={()=>edit(item)}>Editar</button><button disabled={busy} onClick={()=>confirm(item)}>Confirmar conteo de {item.available_qty} hoy</button></div></article>;
  })}</div></div>;
}

export default function ChatbotHub(){
  const [tab,setTab]=useState("conversations");const [data,setData]=useState({contacts:[],conversations:[],messages:[],attachments:[],tasks:[],knowledge:[],inventory:[],paymentQrs:[]});const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  async function refresh({silent=false}={}){if(!silent)setLoading(true);try{setData(await listChatbotData());setError("");}catch(loadError){setError(loadError.message);}finally{if(!silent)setLoading(false);}}
  async function openAttachment(path){const popup=window.open("about:blank","_blank");try{const url=await getChatAttachmentUrl(path);if(popup)popup.location.href=url;else window.open(url,"_blank","noopener,noreferrer");}catch(fileError){if(popup)popup.close();setError(fileError.message);}}
  async function recoverAttachment(messageId){const popup=window.open("about:blank","_blank");try{const recovered=await recoverChatAttachment(messageId);const url=await getChatAttachmentUrl(recovered.storage_path);if(popup)popup.location.href=url;await refresh({silent:true});}catch(fileError){if(popup)popup.close();setError(fileError.message);}}
  useEffect(()=>{let timer;let running=false;const sync=()=>{clearTimeout(timer);timer=setTimeout(async()=>{if(running)return;running=true;try{await refresh({silent:true});}finally{running=false;}},250);};refresh();const unsubscribe=subscribeToChatbot(sync);const fallback=setInterval(sync,5000);return()=>{clearTimeout(timer);clearInterval(fallback);unsubscribe();};},[]);
  const pending=data.tasks.filter(task=>["pending","in_progress"].includes(task.status));
  const lowStock=data.inventory.filter(item=>item.available_qty-item.reserved_qty<=item.low_stock_threshold);
  return <section className="chatbot-page"><div className="section-title"><div><p className="eyebrow">COMERCIO CONVERSACIONAL</p><h2>WhatsApp e IA</h2></div><span>Control humano en decisiones sensibles</span></div>
    <div className="chat-metrics"><Metric label="CONVERSACIONES ABIERTAS" value={data.conversations.filter(item=>item.status!=="closed").length} note="Clientes en atención"/><Metric label="PENDIENTES HUMANOS" value={pending.length} note="Requieren una respuesta" tone={pending.length?"warning":""}/><Metric label="ALERTAS DE INVENTARIO" value={lowStock.length} note="Productos en nivel bajo" tone={lowStock.length?"warning":""}/><Metric label="CONSENTIMIENTOS" value={data.conversations.filter(item=>item.consent_status==="granted").length} note="Autorizaciones registradas"/></div>
    <nav className="chat-tabs">{[["conversations","Conversaciones"],["tasks",`Pendientes${pending.length?` · ${pending.length}`:""}`],["knowledge","Conocimiento"],["inventory","Inventario"],["payments","Pagos y QR"],["demo","Demo de envío"],...(CAMPAIGNS_ENABLED?[["campaigns","Publicidad"]]:[])].map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {error&&<div className="inline-warning">No fue posible cargar el módulo: {error}. Si acabas de actualizar el proyecto, ejecuta primero la nueva migración SQL.</div>}
    {loading?<div className="panel empty"><p>Cargando operación conversacional…</p></div>:<>{tab==="conversations"&&<Conversations data={data} onOpenAttachment={openAttachment} onRecoverAttachment={recoverAttachment} onChanged={refresh}/>} {tab==="tasks"&&<Tasks tasks={data.tasks} messages={data.messages} attachments={data.attachments||[]} onOpenAttachment={openAttachment} onRecoverAttachment={recoverAttachment} onResolved={refresh}/>} {tab==="knowledge"&&<Knowledge records={data.knowledge} onSaved={refresh}/>} {tab==="inventory"&&<Inventory inventory={data.inventory} onSaved={refresh}/>} {CAMPAIGNS_ENABLED&&tab==="campaigns"&&<WhatsappCampaigns contacts={data.contacts}/>} {tab==="demo"&&<WhatsappDemo/>} {tab==="payments"&&<PaymentQrs records={data.paymentQrs||[]} onSaved={refresh}/>}</>}
  </section>;
}
