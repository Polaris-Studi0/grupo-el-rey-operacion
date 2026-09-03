export const BRANCHES = [
  { id: "b1", name: "Robledo Aures" },
  { id: "b2", name: "Robledo Diamante - Calle 80" },
  { id: "b3", name: "Santa Cruz" },
  { id: "b4", name: "San Gabriel, Itagüí" },
  { id: "b5", name: "Robledo Diamante - Diagonal 85" },
  { id: "b6", name: "Floresta" },
  { id: "b7", name: "La 80" },
  { id: "b8", name: "La Estrella" },
  { id: "b9", name: "Campo Valdez" },
  { id: "b10", name: "San Antonio de Prado" }
];

export const STATUS = {
  preparing: { label: "En preparación", tone: "blue" },
  ready: { label: "Pendiente por despacho", tone: "amber" },
  dispatched: { label: "Despachado", tone: "green" },
  delivered: { label: "Entregado", tone: "green" },
  cancelled: { label: "Cancelado", tone: "red" }
};

export const PAYMENT = {
  transfer: "Transferencia",
  addi: "Addi",
  sistecredito: "Sistecrédito",
  cash_prepaid: "Efectivo confirmado"
};

export const formatMoney = value => new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0
}).format(Number(value || 0));

export const formatDateTime = value => value
  ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Sin definir";
