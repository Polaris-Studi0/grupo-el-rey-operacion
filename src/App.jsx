import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isDemoMode } from "./lib/supabase.js";
import { BRANCHES, STATUS, PAYMENT, formatMoney, formatDateTime } from "./lib/constants.js";
import { getProfile, listCouriers, listEvents, listOrders, saveCourier, saveOrder, signIn, signOut, subscribeToOrders, transitionOrder } from "./lib/api.js";

const demoProfiles = {
  admin: { id:"demo-admin", full_name:"Samuel Ceballos", role:"admin", branch_id:null, branch:null },
  cashier: { id:"demo-cashier", full_name:"Laura Morales", role:"cashier", branch_id:"b1", branch:BRANCHES[0] }
};

function Login({ onDemoLogin }){
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  async function submit(event){
    event.preventDefault(); setBusy(true); setError("");
    try { await signIn(email,password); }
    catch (loginError){ setError(loginError.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : loginError.message); }
    finally { setBusy(false); }
  }
  return <main className="login-page">
    <section className="login-brand"><img src="/elreylogo.png" alt="Almacenes El Rey"/><span>Centro de operaciones</span></section>
    <section className="login-card">
      <p className="eyebrow">ACCESO SEGURO</p><h2>Bienvenido</h2><p>Ingresa para gestionar los pedidos de tu sede.</p>
      {isDemoMode ? <div className="demo-access">
        <div className="demo-notice"><b>Modo demostración</b><span>Conecta Supabase para activar usuarios y datos reales.</span></div>
        <button className="primary" onClick={()=>onDemoLogin(demoProfiles.admin)}>Entrar como administrador <span>→</span></button>
        <button className="secondary" onClick={()=>onDemoLogin(demoProfiles.cashier)}>Entrar como caja · Robledo Aures</button>
      </div> : <form onSubmit={submit}>
        <label>Correo<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}<span>→</span></button>
      </form>}
    </section>
  </main>;
}

function StatusPill({ status }){
  const value = STATUS[status] || {label:status,tone:"gray"};
  return <span className={`status-pill ${value.tone}`}><i />{value.label}</span>;
}

function Sidebar({ profile, page, setPage, onLogout }){
  const admin = profile.role === "admin";
  const items = admin
    ? [["orders","Pedidos","01"],["new","Nuevo pedido","02"],["couriers","Domiciliarios","03"],["audit","Trazabilidad","04"]]
    : [["orders","Pedidos de sede","01"],["ready","Por despacho","02"],["history","Historial","03"]];
  return <aside className="sidebar">
    <div className="brand"><img src="/elreylogo.png" alt="Almacenes El Rey"/><div><strong>OPERACIÓN</strong><small>Centro de pedidos</small></div></div>
    <p className="workspace-label">{admin ? "ADMINISTRACIÓN" : "OPERACIÓN DE CAJA"}</p>
    <nav>{items.map(([id,label,index])=><button key={id} className={page===id?"active":""} onClick={()=>setPage(id)}><i>{index}</i>{label}</button>)}</nav>
    <div className="sidebar-footer"><div className="live"><i/><span><b>Sistema activo</b><small>Sincronización en vivo</small></span></div><button className="logout" onClick={onLogout}>Cerrar sesión</button></div>
  </aside>;
}

function CashierOrders({ orders, couriers, onOpen, onTransition }){
  const time = value=>new Intl.DateTimeFormat("es-CO",{hour:"numeric",minute:"2-digit"}).format(new Date(value));
  if(!orders.length) return <div className="cashier-empty"><span>✓</span><h3>Todo al día</h3><p>No hay pedidos que coincidan con esta vista.</p></div>;
  return <div className="cashier-order-list">{orders.map(order=>{
    const courier=order.courier||couriers.find(item=>item.id===order.courier_id);
    const canReady=order.status==="preparing";
    const canDispatch=order.status==="ready"&&order.fulfillment_type==="delivery"&&courier;
    const canPickup=order.status==="ready"&&order.fulfillment_type==="pickup";
    return <article className={`cashier-order-card ${order.status}`} key={order.id}>
      <button className="cashier-thumb" onClick={()=>onOpen(order)} aria-label={`Ver detalle ${order.order_number}`}><span>{order.items.length}</span><small>PRODUCTOS</small></button>
      <div className="cashier-time"><small>HOY</small><strong>{time(order.created_at)}</strong><span>{formatDateTime(order.created_at).split(",")[0]}</span></div>
      <div className="cashier-products"><StatusPill status={order.status}/><p>#{order.order_number} · {order.fulfillment_type==="pickup"?"RECOGIDA":"DOMICILIO"}</p><ul>{order.items.map((item,index)=><li key={`${item.name}-${index}`}><b>{item.qty}×</b>{item.name}</li>)}</ul><div className="cashier-meta"><strong>{formatMoney(order.total)}</strong><span>{PAYMENT[order.payment_method]}</span></div></div>
      <div className="cashier-destination"><small>{order.fulfillment_type==="pickup"?"RECOGE EN":"ENTREGA"}</small><strong>{order.fulfillment_type==="pickup"?order.branch?.name:order.delivery_zone}</strong><span>{order.fulfillment_type==="pickup"?order.customer_name:order.delivery_address}</span>{order.fulfillment_type==="delivery"&&(courier?<div className="cashier-courier assigned"><small>DOMICILIARIO ASIGNADO</small><b>{courier.name}</b><span>Placa {courier.plate}{order.eta_minutes?` · ${order.eta_minutes} min`:""}</span></div>:<div className="cashier-courier waiting"><small>DOMICILIARIO</small><b>Por asignar</b><span>Polaris notificará la asignación</span></div>)}<button onClick={()=>onOpen(order)}>Ver detalle</button></div>
      <div className="cashier-action">{canReady&&<button onClick={()=>onTransition(order,"ready")}>Listo para despacho <span>→</span></button>}{canDispatch&&<button onClick={()=>onTransition(order,"dispatch")}>Entregado al domiciliario <span>→</span></button>}{canPickup&&<button onClick={()=>onTransition(order,"pickup")}>Entregado al cliente <span>→</span></button>}{order.status==="ready"&&order.fulfillment_type==="delivery"&&!courier&&<button disabled>Esperando domiciliario <span>···</span></button>}{["dispatched","delivered"].includes(order.status)&&<div className="cashier-done"><span>✓</span><b>{order.status==="delivered"?"Entregado":"Despachado"}</b></div>}</div>
    </article>;
  })}</div>;
}

function Header({ profile, onLogout }){
  return <header className="topbar"><div><p className="eyebrow">CENTRO DE OPERACIONES</p><h1>{profile.role === "admin" ? "Control de pedidos" : profile.branch?.name}</h1></div><button className="profile" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión"><span>{profile.full_name.split(" ").map(part=>part[0]).slice(0,2).join("")}</span><div><b>{profile.full_name}</b><small>{profile.role === "admin" ? "Administrador" : "Responsable de caja"}</small></div></button></header>;
}

function Summary({ orders }){
  const count = status => orders.filter(order=>order.status===status).length;
  return <section className="summary">
    <article><small>EN PREPARACIÓN</small><strong>{count("preparing")}</strong><span>La sede está alistando</span></article>
    <article><small>POR DESPACHO</small><strong>{count("ready")}</strong><span>Listos para asignación</span></article>
    <article><small>EN CAMINO</small><strong>{count("dispatched")}</strong><span>Con el domiciliario</span></article>
    <article className="cutoff"><small>CORTE DOMICILIOS</small><strong>7:00 <i>p. m.</i></strong><span>Solicitudes posteriores: día siguiente</span></article>
  </section>;
}

function OrdersTable({ orders, couriers, profile, onOpen, onEdit, onAssign, onTransition }){
  if(!orders.length) return <div className="empty"><span>✓</span><h3>Todo al día</h3><p>No hay pedidos que coincidan con los filtros.</p></div>;
  return <div className="order-table">
    <div className="table-head"><span>Pedido</span><span>Cliente y destino</span><span>Estado</span><span>Domiciliario / tiempo</span><span>Total</span><span /></div>
    {orders.map(order=>{
      const courier = order.courier || couriers.find(item=>item.id===order.courier_id);
      return <article key={order.id} className="order-row" onClick={()=>onOpen(order)}>
        <div className="order-id"><b>#{order.order_number}</b><small>{formatDateTime(order.created_at)}</small><em>{order.fulfillment_type === "pickup" ? "Recogida" : "Domicilio"}</em></div>
        <div><b>{order.customer_name}</b><small>{order.fulfillment_type === "pickup" ? order.branch?.name : `${order.delivery_zone || "Sin zona"} · ${order.branch?.name || ""}`}</small><p>{order.items?.[0]?.name}{order.items?.length>1 ? ` +${order.items.length-1}` : ""}</p></div>
        <div><StatusPill status={order.status}/></div>
        <div className="courier-cell">{courier ? <><b>{courier.name}</b><small>{courier.plate}{order.eta_minutes ? ` · ${order.eta_minutes} min` : ""}</small></> : <><b className="muted">Sin asignar</b><small>{order.fulfillment_type === "pickup" ? "Recoge el cliente" : "Pendiente"}</small></>}</div>
        <div className="amount">{formatMoney(order.total)}</div>
        <div className="row-actions" onClick={event=>event.stopPropagation()}>
          {profile.role === "admin" && <><button title="Editar" onClick={()=>onEdit(order)}>Editar</button>{order.fulfillment_type==="delivery" && !["delivered","cancelled"].includes(order.status) && <button className="accent" onClick={()=>onAssign(order)}>Asignar</button>}</>}
          {profile.role === "cashier" && order.status==="preparing" && <button className="accent" onClick={()=>onTransition(order,"ready")}>Listo</button>}
          {profile.role === "cashier" && order.status==="ready" && order.fulfillment_type==="delivery" && courier && <button className="accent" onClick={()=>onTransition(order,"dispatch")}>Entregar</button>}
          {profile.role === "cashier" && order.status==="ready" && order.fulfillment_type==="pickup" && <button className="accent" onClick={()=>onTransition(order,"pickup")}>Entregar</button>}
        </div>
      </article>;
    })}
  </div>;
}

function OrderDetail({ order, couriers, profile, onClose, onEdit, onAssign, onTransition }){
  if(!order) return null;
  const courier = order.courier || couriers.find(item=>item.id===order.courier_id);
  const timeline = [
    ["Pedido registrado",order.created_at,true],
    ["Listo en la sede",order.ready_at,Boolean(order.ready_at)],
    [order.fulfillment_type==="pickup"?"Entregado al cliente":"Entregado al domiciliario",order.fulfillment_type==="pickup"?order.delivered_at:order.dispatched_at,Boolean(order.fulfillment_type==="pickup"?order.delivered_at:order.dispatched_at)],
    ...(order.fulfillment_type==="delivery" ? [["Entrega final confirmada",order.delivered_at,Boolean(order.delivered_at)]] : [])
  ];
  return <div className="overlay"><button className="backdrop" aria-label="Cerrar" onClick={onClose}/><aside className="drawer">
    <button className="close" onClick={onClose}>×</button><p className="eyebrow">DETALLE DEL PEDIDO</p><h2>#{order.order_number}</h2><StatusPill status={order.status}/>
    <section className="detail-block"><h3>Productos</h3>{order.items.map((item,index)=><div className="product-line" key={`${item.name}-${index}`}><span>{item.qty}×</span><p>{item.name}</p><b>{formatMoney(item.qty*item.unit_price)}</b></div>)}<div className="detail-total"><span>Total</span><strong>{formatMoney(order.total)}</strong></div></section>
    <dl><div><dt>Cliente</dt><dd>{order.customer_name}<small>{order.customer_phone}</small></dd></div><div><dt>Modalidad</dt><dd>{order.fulfillment_type==="pickup"?"Recogida en tienda":"Domicilio"}</dd></div><div><dt>Sede</dt><dd>{order.branch?.name}</dd></div><div><dt>Pago</dt><dd>{PAYMENT[order.payment_method]}</dd></div><div><dt>Origen</dt><dd>{order.source || "No indicado"}</dd></div>{order.fulfillment_type==="delivery"&&<div><dt>Entrega</dt><dd>{order.delivery_address}<small>{order.delivery_zone}</small></dd></div>}</dl>
    {courier && <section className="courier-box"><small>DOMICILIARIO ASIGNADO</small><strong>{courier.name}</strong><span>Placa {courier.plate} · {courier.phone}</span><b>{order.eta_minutes ? `Tiempo estimado: ${order.eta_minutes} min` : "Sin tiempo estimado"}</b></section>}
    {(order.customer_notes||order.internal_notes)&&<section className="notes"><h3>Notas</h3>{order.customer_notes&&<p><b>Cliente:</b> {order.customer_notes}</p>}{order.internal_notes&&<p><b>Interna:</b> {order.internal_notes}</p>}</section>}
    <section className="timeline"><h3>Trazabilidad</h3>{timeline.map(([label,date,complete])=><div className={complete?"complete":""} key={label}><i/><p><b>{label}</b><small>{complete?formatDateTime(date):"Pendiente"}</small></p></div>)}</section>
    <div className="drawer-actions">{profile.role==="admin"&&<><button onClick={()=>onEdit(order)}>Editar pedido</button>{order.fulfillment_type==="delivery"&&!['delivered','cancelled'].includes(order.status)&&<button className="primary" onClick={()=>onAssign(order)}>Asignar domiciliario</button>}{order.status==="dispatched"&&<button className="primary" onClick={()=>onTransition(order,"delivered")}>Confirmar entrega final</button>}</>}{profile.role==="cashier"&&order.status==="preparing"&&<button className="primary" onClick={()=>onTransition(order,"ready")}>Marcar listo para despacho</button>}{profile.role==="cashier"&&order.status==="ready"&&order.fulfillment_type==="delivery"&&courier&&<button className="primary" onClick={()=>onTransition(order,"dispatch")}>Entregado al domiciliario</button>}{profile.role==="cashier"&&order.status==="ready"&&order.fulfillment_type==="pickup"&&<button className="primary" onClick={()=>onTransition(order,"pickup")}>Entregado al cliente</button>}</div>
  </aside></div>;
}

const blankOrder = { branch_id:"b1",fulfillment_type:"delivery",status:"preparing",customer_name:"",customer_phone:"",delivery_address:"",delivery_zone:"",items:[{qty:1,name:"",unit_price:0}],payment_method:"transfer",source:"WhatsApp",customer_notes:"",internal_notes:"",courier_id:null,eta_minutes:null,promised_at:null };

function OrderEditor({ order, onClose, onSave }){
  const [form,setForm] = useState(()=>structuredClone(order||blankOrder));
  const [busy,setBusy] = useState(false);
  const total = form.items.reduce((sum,item)=>sum+Number(item.qty||0)*Number(item.unit_price||0),0);
  const change = (key,value)=>setForm(current=>({...current,[key]:value}));
  const changeItem = (index,key,value)=>setForm(current=>({...current,items:current.items.map((item,itemIndex)=>itemIndex===index?{...item,[key]:value}:item)}));
  const removeItem = index=>setForm(current=>({...current,items:current.items.filter((_,itemIndex)=>itemIndex!==index)}));
  async function submit(event){ event.preventDefault(); setBusy(true); try{await onSave({...form,total});}finally{setBusy(false);} }
  return <div className="overlay"><button className="backdrop" aria-label="Cerrar" onClick={onClose}/><section className="modal editor"><button className="close" onClick={onClose}>×</button><p className="eyebrow">{order?"EDITAR PEDIDO":"NUEVO PEDIDO"}</p><h2>{order?`#${order.order_number}`:"Registrar venta"}</h2>
    <form onSubmit={submit}>
      <div className="form-grid"><label>Sede<select value={form.branch_id} onChange={e=>change("branch_id",e.target.value)}>{BRANCHES.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Modalidad<select value={form.fulfillment_type} onChange={e=>setForm(current=>({...current,fulfillment_type:e.target.value,courier_id:e.target.value==="pickup"?null:current.courier_id}))}><option value="delivery">Domicilio</option><option value="pickup">Recogida en tienda</option></select></label><label>Cliente<input value={form.customer_name} onChange={e=>change("customer_name",e.target.value)} required /></label><label>Teléfono<input value={form.customer_phone} onChange={e=>change("customer_phone",e.target.value)} required /></label>{form.fulfillment_type==="delivery"&&<><label>Dirección<input value={form.delivery_address} onChange={e=>change("delivery_address",e.target.value)} required /></label><label>Zona o barrio<input value={form.delivery_zone} onChange={e=>change("delivery_zone",e.target.value)} required /></label></>}<label>Medio de pago<select value={form.payment_method} onChange={e=>change("payment_method",e.target.value)}>{Object.entries(PAYMENT).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Origen<input value={form.source} onChange={e=>change("source",e.target.value)} placeholder="WhatsApp, Instagram…" /></label>{order&&<label>Estado<select value={form.status} onChange={e=>change("status",e.target.value)}>{Object.entries(STATUS).map(([value,item])=><option key={value} value={value}>{item.label}</option>)}</select></label>}</div>
      <fieldset><legend>Productos</legend>{form.items.map((item,index)=><div className="item-row" key={index}><label>Producto<input value={item.name} onChange={e=>changeItem(index,"name",e.target.value)} required /></label><label>Cantidad<input type="number" min="1" value={item.qty} onChange={e=>changeItem(index,"qty",Number(e.target.value))} required /></label><label>Precio unitario<input type="number" min="0" step="100" value={item.unit_price} onChange={e=>changeItem(index,"unit_price",Number(e.target.value))} required /></label>{form.items.length>1&&<button type="button" className="remove" onClick={()=>removeItem(index)}>×</button>}</div>)}<button type="button" className="add-line" onClick={()=>change("items",[...form.items,{qty:1,name:"",unit_price:0}])}>+ Agregar producto</button><div className="calculated-total">TOTAL <strong>{formatMoney(total)}</strong></div></fieldset>
      <div className="form-grid"><label className="wide">Indicaciones del cliente<textarea value={form.customer_notes||""} onChange={e=>change("customer_notes",e.target.value)} /></label><label className="wide">Nota interna<textarea value={form.internal_notes||""} onChange={e=>change("internal_notes",e.target.value)} /></label></div>
      <div className="modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?"Guardando…":"Guardar pedido"}</button></div>
    </form>
  </section></div>;
}

function AssignmentModal({ order, couriers, onClose, onSave }){
  const [courierId,setCourierId] = useState(order.courier_id||"");
  const [eta,setEta] = useState(order.eta_minutes||15);
  const [busy,setBusy] = useState(false);
  async function submit(event){event.preventDefault();setBusy(true);try{await onSave({...order,courier_id:courierId,eta_minutes:Number(eta),promised_at:new Date(Date.now()+Number(eta)*60_000).toISOString()});}finally{setBusy(false);}}
  return <div className="overlay"><button className="backdrop" aria-label="Cerrar" onClick={onClose}/><section className="modal small"><button className="close" onClick={onClose}>×</button><p className="eyebrow">ASIGNAR DOMICILIARIO</p><h2>#{order.order_number}</h2><form onSubmit={submit}><label>Domiciliario<select value={courierId} onChange={e=>setCourierId(e.target.value)} required><option value="">Selecciona una persona</option>{couriers.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name} · {item.plate}</option>)}</select></label><label>Tiempo estimado de llegada<input type="number" min="1" max="240" value={eta} onChange={e=>setEta(e.target.value)} required/><span className="input-suffix">minutos</span></label><div className="modal-actions"><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?"Asignando…":"Confirmar asignación"}</button></div></form></section></div>;
}

function CourierManager({ couriers, onSave }){
  const empty = {name:"",plate:"",phone:"",provider:"Independiente",active:true};
  const [editing,setEditing] = useState(null);
  const [form,setForm] = useState(empty);
  function edit(courier){setEditing(courier.id);setForm(courier);}
  async function submit(event){event.preventDefault();await onSave({...form,id:editing});setEditing(null);setForm(empty);}
  return <section className="manager"><div className="section-title"><div><p className="eyebrow">EQUIPO DE ENTREGA</p><h2>Domiciliarios</h2></div></div><div className="manager-grid"><form className="panel courier-form" onSubmit={submit}><h3>{editing?"Editar domiciliario":"Agregar domiciliario"}</h3><label>Nombre<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label><label>Placa<input value={form.plate} onChange={e=>setForm({...form,plate:e.target.value.toUpperCase()})} required/></label><label>Teléfono<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required/></label><label>Proveedor<input value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})}/></label><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Disponible para asignar</label><button className="primary">{editing?"Guardar cambios":"Agregar"}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(empty);}}>Cancelar</button>}</form><div className="panel courier-list">{couriers.map(item=><article key={item.id}><span className={item.active?"available":"offline"}/><div><b>{item.name}</b><small>{item.plate} · {item.phone}</small><em>{item.provider}</em></div><button onClick={()=>edit(item)}>Editar</button></article>)}</div></div></section>;
}

function AuditLog({ events, orders, couriers }){
  const labels={created:"Pedido creado",updated:"Pedido actualizado",courier_assigned:"Domiciliario asignado",status_changed:"Estado actualizado",ready:"Marcado como listo",dispatch:"Entregado al domiciliario",pickup:"Entregado al cliente",delivered:"Entrega final confirmada",cancelled:"Pedido cancelado"};
  const fieldLabels={status:"Estado",branch_id:"Sede",customer_name:"Cliente",customer_phone:"Teléfono",delivery_address:"Dirección",delivery_zone:"Zona",items:"Productos",total:"Total",payment_method:"Medio de pago",source:"Origen",customer_notes:"Nota del cliente",internal_notes:"Nota interna",courier_id:"Domiciliario",eta_minutes:"Tiempo estimado",promised_at:"Hora prometida",fulfillment_type:"Modalidad"};
  const showValue=(field,value)=>{
    if(value==null||value==="")return "Sin definir";
    if(field==="status")return STATUS[value]?.label||value;
    if(field==="payment_method")return PAYMENT[value]||value;
    if(field==="branch_id")return BRANCHES.find(item=>item.id===value)?.name||value;
    if(field==="courier_id")return couriers.find(item=>item.id===value)?.name||value;
    if(field==="items")return `${value.length} producto(s)`;
    if(field==="total")return formatMoney(value);
    if(field==="eta_minutes")return `${value} minutos`;
    if(field==="promised_at")return formatDateTime(value);
    if(field==="fulfillment_type")return value==="delivery"?"Domicilio":"Recogida en tienda";
    return String(value);
  };
  return <section><div className="section-title"><div><p className="eyebrow">HISTORIAL INALTERABLE</p><h2>Trazabilidad completa</h2></div><span>{events.length} movimientos</span></div><div className="audit panel">{events.length===0?<div className="empty compact"><h3>Aún no hay movimientos</h3><p>Las acciones realizadas aparecerán aquí.</p></div>:events.map(event=>{const order=event.order||orders.find(item=>item.id===event.order_id);const actor=event.actor_name||"Sistema";const changed=event.before_data?Object.keys(fieldLabels).filter(key=>JSON.stringify(event.before_data?.[key])!==JSON.stringify(event.after_data?.[key])):Object.keys(fieldLabels).filter(key=>event.after_data?.[key]!=null);return <article key={event.id}><i/><div><b>{labels[event.action]||event.action}</b><p>#{order?.order_number||event.after_data?.order_number||"Pedido"} · {actor}</p><small>{formatDateTime(event.created_at)}</small>{changed.length>0&&<details><summary>Ver {event.before_data?"cambios":"datos registrados"}</summary><dl>{changed.map(field=><div key={field}><dt>{fieldLabels[field]}</dt>{event.before_data&&<dd><small>Antes</small>{showValue(field,event.before_data[field])}</dd>}<dd><small>{event.before_data?"Después":"Valor"}</small>{showValue(field,event.after_data?.[field])}</dd></div>)}</dl></details>}</div><span>{event.actor_role||"sistema"}</span></article>;})}</div></section>;
}

function App(){
  const [profile,setProfile] = useState(null);
  const [loading,setLoading] = useState(!isDemoMode);
  const [orders,setOrders] = useState([]);
  const [couriers,setCouriers] = useState([]);
  const [events,setEvents] = useState([]);
  const [page,setPage] = useState("orders");
  const [search,setSearch] = useState("");
  const [branchFilter,setBranchFilter] = useState("all");
  const [statusFilter,setStatusFilter] = useState("active");
  const [detail,setDetail] = useState(null);
  const [editor,setEditor] = useState(null);
  const [assignment,setAssignment] = useState(null);
  const [toast,setToast] = useState("");
  const [error,setError] = useState("");

  useEffect(()=>{
    if(isDemoMode) return;
    let alive=true;
    async function setUser(user){
      if(!user){if(alive){setProfile(null);setLoading(false);}return;}
      try{const found=await getProfile(user.id);if(alive)setProfile(found);}catch(authError){if(alive)setError(`No fue posible cargar el perfil: ${authError.message}`);}finally{if(alive)setLoading(false);}
    }
    supabase.auth.getSession().then(({data})=>setUser(data.session?.user));
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user));
    return ()=>{alive=false;listener.subscription.unsubscribe();};
  },[]);

  const refresh = useCallback(async()=>{
    if(!profile)return;
    try{
      const [nextOrders,nextCouriers,nextEvents]=await Promise.all([listOrders(profile),listCouriers(),listEvents(profile)]);
      setOrders(nextOrders);setCouriers(nextCouriers);setEvents(nextEvents);setError("");
    }catch(loadError){setError(`No se pudieron sincronizar los datos: ${loadError.message}`);}
  },[profile]);

  useEffect(()=>{refresh();const unsubscribe=subscribeToOrders(()=>refresh());return unsubscribe;},[refresh]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),4500);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{if(page==="new"){setEditor(false);setPage("orders");}},[page]);

  const filtered = useMemo(()=>orders.filter(order=>{
    const term=search.trim().toLowerCase();
    const haystack=`${order.order_number} ${order.customer_name} ${order.customer_phone} ${order.delivery_zone} ${(order.items||[]).map(item=>item.name).join(" ")}`.toLowerCase();
    return (branchFilter==="all"||order.branch_id===branchFilter)&&(!term||haystack.includes(term));
  }),[orders,search,branchFilter]);

  async function handleSaveOrder(values){
    try{await saveOrder(values,profile);setEditor(null);setDetail(null);await refresh();setToast(values.id?"Pedido actualizado y registrado en la trazabilidad.":"Pedido creado correctamente.");return true;}
    catch(saveError){setError(`No se pudo guardar: ${saveError.message}`);return false;}
  }
  async function handleTransition(order,action){
    try{await transitionOrder(order.id,action,profile);setDetail(null);await refresh();setToast("Movimiento registrado correctamente.");}
    catch(moveError){setError(`No se pudo realizar el movimiento: ${moveError.message}`);}
  }
  async function handleAssign(values){
    const saved=await handleSaveOrder(values);if(saved){setAssignment(null);setToast("Domiciliario asignado; la sede ya puede verlo.");}
  }
  async function handleCourier(values){try{await saveCourier(values);await refresh();setToast("Domiciliario guardado.");}catch(courierError){setError(`No se pudo guardar: ${courierError.message}`);}}
  async function logout(){await signOut();setProfile(null);setOrders([]);setPage("orders");}

  if(loading) return <div className="loading"><span>♛</span><p>Cargando operación…</p></div>;
  if(!profile) return <Login onDemoLogin={setProfile}/>;
  const effectiveOrders=page==="ready"
    ? filtered.filter(order=>order.status==="ready")
    : page==="history"
      ? filtered.filter(order=>["dispatched","delivered","cancelled"].includes(order.status))
      : filtered.filter(order=>statusFilter==="all"||(statusFilter==="active"?["preparing","ready","dispatched"].includes(order.status):order.status===statusFilter));
  return <div className={`app-shell ${profile.role==="cashier"?"cashier-shell":"admin-shell"}`}><Sidebar profile={profile} page={page} setPage={setPage} onLogout={logout}/><main className="main"><Header profile={profile} onLogout={logout}/>{error&&<div className="error-banner"><span>{error}</span><button onClick={()=>setError("")}>×</button></div>}
    {page==="orders"||page==="ready"||page==="history"?<><Summary orders={orders}/><section className="orders-section"><div className="section-title"><div><p className="eyebrow">{profile.role==="admin"?"TODAS LAS SEDES":"COLA EN TIEMPO REAL"}</p><h2>{page==="history"?"Historial":page==="ready"?"Pendientes por despacho":"Pedidos"} <span>{effectiveOrders.length}</span></h2></div>{profile.role==="admin"&&<button className="primary" onClick={()=>setEditor(false)}>+ Nuevo pedido</button>}</div><div className="filters"><label className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pedido, cliente o producto"/></label>{profile.role==="admin"&&<select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="all">Todas las sedes</option>{BRANCHES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}{page==="orders"&&<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="active">Activos</option><option value="all">Todos los estados</option>{Object.entries(STATUS).map(([value,item])=><option key={value} value={value}>{item.label}</option>)}</select>}</div>{profile.role==="cashier"?<CashierOrders orders={effectiveOrders} couriers={couriers} onOpen={setDetail} onTransition={handleTransition}/>:<OrdersTable orders={effectiveOrders} couriers={couriers} profile={profile} onOpen={setDetail} onEdit={setEditor} onAssign={setAssignment} onTransition={handleTransition}/>}</section></>:null}
    {page==="couriers"&&profile.role==="admin"&&<CourierManager couriers={couriers} onSave={handleCourier}/>} {page==="audit"&&profile.role==="admin"&&<AuditLog events={events} orders={orders} couriers={couriers}/>}<footer><span>Polaris Studio · Grupo Almacenes El Rey</span><span>{isDemoMode?"Modo demostración":"Datos protegidos y sincronizados"}</span></footer></main>
    {detail&&<OrderDetail order={orders.find(item=>item.id===detail.id)||detail} couriers={couriers} profile={profile} onClose={()=>setDetail(null)} onEdit={order=>{setDetail(null);setEditor(order);}} onAssign={order=>{setDetail(null);setAssignment(order);}} onTransition={handleTransition}/>} {editor!==null&&<OrderEditor order={editor||null} onClose={()=>setEditor(null)} onSave={handleSaveOrder}/>} {assignment&&<AssignmentModal order={assignment} couriers={couriers} onClose={()=>setAssignment(null)} onSave={handleAssign}/>} {toast&&<div className="toast">✓ {toast}</div>}
  </div>;
}

export default App;
