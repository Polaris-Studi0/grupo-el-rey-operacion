begin;
-- Mention the selected item once, then ask only for the next missing detail.
do $patch$
declare def text; marker text; replacement text;
begin
 def:=pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure);
 marker:=$old$    body:='Claro, '||(item->>'quantity')||' '||(item->>'name')||case when nullif(item->>'variant','') is not null then ' ('||(item->>'variant')||')' else '' end||', a '||public.bot_money((item->>'unit_price_cop')::bigint)||' cada uno. ';$old$;
 replacement:=$new$    body:=case when item is distinct from old_s->'pending_selection' then
     'De acuerdo: '||(item->>'quantity')||' '||(item->>'name')||case when nullif(item->>'variant','') is not null then ' ('||(item->>'variant')||')' else '' end||', a '||public.bot_money((item->>'unit_price_cop')::bigint)||' cada uno. '
     when nullif(patch->>'customer_name','') is not null and patch->>'customer_name' is distinct from old_s->>'customer_name' then 'Gracias, '||(s->>'customer_name')||'. '
     else '' end;$new$;
 if position(marker in def)=0 then raise exception 'Consumidor comercial no compatible';end if;
 execute replace(def,marker,replacement);
end; $patch$;
commit;
