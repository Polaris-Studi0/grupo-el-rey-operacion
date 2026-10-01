const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const HISTORY_PAGE_SIZE=50;

// Retain PostgreSQL microseconds in the cursor; Date would silently drop them.
export function historyQuery(client,conversationId,{before=null,after=null}={}){
  if(!UUID.test(conversationId)||before&&after)throw new Error('Consulta de historial inválida.');
  const cursor=before||after;
  if(cursor&&(!UUID.test(cursor.id)||!TIMESTAMP.test(cursor.created_at)))throw new Error('Cursor de historial inválido.');
  let query=client.from('whatsapp_messages').select('id,conversation_id,direction,sender_type,message_type,body,media_id,raw_payload,delivery_status,failure_reason,created_at')
    .eq('conversation_id',conversationId);
  if(cursor){
    const op=before?'lt':'gt';
    query=query.or(`created_at.${op}.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.${op}.${cursor.id})`);
  }
  return query.order('created_at',{ascending:Boolean(after)}).order('id',{ascending:Boolean(after)}).limit(HISTORY_PAGE_SIZE+1);
}
export async function fetchConversationPage(client,conversationId,options={}){
  const {data,error}=await historyQuery(client,conversationId,options);
  if(error)throw error;
  const messages=data.slice(0,HISTORY_PAGE_SIZE);
  const ids=messages.map(message=>message.id);
  const files=ids.length?await client.from('whatsapp_attachments').select('*').in('message_id',ids):{data:[]};
  if(files.error)throw files.error;
  const edge=messages.at(-1);
  return {messages,attachments:files.data,hasMore:data.length>HISTORY_PAGE_SIZE,cursor:edge?{id:edge.id,created_at:edge.created_at}:null};
}
export function mergeHistory(existing,incoming){
  const messages=new Map(existing.map(message=>[message.id,message]));
  for(const message of incoming)messages.set(message.id,message);
  return [...messages.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
// A failed network response must reuse the same id and original version, even
// if a refresh has already observed the committed action on the server.
export function prepareOperatorRequest(previous,conversation,action,values){
  const intent=JSON.stringify([conversation.id,action,values]);
  if(previous?.intent===intent)return previous;
  return {intent,body:{...values,conversation_id:conversation.id,action,request_id:crypto.randomUUID(),expected_version:conversation.automation_control_version??0}};
}
