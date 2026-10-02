// Auth callbacks must return immediately; profile requests run in a later task.
export function observeAuthProfile({auth,loadProfile,onState,timeoutMs=15000}){
  let alive=true,revision=0,eventSeen=false,currentUser=null,timer=null,controller=null;
  function cancel(){clearTimeout(timer);controller?.abort();controller=null;}
  function schedule(user){
    currentUser=user;const request=++revision;cancel();
    if(!user){onState({profile:null,loading:false,error:'',user:null});return;}
    onState({profile:null,loading:true,error:'',user});
    timer=setTimeout(async()=>{
      if(!alive||request!==revision)return;
      const active=new AbortController();controller=active;
      let deadline;
      try{
        const timeout=new Promise((_,reject)=>{deadline=setTimeout(()=>{reject(new Error('La conexión tardó demasiado. Vuelve a intentarlo.'));active.abort();},timeoutMs);});
        const profile=await Promise.race([loadProfile(user.id,active.signal),timeout]);
        if(!profile?.active)throw new Error('Tu usuario no está activo. Comunícate con administración.');
        if(alive&&request===revision)onState({profile,loading:false,error:'',user});
      }catch(error){
        if(alive&&request===revision)onState({profile:null,loading:false,error:`No pudimos cargar tu acceso. ${error.message||'Vuelve a intentarlo.'}`,user});
      }finally{clearTimeout(deadline);if(controller===active)controller=null;}
    },0);
  }
  const {data:{subscription}}=auth.onAuthStateChange((_event,session)=>{
    if(!alive)return;eventSeen=true;schedule(session?.user||null);
  });
  auth.getSession().then(({data,error})=>{
    if(!alive||eventSeen)return;
    if(error)throw error;
    schedule(data.session?.user||null);
  }).catch(()=>{if(alive&&!eventSeen)onState({profile:null,loading:false,error:'No pudimos recuperar tu sesión. Intenta ingresar de nuevo.',user:null});});
  return {
    retry(){if(alive)schedule(currentUser);},
    stop(){alive=false;revision++;cancel();subscription.unsubscribe();}
  };
}
