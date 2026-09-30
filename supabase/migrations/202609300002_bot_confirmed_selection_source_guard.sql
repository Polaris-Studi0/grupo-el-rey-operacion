begin;
-- A resolved task without an answer cannot prove a name or price.
do $patch$
declare def text; marker text;
begin
 def:=pg_get_functiondef('public.bot_confirmed_selection(uuid,jsonb)'::regprocedure);
 marker:='if t.id is null or nullif(excerpt,';
 if position(marker in def)=0 then raise exception 'Validador de selección no compatible';end if;
 execute replace(def,marker,'if t.id is null or nullif(trim(t.resolution->>''answer''),'''') is null or nullif(excerpt,');
end; $patch$;
commit;
