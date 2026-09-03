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
export async function transitionOrder(orderId, action, profile){
  if(isDemoMode) return demoStore.transition(orderId,action,profile);
  const { data, error } = await supabase.rpc("transition_order",{p_order_id:orderId,p_action:action});
  if(error) throw error; return data;
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
