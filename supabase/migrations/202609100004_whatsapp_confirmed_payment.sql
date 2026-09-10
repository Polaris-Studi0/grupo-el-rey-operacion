-- A resolved, scoped payment task can be approved with the operator's "Confirmo".
-- Retain existing rejection, task type, cart, branch, delivery and amount guards.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.persist_whatsapp_commercial_response(uuid,uuid,jsonb,jsonb)'::regprocedure);
  if position('task.resolution->>''approved''=''true''' in definition)=0 then raise exception 'Unexpected approval guard'; end if;
  execute replace(definition,'task.resolution->>''approved''=''true''',
    '(task.resolution->>''approved''=''true'' or lower(trim(task.resolution->>''answer'')) in (''confirmo'',''confirmado'',''confirmada''))');
  definition:=pg_get_functiondef('public.link_verified_whatsapp_receipt(uuid)'::regprocedure);
  if position('t.resolution->>''approved''=''true''' in definition)=0 then raise exception 'Unexpected receipt guard'; end if;
  execute replace(definition,'t.resolution->>''approved''=''true''',
    '(t.resolution->>''approved''=''true'' or lower(trim(t.resolution->>''answer'')) in (''confirmo'',''confirmado'',''confirmada''))');
end;
$$;
