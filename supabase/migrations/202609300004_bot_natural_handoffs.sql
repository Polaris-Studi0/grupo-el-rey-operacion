begin;
do $patch$
declare def text;
begin
 def:=pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure);
 def:=replace(def,' Puedes consultar el estado del pedido por este chat. Aún no tenemos una hora de entrega confirmada.',' Puedes consultar el estado y el tiempo estimado de tu pedido por este chat.');
 def:=replace(def,'Necesito confirmar las existencias y el precio de esta compra antes de continuar con el pago. Si ya pagaste, conservaremos tu comprobante para revisarlo.','Dame un momento y te confirmo la disponibilidad y el precio. Si ya pagaste, conservamos tu comprobante para revisarlo.');
 def:=replace(def,'El QR de esta sede necesita revisión antes de que puedas pagar. Voy a consultar ese dato.','Dame un momento y te confirmo el medio de pago de esta sede.');
 execute def;
end; $patch$;
commit;
