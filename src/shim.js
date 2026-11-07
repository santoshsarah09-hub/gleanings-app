/* Gleanings standalone bridge: gives the app the same window.claude.use(...) it had inside Claude,
   but backed by your own Google Apps Script server and your own Anthropic API key. */
(function(){
  if(!(window.google&&google.script&&google.script.run)){return} // not inside Apps Script (local preview)
  const GS=(fn,...args)=>new Promise((res,rej)=>{
    google.script.run.withSuccessHandler(res).withFailureHandler(e=>{
      const msg=String(e&&e.message||e||"");const m=msg.match(/\[(\w+)\]\s*(.*)/);
      rej({code:m?m[1]:"tool_error",message:m?m[2]:msg});
    })[fn](...args);
  });
  window.GLEAN_STANDALONE=true;
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
  window.GLEAN_BLOB=id=>"https://drive.google.com/thumbnail?sz=w1600&id="+id;

  /* ---------- settings: API key, usage, import ---------- */
  window.GLEAN_SETTINGS={
    status:async()=>JSON.parse(await GS("getStatus")),
    setKey:k=>GS("setKey",k),
    clearKey:()=>GS("clearKey"),
    importNotes:arr=>GS("dbImport",JSON.stringify(arr)).then(n=>{refresh();return n})
  };
})();
