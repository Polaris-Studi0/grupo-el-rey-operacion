import { isDemoMode, supabase } from "./supabase.js";
import { demoStore } from "./demoStore.js";

const orderSelect = "*, branch:branches(id,name), courier:couriers(id,name,plate,phone,provider,active)";

export async function signIn(email, password){
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if(error) throw error;
  return data;
}
export async function signOut(){ if(!isDemoMode) await supabase.auth.signOut(); }
export async function getProfile(userId){
  const { data, error } = await supabase.from("profiles").select("*, branch:branches(id,name)").eq("id",userId).single();
  if(error) throw error; return data;
}
export async function listOrders(profile){
  if(isDemoMode) return demoStore.listOrders(profile);
  const { data, error } = await supabase.from("orders").select(orderSelect).order("created_at",{ascending:false});
  if(error) throw error; return data;
}
export async function listCouriers(){
  if(isDemoMode) return demoStore.listCouriers();
  const { data, error } = await supabase.from("couriers").select("*").order("active",{ascending:false}).order("name");
  if(error) throw error; return data;
}
export async function listStaff(profile){
  if(isDemoMode) return demoStore.listStaff(profile);
  const { data, error } = await supabase.from("staff_members").select("*, branch:branches(id,name)").order("active",{ascending:false}).order("full_name");
  if(error) throw error; return data;
}
export async function listEvents(profile){
  if(isDemoMode) return demoStore.listEvents(profile);
  const { data, error } = await supabase.from("order_events").select("*, order:orders(order_number,branch_id)").order("created_at",{ascending:false}).limit(500);
  if(error) throw error; return data;
}
export async function saveOrder(values, profile){
  if(isDemoMode) return demoStore.saveOrder(values,profile);
  const payload = {...values};
  ["id","branch","courier","order_number","created_at","updated_at","created_by","updated_by","version"].forEach(key=>delete payload[key]);
  if(values.id){
    let query = supabase.from("orders").update(payload).eq("id",values.id);
    if(Number.isInteger(values.version)) query = query.eq("version",values.version);
    const { data, error } = await query.select(orderSelect).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error("El pedido cambió en otra sesión. Actualiza la lista e inténtalo de nuevo.");
    return data;
  }
  const { data, error } = await supabase.from("orders").insert(payload).select(orderSelect).single();
  if(error) throw error; return data;
}
export async function transitionOrder(orderId, action, profile, staffId=null){
  if(isDemoMode) return demoStore.transition(orderId,action,profile,staffId);
  const { data, error } = await supabase.rpc("transition_order",{p_order_id:orderId,p_action:action,p_staff_id:staffId});
  if(error) throw error; return data;
}
export async function saveStaff(values){
  if(isDemoMode) return demoStore.saveStaff(values);
  const payload = {...values}; delete payload.id; delete payload.branch; delete payload.created_at; delete payload.updated_at; delete payload.created_by;
  const query = values.id ? supabase.from("staff_members").update(payload).eq("id",values.id) : supabase.from("staff_members").insert(payload);
  const { data, error } = await query.select("*, branch:branches(id,name)").single(); if(error) throw error; return data;
}
export async function uploadPaymentReceipt(order,file,profile){
  if(!file) throw new Error("Selecciona un comprobante.");
  if(file.size>5*1024*1024) throw new Error("El comprobante debe pesar máximo 5 MB.");
  const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
  if(!allowed.includes(file.type)) throw new Error("Usa una imagen JPG, PNG, WEBP o un PDF.");
  if(isDemoMode) return demoStore.attachReceipt(order,file,profile);
  const extension=(file.name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"").toLowerCase();
  const path=`${order.branch_id}/${order.id}/${crypto.randomUUID()}.${extension}`;
  const { error:uploadError }=await supabase.storage.from("payment-receipts").upload(path,file,{contentType:file.type,upsert:false});
  if(uploadError) throw uploadError;
  const { data,error }=await supabase.rpc("attach_payment_receipt",{p_order_id:order.id,p_path:path,p_name:file.name,p_mime_type:file.type,p_size:file.size});
  if(error) throw error; return data;
}
export async function getPaymentReceiptUrl(path){
  if(isDemoMode) return demoStore.getReceiptUrl(path);
  const {data,error}=await supabase.storage.from("payment-receipts").createSignedUrl(path,300);
  if(error) throw error; return data.signedUrl;
}
export async function saveCourier(values){
  if(isDemoMode) return demoStore.saveCourier(values);
  const payload = {...values}; delete payload.id; delete payload.created_at; delete payload.updated_at;
  const query = values.id ? supabase.from("couriers").update(payload).eq("id",values.id) : supabase.from("couriers").insert(payload);
  const { data, error } = await query.select().single(); if(error) throw error; return data;
}
export function subscribeToOrders(onChange){
  if(isDemoMode) return () => {};
  const channel = supabase.channel("orders-live").on("postgres_changes",{event:"*",schema:"public",table:"orders"},onChange).subscribe();
  return () => supabase.removeChannel(channel);
}
