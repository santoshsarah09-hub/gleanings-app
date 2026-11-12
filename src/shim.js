/* Gleanings standalone bridge: gives the app the same window.claude.use(...) it had inside Claude,
   but backed by your own Google Apps Script server and your own Anthropic API key. */
(function(){
  const inGAS=!!(window.google&&google.script&&google.script.run);
  const onPages=/github\.io$/.test(location.hostname);
  if(!inGAS&&!onPages){return} /* plain local preview: nothing to connect to */
  /* how this device reaches your Google script: inside the Google link it uses your sign-in;
     as the phone app (GitHub Pages) it uses your server link + private passcode, kept only on this device */
  const CK="glean-conn";
  let conn={};try{conn=JSON.parse(localStorage.getItem(CK)||"{}")||{}}catch(e){conn={}}
  const saveConn=c=>{try{localStorage.setItem(CK,JSON.stringify(c))}catch(e){}};
  const errOf=msg=>{msg=String(msg||"");const m=msg.match(/\[(\w+)\]\s*(.*)/);return {code:m?m[1]:"tool_error",message:m?m[2]:msg}};
  async function post(url,pass,fn,args){
    let r;try{r=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({pass,fn,args}),redirect:"follow"})}
    catch(e){throw {code:"offline",message:"Can't reach your Google script. Check your signal and try again."}}
    let j;try{j=await r.json()}catch(e){throw {code:"tool_error",message:"Your Google script didn't answer properly. Check the server link."}}
    if(!j.ok)throw errOf(j.error);return j.result;
  }
  const GS=(fn,...args)=>{
    const p=inGAS?new Promise((res,rej)=>{const r=google.script.run.withSuccessHandler(res).withFailureHandler(e=>rej(errOf(e&&e.message||e)));
        if(typeof r.rpc==="function")r.rpc(conn.pass||"",fn,JSON.stringify(args));else r[fn](...args)}) /* older server without rpc: call directly until Code.gs is updated */
      :(conn.url?post(conn.url,conn.pass,fn,args):Promise.reject({code:"unauthorized",message:"Not connected yet"}));
    return p.catch(e=>{if(e&&e.code==="unauthorized")showConnect(e.message);throw e});
  };
  window.GLEAN_STANDALONE=true;
  window.GLEAN_CONN={mode:inGAS?"google":"phone",connected:inGAS||!!conn.url,forget:()=>{saveConn({});location.reload()}};

  /* ---------- connect screen (phone app) ---------- */
  let shown=false;
  function showConnect(why){
    if(shown)return;shown=true;
    const go=()=>{
      const d=document.createElement("div");d.id="connect";d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");d.setAttribute("aria-label","Connect Gleanings");
      d.style.cssText="position:fixed;inset:0;z-index:99;background:#17213A;color:#F4F1E8;display:flex;align-items:center;justify-content:center;padding:20px;font:16px/1.5 system-ui,-apple-system,sans-serif;overflow:auto";
      const box=document.createElement("div");box.style.cssText="width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px";
      const h=document.createElement("h2");h.textContent=inGAS?"Enter your phone passcode":"Connect Gleanings";h.style.cssText="margin:0;font-size:1.5rem";
      const p1=document.createElement("p");p1.style.margin="0";p1.style.opacity=".85";
      p1.textContent=inGAS?"Google didn't confirm your sign-in here, so the app needs your passcode.":"This phone app talks to your own Google script. Enter its link and your private passcode once; they stay only on this device.";
      const mk=(lab,type,val,ph)=>{const l=document.createElement("label");l.style.cssText="display:flex;flex-direction:column;gap:6px;font-weight:600";l.textContent=lab;const i=document.createElement("input");i.type=type;i.value=val||"";i.placeholder=ph;i.autocomplete="off";i.style.cssText="font:16px system-ui;padding:12px;border-radius:12px;border:1px solid #5a6582;background:#0f1729;color:#fff";l.append(i);return [l,i]};
      const [lu,iu]=mk("Server link (ends in /exec)","url",conn.url,"https:"+String.fromCharCode(47,47)+"script.google.com/macros/s/…/exec");
      const [lp,ip]=mk("Passcode","password",conn.pass,"word-word-word-word-1234-xxxx");
      const msg=document.createElement("p");msg.style.cssText="margin:0;color:#F5B69A;min-height:1.2em";msg.textContent=why&&why!=="Not connected yet"?why:"";
      const b=document.createElement("button");b.type="button";b.textContent="Connect";b.style.cssText="font:700 16px system-ui;padding:14px;border-radius:999px;border:0;background:#C99A3D;color:#1b1407;cursor:pointer";
      const help=document.createElement("p");help.style.cssText="margin:0;font-size:.85rem;opacity:.75";
      help.textContent="Server link: script.google.com → Gleanings → Deploy → Manage deployments → the phone-app deployment's Web app URL. Passcode: run makePasscode in the script editor and copy it from the Execution log.";
      b.onclick=async()=>{const c={url:(iu.value||"").trim(),pass:(ip.value||"").trim()};
        if(!inGAS&&!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(c.url)){msg.textContent="That link should look like script.google.com/macros/s/…/exec";return}
        if(!c.pass){msg.textContent="Enter your passcode";return}
        b.disabled=true;b.textContent="Checking…";msg.textContent="";
        try{if(inGAS){saveConn({pass:c.pass});location.reload();return}
          await post(c.url,c.pass,"getStatus",[]);saveConn(c);location.reload()}
        catch(e){msg.textContent=e.message||"That didn't work.";b.disabled=false;b.textContent="Connect"}};
      box.append(h,p1);if(!inGAS)box.append(lu);box.append(lp,msg,b,help);d.append(box);document.body.append(d);(inGAS?ip:(conn.url?ip:iu)).focus();
    };
    if(document.body)go();else document.addEventListener("DOMContentLoaded",go);
  }
  if(onPages&&!conn.url)showConnect("");

  /* ---------- install as an app (phone app only) ---------- */
  if(onPages){
    const head=document.head||document.getElementsByTagName("head")[0];
    [["manifest","manifest.webmanifest"],["apple-touch-icon","apple-touch-icon.png"],["icon","icon-192.png"]].forEach(([rel,href])=>{const l=document.createElement("link");l.rel=rel;l.href=href;head.appendChild(l)});
    [["apple-mobile-web-app-capable","yes"],["mobile-web-app-capable","yes"],["apple-mobile-web-app-title","Gleanings"],["apple-mobile-web-app-status-bar-style","black-translucent"]].forEach(([n,c])=>{const m=document.createElement("meta");m.name=n;m.content=c;head.appendChild(m)});
    if("serviceWorker" in navigator)window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").catch(()=>{})});
  }
  const b64=blob=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(blob)});

  /* ---------- AI ---------- */
  function toMessages(input){
    if(typeof input==="string")return [{role:"user",content:input}];
    return input.map(m=>({role:m.role,content:m.content}));
  }
  async function withImages(msgs,images){
    if(!images||!images.length)return msgs;
    const last=msgs[msgs.length-1];const parts=[];
    for(const im of images){parts.push({type:"image",source:{type:"base64",media_type:im.type||"image/jpeg",data:await b64(im)}})}
    parts.push({type:"text",text:typeof last.content==="string"?last.content:JSON.stringify(last.content)});
    return [...msgs.slice(0,-1),{role:"user",content:parts}];
  }
  const textOf=c=>(c||[]).filter(x=>x.type==="text").map(x=>x.text).join("");
  async function sample(input,opts){
    opts=opts||{};
    let messages=await withImages(toMessages(input),opts.images);
    const tools=(opts.tools||[]).map(t=>({name:t.name,description:t.description||"",input_schema:t.inputSchema||{type:"object",properties:{}}}));
    let all="";
    for(let round=0;round<10;round++){
      if(opts.signal&&opts.signal.aborted)throw {code:"cancelled",message:"Stopped",text:all};
      const out=JSON.parse(await GS("aiCall",JSON.stringify({tier:opts.modelTier||"default",messages,tools,max_tokens:opts.maxTokens||4096})));
      const txt=textOf(out.content);
      if(txt){all=(all?all+"\n\n":"")+txt;if(opts.onText)opts.onText({text:all,delta:txt})}
      if(out.stop_reason!=="tool_use")return {text:all,truncated:out.stop_reason==="max_tokens"};
      const results=[];
      for(const b of out.content.filter(x=>x.type==="tool_use")){
        const t=(opts.tools||[]).find(x=>x.name===b.name);
        let content,is_error=false;
        try{content=JSON.stringify(t?await t.execute(b.input||{}):{error:"unknown tool"}).slice(0,60000)}catch(e){content=String(e&&e.message||e);is_error=true}
        results.push({type:"tool_result",tool_use_id:b.id,content,is_error});
      }
      messages=[...messages,{role:"assistant",content:out.content},{role:"user",content:results}];
    }
    return {text:all,truncated:true};
  }
  sample.json=async(input,opts)=>{
    const add="\n\nReply with the JSON only: no explanation, no code fences.";
    const inp=typeof input==="string"?input+add:[...input.slice(0,-1),{role:"user",content:input[input.length-1].content+add}];
    const r=await sample(inp,opts);
    const t=String(r.text||"").replace(/^```(?:json)?\s*|\s*```$/g,"").trim();
    try{return JSON.parse(t)}catch(e){}
    const s=t.search(/[\[{]/),e2=Math.max(t.lastIndexOf("}"),t.lastIndexOf("]"));
    if(s>=0&&e2>s){try{return JSON.parse(t.slice(s,e2+1))}catch(e){}}
    throw {code:"bad_json",message:"The AI answer was not valid JSON",text:t};
  };
  sample.limits=async()=>({images:{maxCount:5}});

  /* ---------- Drive, Docs, Calendar ---------- */
  const mcp={callTool:async(server,tool,input)=>({payload:JSON.parse(await GS("mcpCall",server,tool,JSON.stringify(input||{})))})};

  /* ---------- notes store ---------- */
  let cache=null;const subs=[];
  const snap=()=>({docs:(cache||[]).map(n=>({id:n.id,data:()=>{const {id,...r}=n;return r}})),metadata:{fromCache:false}});
  const emit=()=>subs.forEach(f=>{try{f(snap())}catch(e){}});
  async function refresh(){try{cache=JSON.parse(await GS("dbList"));emit()}catch(e){}}
  const col={
    add:async n=>{const id=await GS("dbAdd",JSON.stringify(n));cache=[...(cache||[]),{...n,id}];emit();return {id}},
    doc:id=>({
      set:async n=>{cache=[...(cache||[]).filter(x=>x.id!==id),{...n,id}];emit();await GS("dbSet",id,JSON.stringify(n))},
      update:async p=>{cache=(cache||[]).map(x=>x.id===id?{...x,...p}:x);emit();await GS("dbUpdate",id,JSON.stringify(p))},
      delete:async()=>{cache=(cache||[]).filter(x=>x.id!==id);emit();await GS("dbDelete",id)}
    }),
    onSnapshot:(cb,err)=>{subs.push(cb);if(cache)cb(snap());else refresh().catch(err);return ()=>{}}
  };
  setInterval(()=>{if(document.visibilityState==="visible")refresh()},90000);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refresh()});
  const db={collection:()=>col};
  const user={id:async()=>"me",isOwner:()=>true,canEdit:()=>true};

  /* ---------- photos ---------- */
  const assets={
    upload:async(blob,o)=>JSON.parse(await GS("assetUpload",await b64(blob),(o&&o.type)||blob.type||"image/jpeg","page-"+Date.now()+".jpg")),
    delete:async id=>GS("assetDelete",id),
    list:async()=>({assets:[],usage:{}})
  };

  const caps={sample,mcp,db,user,assets};
  window.claude={use:async name=>caps[name]||null};
  const PIX="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const blobs={},loading={};
  window.GLEAN_BLOB=id=>{
    if(inGAS)return "https:"+String.fromCharCode(47,47)+"drive.google.com/thumbnail?sz=w1600&id="+id;
    if(blobs[id])return blobs[id];
    if(!loading[id]){loading[id]=GS("assetGet",id).then(r=>{const j=JSON.parse(r);blobs[id]="data:"+j.type+";base64,"+j.b64;
      document.querySelectorAll("img").forEach(im=>{if(im.src===PIX+"#"+id)im.src=blobs[id]})}).catch(()=>{})}
    return PIX+"#"+id;
  };

  /* ---------- settings: API key, usage, import ---------- */
  window.GLEAN_SETTINGS={
    status:async()=>JSON.parse(await GS("getStatus")),
    setKey:k=>GS("setKey",k),
    clearKey:()=>GS("clearKey"),
    setGeminiKey:k=>GS("setGeminiKey",k),
    clearGeminiKey:()=>GS("clearGeminiKey"),
    setProvider:p=>GS("setProvider",p),
    importNotes:arr=>GS("dbImport",JSON.stringify(arr)).then(n=>{refresh();return n})
  };
})();
