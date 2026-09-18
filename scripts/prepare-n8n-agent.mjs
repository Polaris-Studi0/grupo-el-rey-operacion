// Builds a separate reviewable candidate. Never publishes or changes credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export async function buildAgentWorkflow(input) {
  const workflow=structuredClone(input);
  const read=name=>readFile(new URL('../n8n/commercial/'+name,import.meta.url),'utf8');
  const names=workflow.nodes.map(n=>n.name);
  if(new Set(names).size!==names.length) throw Error('Duplicate nodes: export a clean workflow first');
  const node=name=>{const value=workflow.nodes.find(n=>n.name===name);if(!value)throw Error('Missing '+name);return value;};
  const info=(await read('information.js')).replace('export function','function');
  const normalize=(await read('normalize.js')).replace(/^import .*;\n/gm,'').replace('export function','function');
  const platform=(await read('platform-tools.js')).replace(/^import .*;\n/gm,'').replaceAll('export function','function');
  const bundle=info+'\n'+normalize+'\n'+platform;
  const schema=JSON.parse(await read('schema.json'));
  schema.properties.action.enum.push('present_quote');
  const agent=node('Asistente comercial controlado');
  agent.parameters.options={...agent.parameters.options,systemMessage:await read('agent-prompt.txt'),maxIterations:6,forceToolCallOnFirstIteration:true};
  // Keep the current turn and history visible; retrieve larger platform sections as tools.
  agent.parameters.text="={{ JSON.stringify(Object.fromEntries(['customer_message','current_sender_type','current_message_payload','current_message_created_at','message_type','inbound_message_id','branch_id','branch_name','preferred_name','recent_messages','sales_state','latest_order','pending_human_tasks'].map(k => [k,$json[k]]))) }}";
  node('Contrato de respuesta').parameters.inputSchema=JSON.stringify(schema);
  node('Normalizar decisión').parameters.jsCode=bundle+"\nreturn {json:normalizeDecision($('Cargar contexto comercial').item.json,$json,{agentMode:true})};";
  node('¿Respuesta ya calculada?').parameters.conditions.conditions[0].leftValue='={{ $json.cached_response !== null && $json.cached_response !== undefined }}';
  node('Reutilizar decisión guardada').parameters.jsCode='return {json:{...$json,ai:$json.cached_response}};';
  const tool=(id,name,description,inputSchema,call,position)=>({
    id,name,type:'@n8n/n8n-nodes-langchain.toolCode',typeVersion:1.3,position,
    parameters:{description,language:'javaScript',specifyInputSchema:true,schemaType:'manual',inputSchema:JSON.stringify(inputSchema),jsCode:bundle+'\nreturn JSON.stringify('+call+');'},
  });
  const tools=[
    tool('8b7e8e2a-5883-4e4b-b2a0-7bbb2519cbbb','consultar_plataforma','Consulta fuentes reales de esta conversación: sedes, información/ofertas, productos, compra, pedido o asistencia. No modifica ni envía nada.',
      {type:'object',additionalProperties:true,required:['resource'],properties:{resource:{type:'string',enum:['branches','knowledge','products','order','purchase','assistance']},branch_id:{type:['string','null']}}},
      "consultPlatform($('Cargar contexto comercial').item.json,query)",[800,500]),
    tool('39a1b1b4-5b03-4a49-9fa5-d55d0bfb25e1','preparar_gestion','Valida una propuesta de compra, cotización, asistencia, QR o registro. No ejecuta efectos. Devuelve la acción permitida y los datos verificados. La salida final del agente se vuelve a validar y se ejecuta una sola vez.',
      {...schema,additionalProperties:true,properties:{...schema.properties,branch_id:{type:['string','null']}}},"preparePlatformAction($('Cargar contexto comercial').item.json,query)",[1040,500]),
  ];
  for(const added of tools) {
    const index=workflow.nodes.findIndex(n=>n.name===added.name);
    if(index<0)workflow.nodes.push(added);else workflow.nodes[index]=added;
    workflow.connections[added.name]={ai_tool:[[{node:agent.name,type:'ai_tool',index:0}]]};
  }
  workflow.pinData={};
  return workflow;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [input,output]=process.argv.slice(2);
  if(!input||!output)throw Error('Provide fresh workflow export and output file paths');
  const result=await buildAgentWorkflow(JSON.parse(await readFile(input,'utf8')));
  await writeFile(output,JSON.stringify(result,null,2));
  console.log('Prepared agent candidate with',result.nodes.length,'nodes. Not deployed. Credentials preserved.');
}
