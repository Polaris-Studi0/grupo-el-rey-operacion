begin;
-- General lines explicitly confirmed by Samuel on 03/10. This is not a stock,
-- price, brand or promotion record and does not certify stock at every branch.
insert into public.branch_knowledge(id,branch_id,category,title,content,source_file_name)
values('58b54750-c012-4ae0-a890-2febce5eaa1c',null,'general','Líneas de productos de Almacenes El Rey',
 E'En Almacenes El Rey vendemos productos para el hogar, aseo, cosméticos, electrodomésticos, belleza y juguetería.\nEstas son las líneas generales del negocio. La disponibilidad de una referencia, marca, presentación, precio o promoción en una sede debe verificarse en el catálogo vigente o con el equipo; esta información no certifica existencias.',
 'Información confirmada por Samuel, 03/10/2026');

do $patch$
declare definition text; before_fragment text;
begin
 definition:=pg_get_functiondef('public.next_public_bot_task(text)'::regprocedure);
 before_fragment:=$old$where ct.phone_e164=p_owner_phone and m.direction='inbound' and m.sender_type='customer' and m.created_at>now()-interval '23 hours'$old$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar recuperación pública antes de cambiar ventana del responsable';end if;
 execute replace(definition,before_fragment,replace(before_fragment,'''23 hours''','''23 hours 55 minutes'''));

 definition:=pg_get_functiondef('public.prepare_whatsapp_order_notification(uuid,text)'::regprocedure);
 before_fragment:=$old$where ct.phone_e164=p_admin_phone and m.direction='inbound' and m.sender_type='customer' and m.created_at>now()-interval '23 hours'$old$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar ventana del aviso de pedido';end if;
 execute replace(definition,before_fragment,replace(before_fragment,'''23 hours''','''23 hours 55 minutes'''));

 definition:=pg_get_functiondef('public.claim_outbound_whatsapp_message(uuid,uuid)'::regprocedure);
 before_fragment:=$old$  select coalesce(nullif(ltrim(phone_e164,'+'),''),nullif(trim(whatsapp_id),'')) into recipient$old$;
 if position(before_fragment in definition)=0 then raise exception 'Revisar claim antes de agregar ventana del responsable';end if;
 execute replace(definition,before_fragment,$new$  if target.raw_payload->>'internal_notification'='true' and target.message_type<>'template' and not exists(
   select 1 from public.whatsapp_messages m join public.whatsapp_conversations owner_chat on owner_chat.id=m.conversation_id
   where owner_chat.contact_id=c.contact_id and m.direction='inbound' and m.sender_type='customer' and m.created_at>now()-interval '23 hours 55 minutes'
  ) then return jsonb_build_object('send',false,'state','deferred','reason','owner_reply_window_expired');end if;
  select coalesce(nullif(ltrim(phone_e164,'+'),''),nullif(trim(whatsapp_id),'')) into recipient$new$);
end;$patch$;
notify pgrst,'reload schema';
commit;
