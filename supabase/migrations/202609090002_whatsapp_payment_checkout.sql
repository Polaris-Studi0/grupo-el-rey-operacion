-- Keep payment approval vocabulary aligned with the deterministic normalizer.
-- Alter only the approval expression and the post-insert customer confirmation.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.persist_whatsapp_commercial_response(uuid,uuid,jsonb,jsonb)'::regprocedure);
  if position('verificada|válido' in definition)=0 then raise exception 'Unexpected payment guard'; end if;
  definition := replace(definition,'verificada|válido','verificada|validado|validada|válido');
  execute definition;
  definition := pg_get_functiondef('public.persist_whatsapp_ai_response(uuid,uuid,jsonb,jsonb)'::regprocedure);
  if position('outbound_body := trim(coalesce(outbound_body,' in definition)=0 then raise exception 'Unexpected order acknowledgement'; end if;
  definition := replace(definition,
    $old$outbound_body := trim(coalesce(outbound_body,''))||E'\nNúmero de pedido: '||order_row.order_number||'.';$old$,
    $new$outbound_body := 'Tu pedido '||order_row.order_number||' quedó registrado correctamente. Total: COP '||order_row.total||'. La sede continuará con su preparación.';$new$);
  execute definition;
end;
$migration$;
