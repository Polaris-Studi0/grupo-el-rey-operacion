import { BRANCHES } from "./constants.js";

const ORDERS_KEY = "el-rey-platform-orders-v1";
const EVENTS_KEY = "el-rey-platform-events-v1";
const COURIERS_KEY = "el-rey-platform-couriers-v1";

const now = Date.now();
const minutesAgo = minutes => new Date(now - minutes * 60_000).toISOString();

const initialCouriers = [
  { id: "c1", name: "Carlos Ramírez", plate: "KDP 42F", phone: "300 555 0142", provider: "Independiente", active: true },
  { id: "c2", name: "Juan Esteban López", plate: "DWL 73G", phone: "301 555 0188", provider: "inDrive", active: true },
  { id: "c3", name: "Mateo Gómez", plate: "FZX 19H", phone: "302 555 0164", provider: "DiDi Entregas", active: true }
];

const initialOrders = [
  { id:"o1", order_number:"REY-1048", branch_id:"b1", fulfillment_type:"delivery", status:"preparing", customer_name:"Laura Martínez", customer_phone:"300 000 4821", delivery_address:"Calle 82 # 85-20, portería", delivery_zone:"Robledo", items:[{qty:1,name:"Juego de ollas Royal 7 piezas",unit_price:189900},{qty:1,name:"Set de cucharones x6",unit_price:24900}], total:214800, payment_method:"transfer", source:"WhatsApp", customer_notes:"Entregar en portería. Confirmar por WhatsApp al llegar.", internal_notes:"Pago verificado.", courier_id:null, eta_minutes:null, promised_at:null, created_at:minutesAgo(32), updated_at:minutesAgo(32), ready_at:null, dispatched_at:null, delivered_at:null },
  { id:"o2", order_number:"REY-1047", branch_id:"b2", fulfillment_type:"delivery", status:"ready", customer_name:"Andrés Restrepo", customer_phone:"301 000 1074", delivery_address:"Carrera 65 # 52-14", delivery_zone:"Bello", items:[{qty:1,name:"Licuadora Samurai 2 litros",unit_price:149900},{qty:1,name:"Set de vasos x6",unit_price:29900}], total:179800, payment_method:"transfer", source:"WhatsApp", customer_notes:"Llamar al llegar.", internal_notes:"Pedido verificado y empacado.", courier_id:"c1", eta_minutes:12, promised_at:new Date(now + 12*60_000).toISOString(), created_at:minutesAgo(48), updated_at:minutesAgo(8), ready_at:minutesAgo(20), dispatched_at:null, delivered_at:null },
  { id:"o3", order_number:"REY-1046", branch_id:"b3", fulfillment_type:"delivery", status:"preparing", customer_name:"Camila Pérez", customer_phone:"302 000 6380", delivery_address:"Carrera 48 # 89-10", delivery_zone:"Aranjuez", items:[{qty:2,name:"Set de organizadores x4",unit_price:34900},{qty:1,name:"Ganchos multiuso x12",unit_price:15900},{qty:1,name:"Canasta rectangular mediana",unit_price:27000}], total:112700, payment_method:"transfer", source:"Instagram", customer_notes:"", internal_notes:"Los dos sets deben ser del mismo color.", courier_id:null, eta_minutes:null, promised_at:null, created_at:minutesAgo(73), updated_at:minutesAgo(73), ready_at:null, dispatched_at:null, delivered_at:null },
  { id:"o4", order_number:"REY-1045", branch_id:"b7", fulfillment_type:"delivery", status:"ready", customer_name:"Natalia Gómez", customer_phone:"304 000 2146", delivery_address:"Circular 3 # 70-22", delivery_zone:"Laureles", items:[{qty:1,name:"Freidora de aire 4,5 litros",unit_price:279000},{qty:1,name:"Papel para freidora x100",unit_price:19900}], total:298900, payment_method:"addi", source:"WhatsApp", customer_notes:"", internal_notes:"Crédito aprobado. Pedido listo en caja.", courier_id:null, eta_minutes:null, promised_at:null, created_at:minutesAgo(116), updated_at:minutesAgo(26), ready_at:minutesAgo(26), dispatched_at:null, delivered_at:null },
  { id:"o5", order_number:"REY-1044", branch_id:"b9", fulfillment_type:"delivery", status:"dispatched", customer_name:"Julián Sánchez", customer_phone:"305 000 9012", delivery_address:"Calle 72 # 46-18", delivery_zone:"Manrique", items:[{qty:1,name:"Ventilador de pedestal 16 pulgadas",unit_price:139900},{qty:1,name:"Extensión eléctrica 3 metros",unit_price:19900}], total:159800, payment_method:"sistecredito", source:"WhatsApp", customer_notes:"", internal_notes:"Entregado completo al domiciliario.", courier_id:"c3", eta_minutes:18, promised_at:minutesAgo(-4), created_at:minutesAgo(152), updated_at:minutesAgo(61), ready_at:minutesAgo(98), dispatched_at:minutesAgo(61), delivered_at:null },
  { id:"o6", order_number:"REY-1043", branch_id:"b6", fulfillment_type:"pickup", status:"ready", customer_name:"María Elena Ruiz", customer_phone:"300 000 5598", delivery_address:"", delivery_zone:"", items:[{qty:1,name:"Vajilla Corona 4 puestos",unit_price:139900},{qty:1,name:"Cubiertos 24 piezas",unit_price:48900},{qty:1,name:"Jarra de vidrio 1,5 litros",unit_price:29900}], total:218700, payment_method:"cash_prepaid", source:"Llamada", customer_notes:"Recoge la titular.", internal_notes:"Proteger la vajilla con material adicional.", courier_id:null, eta_minutes:null, promised_at:new Date(now + 45*60_000).toISOString(), created_at:minutesAgo(177), updated_at:minutesAgo(15), ready_at:minutesAgo(15), dispatched_at:null, delivered_at:null }
];

function read(key, fallback){
  const saved = localStorage.getItem(key);
  if (saved) return JSON.parse(saved);
  localStorage.setItem(key, JSON.stringify(fallback));
  return structuredClone(fallback);
}
function write(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
function withRelations(order, couriers){
  return { ...order, branch: BRANCHES.find(item => item.id === order.branch_id), courier: couriers.find(item => item.id === order.courier_id) || null };
}
function addEvent(orderId, action, before, after, actor){
  const events = read(EVENTS_KEY, []);
  events.unshift({ id: crypto.randomUUID(), order_id: orderId, action, before_data:before, after_data:after, created_at:new Date().toISOString(), actor_name:actor?.full_name || "Sistema", actor_role:actor?.role || "system" });
  write(EVENTS_KEY, events);
}

export const demoStore = {
  reset(){
    write(ORDERS_KEY, initialOrders); write(COURIERS_KEY, initialCouriers); write(EVENTS_KEY, []);
  },
  async listOrders(profile){
    const couriers = read(COURIERS_KEY, initialCouriers);
    return read(ORDERS_KEY, initialOrders)
      .filter(order => profile.role === "admin" || order.branch_id === profile.branch_id)
      .map(order => withRelations(order, couriers))
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  },
  async listCouriers(){ return read(COURIERS_KEY, initialCouriers); },
  async listEvents(profile){
    const allowed = new Set((await this.listOrders(profile)).map(order => order.id));
    return read(EVENTS_KEY, []).filter(event => allowed.has(event.order_id));
  },
  async saveOrder(values, profile){
    const orders = read(ORDERS_KEY, initialOrders);
    const index = orders.findIndex(order => order.id === values.id);
    const timestamp = new Date().toISOString();
    if(index === -1){
      const nextNumber = Math.max(1000,...orders.map(item=>Number(item.order_number?.replace(/\D/g,""))||0))+1;
      const order = { ...values, id:crypto.randomUUID(), order_number:`REY-${String(nextNumber).padStart(4,"0")}`, created_at:timestamp, updated_at:timestamp, created_by:profile.id, updated_by:profile.id };
      orders.unshift(order); write(ORDERS_KEY, orders); addEvent(order.id,"created",null,order,profile); return order;
    }
    const before = structuredClone(orders[index]);
    orders[index] = { ...orders[index], ...values, updated_at:timestamp, updated_by:profile.id };
    const action = before.courier_id !== orders[index].courier_id ? "courier_assigned" : before.status !== orders[index].status ? "status_changed" : "updated";
    write(ORDERS_KEY, orders); addEvent(values.id,action,before,orders[index],profile); return orders[index];
  },
  async transition(orderId, action, profile){
    const orders = read(ORDERS_KEY, initialOrders);
    const index = orders.findIndex(order => order.id === orderId);
    if(index < 0) throw new Error("Pedido no encontrado");
    const before = structuredClone(orders[index]);
    const timestamp = new Date().toISOString();
    if(action === "ready" && before.status === "preparing") orders[index] = {...before,status:"ready",ready_at:timestamp};
    else if(action === "dispatch" && before.status === "ready" && before.fulfillment_type === "delivery" && before.courier_id) orders[index] = {...before,status:"dispatched",dispatched_at:timestamp};
    else if(action === "pickup" && before.status === "ready" && before.fulfillment_type === "pickup") orders[index] = {...before,status:"delivered",delivered_at:timestamp};
    else if(action === "delivered" && profile.role === "admin" && before.status === "dispatched") orders[index] = {...before,status:"delivered",delivered_at:timestamp};
    else throw new Error("Ese movimiento no está permitido en el estado actual");
    orders[index].updated_at = timestamp; orders[index].updated_by = profile.id;
    write(ORDERS_KEY, orders); addEvent(orderId,action,before,orders[index],profile); return orders[index];
  },
  async saveCourier(values){
    const couriers = read(COURIERS_KEY, initialCouriers);
    const index = couriers.findIndex(item => item.id === values.id);
    if(index < 0) couriers.unshift({...values,id:crypto.randomUUID()}); else couriers[index] = {...couriers[index],...values};
    write(COURIERS_KEY,couriers); return couriers;
  }
};
