-- An uploaded receipt or "I already paid" must not trigger another request to pay.
begin;
do $patch$
declare definition text; marker text; replacement text;
begin
 definition:=pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure);
 marker:=$old$       elsif s->>'payment_method'='transfer' then
        select * into qr$old$;
 replacement:=$new$       elsif s->>'payment_method'='transfer' and (s->>'stage'='review' or (intent='handoff' and p_decision#>>'{actions,0,reason}'='payment_review')) then
        body:=case when s->>'stage'='review' then 'Tu comprobante está pendiente de revisión. No hagas otra transferencia mientras confirmamos el pago.' else 'Para revisar el pago, adjunta el comprobante por este chat. No repitas la transferencia mientras lo verificamos.' end;
       elsif s->>'payment_method'='transfer' then
        select * into qr$new$;
 if position(marker in definition)=0 then raise exception 'No coincide la versión del consumidor de compras'; end if;
 execute replace(definition,marker,replacement);
end;
$patch$;
commit;
