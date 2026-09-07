-- El número administrador también se usa como cliente de pruebas. La restricción
-- de una sola conversación activa exige reutilizar su conversación; las alertas
-- internas se marcan en raw_payload y se excluyen del contexto del asistente.

do $$
declare
  current_definition text;
  patched_definition text;
begin
  select pg_get_functiondef('public.prepare_whatsapp_automation_message(uuid,uuid,text)'::regprocedure)
  into current_definition;
  patched_definition := replace(
    current_definition,
    'where contact_id=admin_contact.id and status<>''closed'' and source=''internal_admin'' order by created_at desc limit 1 for update;',
    'where contact_id=admin_contact.id and status<>''closed'' order by created_at desc limit 1 for update;'
  );
  if patched_definition=current_definition then
    raise exception 'No se encontró la consulta administrativa que debía corregirse';
  end if;
  execute patched_definition;
end;
$$;
