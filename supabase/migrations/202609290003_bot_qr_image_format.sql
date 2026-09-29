-- Preserve existing QR assets, but only send PNG/JPEG as WhatsApp image messages.
begin;
do $patch$
declare definition text; marker text;
begin
 definition:=pg_get_functiondef('public.commit_bot_commerce_turn(uuid,uuid,integer,integer,jsonb,text,uuid)'::regprocedure);
 marker:='select * into qr from public.branch_payment_qrs where branch_id=c.branch_id and active for share;';
 if position(marker in definition)=0 then raise exception 'No coincide la versión del consumidor de QR'; end if;
 execute replace(definition,marker,'select * into qr from public.branch_payment_qrs where branch_id=c.branch_id and active and mime_type in (''image/jpeg'',''image/png'') for share;');
end;
$patch$;
commit;
