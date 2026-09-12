// Builds a reviewable update from a freshly exported workflow; never deploys it.
import {readFile,writeFile} from 'node:fs/promises';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Provide input and output workflow JSON paths');
const workflow=JSON.parse(await readFile(input,'utf8'));
const read=name=>readFile(new URL('../n8n/commercial/'+name,import.meta.url),'utf8');
const information=(await read('information.js')).replace('export function','function');
const normalize=(await read('normalize.js')).replace(/^import .*information.js';\n/m,'').replace('export function','function');
const node=name=>{const n=workflow.nodes.find(n=>n.name===name);if(!n)throw Error('Missing '+name);return n;};
node('Normalizar decisión').parameters.jsCode=information+'\n'+normalize+"\nreturn {json:normalizeDecision($('Cargar contexto comercial').item.json,$json)};";
const conditional=node('¿Respuesta ya calculada?').parameters.conditions.conditions[0];
conditional.leftValue='={{ (() => { '+information+'; return $json.cached_response != null || resolveStoreInformation($json) !== null; })() }}';
node('Reutilizar decisión guardada').parameters.jsCode=information+'\nreturn {json:{...$json,ai:$json.cached_response ?? resolveStoreInformation($json)}};';
node('Asistente comercial controlado').parameters.options.systemMessage=await read('prompt.txt');
const model=workflow.nodes.find(n=>n.type.endsWith('.lmChatOpenAi'));
if(model?.parameters.builtInTools && !Object.keys(model.parameters.builtInTools).length)delete model.parameters.builtInTools;
workflow.pinData={};
await writeFile(output,JSON.stringify(workflow,null,2));
console.log('Prepared',workflow.nodes.length,'nodes; cached decisions take priority; information bypasses AI.');
