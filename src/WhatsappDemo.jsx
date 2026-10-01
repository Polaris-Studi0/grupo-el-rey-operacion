import {useEffect,useState} from 'react';
import {uploadBotImage,whatsappDemoRequest} from './lib/api.js';
const labels={sending:'Envío en proceso · no repetir',sent:'Aceptado por WhatsApp',delivered:'Entregado',read:'Leído',failed:'No enviado',uncertain:'Por verificar · no repetir'};
export default function WhatsappDemo(){
 const [phone,setPhone]=useState(''),[file,setFile]=useState(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[attempt,setAttempt]=useState(null),[sends,setSends]=useState([]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>{let active=true;const refresh=()=>whatsappDemoRequest().then(r=>{if(active)setSends(r.sends);}).catch(()=>{});refresh();const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer);};},[]);
 function changed(){setAttempt(null);setResult(null);setError('');}
 async function send(e){e.preventDefault();if(!file||busy)return;setBusy(true);setError('');let next=attempt;
  try{
   if(!next){const asset=await uploadBotImage({kind:'flyer',caption:'Imagen de demostración'},file);next={request_id:crypto.randomUUID(),asset_id:asset.id,phone};setAttempt(next);}
   const r=await whatsappDemoRequest(next);setResult(r.result);if(r.error)setError(r.error);
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <div className="chat-manager"><form className="panel knowledge-form" onSubmit={send}><h3>Demo de envío de imagen</h3><p>Escribe el número de un participante de la demostración y elige el flyer.</p><p className="form-note">Primero debe enviar un mensaje al <a href="https://wa.me/573147899116" target="_blank" rel="noreferrer">WhatsApp de El Rey</a>. Así se habilita el envío de la imagen durante 24 horas.</p>
 <label>Número de WhatsApp<input required type="tel" placeholder="312 345 6789" value={phone} disabled={busy} onChange={e=>{setPhone(e.target.value);changed();}}/></label>
 <label>Imagen del flyer<input required type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);changed();}}/></label><small>JPG o PNG, máximo 5 MB.</small>
 {preview&&<img className="campaign-flyer" src={preview} alt="Vista previa del flyer a enviar"/>}
 {error&&<p role="alert" className="operator-error">{error}</p>}{result&&<p role="status">{labels[result.status]||result.status} · {result.phone_e164}</p>}
 <button className="primary" disabled={busy||!file||!phone.trim()||!!result}>{busy?'Enviando…':'Enviar imagen'}</button>
 {result&&<button type="button" onClick={()=>{setResult(null);setAttempt(null);setError('');}}>Preparar otro envío</button>}
 </form><div className="panel"><h3>Últimos envíos del demo</h3>{!sends.length?<p>Aún no hay envíos.</p>:sends.map(s=><p key={s.id}><b>{s.phone_e164}</b><br/>{labels[s.status]}{s.error&&<small> · {s.error}</small>}</p>)}</div></div>;
}
