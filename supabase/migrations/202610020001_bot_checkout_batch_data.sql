begin;

-- The same missing-data form is used for catalogue carts and items confirmed
-- by an operator. It never reads a profile or copies data from another order.
create or replace function public.bot_checkout_data_prompt(p_state jsonb, p_follow_up boolean default false)
returns text language plpgsql immutable set search_path='' as $$
declare missing text[]:=array[]::text[]; delivery boolean:=p_state->>'fulfillment_type'='delivery';
begin
 if nullif(trim(p_state->>'fulfillment_type'),'') is null then
  return '¿Lo prefieres a domicilio o lo recoges en la sede?';
 end if;
 if delivery and nullif(trim(p_state->>'customer_name'),'') is null and nullif(trim(p_state->>'recipient_name'),'') is null then
  missing:=array_append(missing,'Nombre para la compra y de quien recibe (si es la misma persona, basta un nombre)');
 else
  if nullif(trim(p_state->>'customer_name'),'') is null then missing:=array_append(missing,'Nombre para la compra');end if;
  if delivery and nullif(trim(p_state->>'recipient_name'),'') is null then missing:=array_append(missing,'Nombre de quien recibe');end if;
 end if;
 if delivery then
  if nullif(trim(p_state->>'recipient_phone'),'') is null then missing:=array_append(missing,'Número de contacto');end if;
  if nullif(trim(p_state->>'delivery_address'),'') is null then missing:=array_append(missing,'Dirección completa (incluye apartamento o indicaciones, si aplica)');end if;
  if nullif(trim(p_state->>'delivery_zone'),'') is null then missing:=array_append(missing,'Barrio o sector');end if;
 end if;
 if cardinality(missing)=0 then return null;end if;
 return case when coalesce(p_follow_up,false) then 'Solo me falta:'
  when delivery then 'Para coordinar el domicilio, envíame estos datos juntos:'
  else 'Para la recogida, envíame:' end
  ||E'\n• '||array_to_string(missing,E'\n• ')
  ||case when cardinality(missing)>1 then E'\n\nPuedes enviarlos en un solo mensaje, como te quede más fácil.' else '' end;
end; $$;
revoke all on function public.bot_checkout_data_prompt(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.bot_checkout_data_prompt(jsonb,boolean) to service_role;

do $patch$
declare def text; marker text; replacement text;
begin
 def:=pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure);
 marker:=$old$    if nullif(s->>'fulfillment_type','') is null then body:=body||'¿Lo prefieres a domicilio o lo recoges en la sede?';
    elsif nullif(s->>'customer_name','') is null then body:=body||'¿A nombre de quién hacemos la compra?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'delivery_address','') is null then body:=body||'¿Cuál es la dirección de entrega?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'delivery_zone','') is null then body:=body||'¿En qué barrio o sector queda?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'recipient_name','') is null then body:=body||'¿Quién recibe el pedido?';
    elsif s->>'fulfillment_type'='delivery' and nullif(s->>'recipient_phone','') is null then body:=body||'¿Cuál es el teléfono de quien recibe?';$old$;
 replacement:=$new$    if public.bot_checkout_data_prompt(s,old_s->>'fulfillment_type'=s->>'fulfillment_type') is not null then
     body:=body||public.bot_checkout_data_prompt(s,old_s->>'fulfillment_type'=s->>'fulfillment_type');$new$;
 if position(marker in def)=0 then raise exception 'Consumidor comercial incompatible: captura de selección';end if;
 def:=replace(def,marker,replacement);
 marker:=$old$if cardinality(missing)>0 then body:='Para continuar con tu compra, cuéntame '||array_to_string(missing,', ')||'.';$old$;
 replacement:=$new$if cardinality(missing)>0 then body:=public.bot_checkout_data_prompt(s,old_s->>'fulfillment_type'=s->>'fulfillment_type');$new$;
 if position(marker in def)=0 then raise exception 'Consumidor comercial incompatible: captura de carrito';end if;
 execute replace(def,marker,replacement);
end; $patch$;

commit;
