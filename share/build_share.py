"""Build the friends' edition (share/index.html) from the personal app (index.html).

Everything personal to the owner is removed or replaced:
  - Drive file IDs and calendars come from each friend's own setup (window.GLEAN_CFG via __setCfg)
  - names, workplaces and ministries in the AI instructions become the friend's own name and role
  - the bridge asks for the friend's own server link and password, with a first-time welcome screen
Run:  python3 share/build_share.py
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'index.html')).read()

# ------------------------------------------------------------------ 1. the bridge (first <script>)
i = src.index('<script>') + len('<script>')
j = src.index('</script>', i)
shim = src[i:j]

def sub(old, new, s, count=1):
    assert s.count(old) == count, (s.count(old), old[:90])
    return s.replace(old, new)

a = shim.index('  const CK="glean-conn";')
b = shim.index('  /* ---------- install as an app (phone app only) ---------- */')
conn_block = r'''  const CK="glean-conn";
  let conn={};try{conn=JSON.parse(localStorage.getItem(CK)||"{}")||{}}catch(e){conn={}}
  const saveConn=c=>{try{localStorage.setItem(CK,JSON.stringify(c))}catch(e){}};
  const errOf=msg=>{msg=String(msg||"");const m=msg.match(/\[(\w+)\]\s*(.*)/);return {code:m?m[1]:"tool_error",message:m?m[2]:msg}};
  async function post(url,pass,fn,args){
    let r;try{r=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({pass,fn,args}),redirect:"follow"})}
    catch(e){throw {code:"offline",message:"Can't reach your Gleanings server. Check your signal and the server link."}}
    let j;try{j=await r.json()}catch(e){throw {code:"tool_error",message:"Your Gleanings server didn't answer properly. Check the server link and that it is deployed for Anyone."}}
    if(!j.ok)throw errOf(j.error);return j.result;
  }
  const call=(url,pass,fn,args)=>inGAS?new Promise((res,rej)=>{google.script.run.withSuccessHandler(res).withFailureHandler(e=>rej(errOf(e&&e.message||e))).rpc(pass||"",fn,JSON.stringify(args))}):post(url,pass,fn,args);
  let gateOpen;const gate=new Promise(r=>gateOpen=r); /* the app's own calls wait until this device is connected and signed in */
  const GS0=(fn,...args)=>{
    const p=(inGAS||conn.url)?call(conn.url,conn.pass,fn,args):Promise.reject({code:"unauthorized",message:"Not connected yet"});
    return p.catch(e=>{if(e&&e.code==="unauthorized")screen(inGAS||conn.url?"password":"link",e.message);throw e});
  };
  const GS=async(fn,...args)=>{await gate;return GS0(fn,...args)};
  window.GLEAN_STANDALONE=true;window.GLEAN_FRIEND=true;
  window.GLEAN_CONN={mode:inGAS?"google":"phone",connected:inGAS||!!conn.url,forget:()=>{saveConn({});location.reload()}};
  window.ME=()=>{const c=window.GLEAN_CFG||{};return (c.name||"The user")+(c.role?" ("+c.role+")":"")};

  /* ---------- welcome, sign-in and connect screens ---------- */
  let open=null;
  function screen(mode,why){
    if(open===mode)return;open=mode;
    const go=()=>{
      const old=document.getElementById("connect");if(old)old.remove();
      const d=document.createElement("div");d.id="connect";d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");
      d.style.cssText="position:fixed;inset:0;z-index:99;background:#17213A;color:#F4F1E8;display:flex;align-items:center;justify-content:center;padding:20px;font:16px/1.5 system-ui,-apple-system,sans-serif;overflow:auto";
      const box=document.createElement("div");box.style.cssText="width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px;margin:auto";
      const el=(t,txt,css)=>{const e=document.createElement(t);if(txt)e.textContent=txt;if(css)e.style.cssText=css;return e};
      const field=(lab,type,val,ph,hint)=>{const l=el("label","", "display:flex;flex-direction:column;gap:6px;font-weight:600");l.append(lab);const i=document.createElement("input");i.type=type;i.value=val||"";i.placeholder=ph||"";i.autocomplete="off";i.style.cssText="font:16px system-ui;padding:12px;border-radius:12px;border:1px solid #5a6582;background:#0f1729;color:#fff";l.append(i);if(hint)l.append(el("span",hint,"font-weight:400;font-size:.82rem;opacity:.75"));return [l,i]};
      const msg=el("p",why&&why!=="Not connected yet"?why:"","margin:0;color:#F5B69A;min-height:1.2em");
      const btn=(t)=>{const b=el("button",t,"font:700 16px system-ui;padding:14px;border-radius:999px;border:0;background:#C99A3D;color:#1b1407;cursor:pointer");b.type="button";return b};
      const busy=(b,on,t)=>{b.disabled=on;b.textContent=t};
      const linkRx=/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/;
      if(mode==="link"){
        box.append(el("h2","Connect Gleanings","margin:0;font-size:1.5rem"),el("p","Paste the link of YOUR OWN Gleanings server, the Web app URL from your Apps Script deployment. It stays only on this device.","margin:0;opacity:.85"));
        const [lu,iu]=field("Your server link (ends in /exec)","url",conn.url,"script.google.com/macros/s/…/exec");
        const b=btn("Next");b.onclick=async()=>{const u=(iu.value||"").trim();if(!linkRx.test(u)){msg.textContent="That link should look like https: script.google.com/macros/s/…/exec";return}
          busy(b,true,"Checking…");try{await post(u,"","getConfig",[]);saveConn({url:u});location.reload()}catch(e){msg.textContent=e.message||"That didn't work.";busy(b,false,"Next")}};
        box.append(lu,msg,b);
      }else if(mode==="notready"){
        box.append(el("h2","One step left","margin:0;font-size:1.5rem"),el("p","Your Gleanings server is installed but not set up yet. In the script editor choose firstSetup and press Run, then open this again.","margin:0;opacity:.85"));
        const b=btn("I ran firstSetup");b.onclick=()=>location.reload();box.append(b);
      }else if(mode==="welcome"){
        box.append(el("h2","Welcome to Gleanings","margin:0;font-size:1.5rem"),el("p","Let's make this yours. Your notes are kept in your own Google account; nobody else can see them.","margin:0;opacity:.85"));
        const [lc,ic]=field("Setup code","text","","XXXX-XXXX","From the Execution log after you ran firstSetup.");
        const [ln,inn]=field("Your first name","text","","e.g. David");
        const [lr,ir]=field("What you do (optional)","text","","e.g. pastor, chaplain, teacher","Helps the AI understand your notes.");
        const [lp,ip]=field("Choose a password","password","","At least 8 characters");
        const [lq,iq]=field("Type it again","password","","");
        const b=btn("Set up my Gleanings");
        b.onclick=async()=>{const p1=ip.value,p2=iq.value;
          if(!ic.value.trim()){msg.textContent="Enter the setup code";return}
          if(p1.length<8){msg.textContent="Choose a password of at least 8 characters";return}
          if(p1!==p2){msg.textContent="The two passwords don't match";return}
          busy(b,true,"Setting up…");
          try{await call(conn.url,"","completeSetup",[ic.value,inn.value,p1,ir.value]);saveConn({url:conn.url,pass:p1});location.reload()}
          catch(e){msg.textContent=e.message||"That didn't work.";busy(b,false,"Set up my Gleanings")}};
        box.append(lc,ln,lr,lp,lq,msg,b,el("p","Write your password down somewhere safe. If you forget it, run resetPassword in the script editor; your notes are kept.","margin:0;font-size:.82rem;opacity:.75"));
      }else{
        box.append(el("h2","Sign in to Gleanings","margin:0;font-size:1.5rem"),el("p","Enter the password you chose. It is remembered on this device.","margin:0;opacity:.85"));
        const [lp,ip]=field("Password","password","","");
        const b=btn("Sign in");
        b.onclick=async()=>{busy(b,true,"Checking…");try{await call(conn.url,ip.value,"getStatus",[]);saveConn({url:conn.url,pass:ip.value});location.reload()}catch(e){msg.textContent=e.message||"That didn't work.";busy(b,false,"Sign in")}};
        box.append(lp,msg,b);
        if(!inGAS){const ch=el("button","Use a different server link","background:none;border:0;color:#F4F1E8;opacity:.7;text-decoration:underline;cursor:pointer;font:14px system-ui");ch.type="button";ch.onclick=()=>{saveConn({});location.reload()};box.append(ch)}
      }
      d.append(box);document.body.append(d);const f=d.querySelector("input");if(f)f.focus();
    };
    if(document.body)go();else document.addEventListener("DOMContentLoaded",go);
  }

'''
shim = shim[:a] + conn_block + shim[b:]

# the app waits until this device is connected and the friend's own setup is loaded
shim = sub('''  const caps={sample,mcp,db,user,assets};
  window.claude={use:async name=>caps[name]||null};''', '''  const boot=(async()=>{
    if(!inGAS&&!conn.url){screen("link","");return new Promise(()=>{})}
    let st;try{st=JSON.parse(await call(conn.url,"","getConfig",[]))}catch(e){screen(inGAS?"notready":"link",e.message);return new Promise(()=>{})}
    if(!st.provisioned){screen("notready","");return new Promise(()=>{})}
    if(!st.setup){screen("welcome","");return new Promise(()=>{})}
    if(!conn.pass){screen("password","");return new Promise(()=>{})}
    let cfg,status;
    try{cfg=JSON.parse(await GS0("getConfigFull"));status=JSON.parse(await GS0("getStatus"))}catch(e){return new Promise(()=>{})}
    window.GLEAN_CFG=cfg;window.GLEAN_NAME=cfg.name||"";
    if(window.__setCfg)window.__setCfg(cfg);
    const ai=!!(status.hasKey||status.hasAnthropicKey||status.hasGeminiKey);
    gateOpen();
    return {sample:ai?sample:null,mcp,db,user,assets};
  })();
  window.claude={use:async name=>{const caps=await boot;return caps[name]||null}};''', shim)
shim = sub('    setKey:k=>GS("setKey",k),', '    setKey:k=>GS("setKey",k).then(r=>{setTimeout(()=>location.reload(),900);return r}),', shim)
shim = sub('    setGeminiKey:k=>GS("setGeminiKey",k),', '    setGeminiKey:k=>GS("setGeminiKey",k).then(r=>{setTimeout(()=>location.reload(),900);return r}),\n    changePassword:(o,n)=>GS("changePassword",o,n).then(r=>{saveConn({url:conn.url,pass:n});return r}),', shim)
shim = shim.replace("/* Gleanings standalone bridge:", "/* Gleanings (friends edition) bridge:")
out = src[:i] + shim + src[j:]

# ------------------------------------------------------------------ 2. the app: IDs come from the friend's setup
ids = {
    'const MEET_ID="1dofChVxlfmptch3nTNmLCvd1XlGG4iI5_ti011r4LhE"': 'let MEET_ID=""',
    'const FOLDER_ID="1oF6rBZZ8EDYIuCu8p8VBlkRFZd4NorC5"': 'let FOLDER_ID=""',
    'const GLEAN_ID="1EC02ubL2DXM0aU_jw3XvegoKR7i-3DP6"': 'let GLEAN_ID=""',
    'const RES_ID="17BXbfYBF1-WthLPx2Nuinf3YK-dW-leE"': 'let RES_ID=""',
    'const INBOX_ID="1dTpLGy85EGRXqU0Ah0cKut61RHbS8XoBnEN1wdqQYkg"': 'let INBOX_ID=""',
    'const CAL_ID="1LbdmaJ_Aw5nt4yMbqUIRNE_20jG3N8BQsPAlEYCo040"': 'let CAL_ID=""',
    'const USED_LOG="1ChPzNJJtyDK8esQ55rLHIc1dnel1MX0wWlS8g9rOXBQ"': 'let USED_LOG=""',
    'const MR_ID="1l7EhAi71cTuzUCteFTlroQUZS9LuzqCBwS5bbLxwe-c"': 'let MR_ID=""',
    'const STUDY_DOC="1sIyNIzzkHdzMLeH28-Cv0L0nTvA4iZSJvXUoSISyOTI",STUDY_DOC_URL=': 'let STUDY_DOC="",STUDY_DOC_URL=',
}
for k, v in ids.items():
    out = sub(k, v, out)
out = re.sub(r'const MR_TABS=\{[^;]*\};', 'let MR_TABS={};', out, count=1)
out = re.sub(r'const SCHED_CALS=\[.*?\]\];', 'let SCHED_CALS=[["primary","My calendar"]];', out, count=1, flags=re.S)
out = sub('listCal("santoshsarah09@gmail.com",from,to,{fullText:"Follow up"})', 'listCal("primary",from,to,{fullText:"Follow up"})', out)
out = out.replace("his Master Resources vault", "their Master Resources vault").replace("his own saved notes", "their own saved notes").replace("his notes is this same", "their notes is this same")
out = sub('if(!st.hasKey)setTimeout(openSettings,1200)}', '}', out)  # AI is optional for friends: don't push Settings
out = sub('async function loadWeek(){', 'async function loadWeek(){if(!CAL_ID)return;', out)
# one setter the bridge calls once the friend's own setup is loaded
out = sub('let MR_TABS={};', '''let MR_TABS={};
window.__setCfg=c=>{MEET_ID=c.meet||"";FOLDER_ID=GLEAN_ID=RES_ID=c.folder||"";INBOX_ID=c.inbox||"";USED_LOG=c.usedLog||"";MR_ID=c.mr||"";MR_TABS=c.mrTabs||{};
  STUDY_DOC=c.study||"";STUDY_DOC_URL="https:"+String.fromCharCode(47,47)+"docs.google.com/document/d/"+STUDY_DOC+"/edit";CAL_ID=c.preachCal||"";
  IN_FOLDERS="(parentId = '"+FOLDER_ID+"')";
  const g=document.getElementById("greet");if(g&&c.name)g.textContent=g.textContent.replace(/[,!].*$/,"")+", "+c.name;};
''', out)
out = sub('init();\nmaybeTour();', 'if(window.GLEAN_CFG)window.__setCfg(window.GLEAN_CFG); /* setup arrived before the app finished loading */\ninit();\nmaybeTour();', out)
out = sub("const IN_FOLDERS=`(parentId = '${FOLDER_ID}' or parentId = '${GLEAN_ID}' or parentId = '${RES_ID}')`", "let IN_FOLDERS=\"\"", out)

# ------------------------------------------------------------------ 3. personal wording -> the friend's own
out = sub('+", Santosh";', '+(window.GLEAN_NAME?", "+window.GLEAN_NAME:"");', out)
out = re.sub(r'Dr\. Santosh Sharma \([^)]*\)', '${ME()}', out)
out = out.replace("Dr. Santosh Sharma's Gleanings app. He is a hospital chaplain, pastor, teacher and author.", "${ME()}'s Gleanings app.")
out = out.replace('Dr. Santosh Sharma', '${ME()}').replace('Pastor Santosh Sharma', '${ME()}')
out = out.replace('Dr. Sharma (Santosh, "I", "Pastor", "Chaplain")', 'the user ("I", "me")')
out = out.replace("Search Santosh's Google Drive", "Search the user's Google Drive").replace("Santosh captured", "the user captured").replace("List Santosh's follow-ups", "List the user's follow-ups")
out = out.replace('|santosh|', '|').replace('(santosh|me|i|pastor|chaplain)', '(me|i|myself)')
out = re.sub(r'chaplaincy words \(chaplain, spiritual care, palliative, hospice, ICU, NICU, rounds, Avera, McKennan, Sioux Falls\), his people and sources \([^)]*\), his ministries and projects \([^)]*\), and Nepali words he may say',
             'chaplaincy words (chaplain, spiritual care, palliative, hospice, ICU, NICU, rounds), leadership authors (John C. Maxwell), and Nepali words they may say', out)
out = out.replace('placeholder="e.g. AGC board meeting, Leadership SD session 3"', 'placeholder="e.g. board meeting, staff meeting"')
out = out.replace('"It shows up in the Sunday panel that week, and the sermon writer is told to build it in."', '"It shows up in the Sunday panel that week."')
out = out.replace('(window.GLEAN_URL||"https://claude.ai/artifact/FbQzRgNbNwBv1njarcMsFJ")', '(window.GLEAN_URL||"")')
# the owner's personal 81-day study plan is not part of the friends' edition
out = re.sub(r'\n  <button type="button" class="card st-card" data-open="fb">.*?</button>', '', out, count=1)
out = out.replace('<title>Gleanings</title>', '<title>Gleanings</title>', 1)

left = [w for w in ['Santosh', 'Sharma', 'Avera', 'McKennan', 'Awakening', 'AGC', 'santoshsarah09@', 'Sioux', 'claude.ai/artifact'] if w in out]
open(os.path.join(ROOT, 'share', 'index.html'), 'w').write(out)
print('built share/index.html', len(out), 'leftover personal words:', left)

# ------------------------------------------------------------------ 4. install files for the friends' phone app (its own scope /share/)
import shutil, json
for f in ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'sw.js']:
    shutil.copy(os.path.join(ROOT, f), os.path.join(ROOT, 'share', f))
m = json.load(open(os.path.join(ROOT, 'manifest.webmanifest')))
m['description'] = 'Capture stories, illustrations, quotes, meetings and follow-ups. Your notes stay in your own Google account.'
json.dump(m, open(os.path.join(ROOT, 'share', 'manifest.webmanifest'), 'w'), indent=2)
print('copied install files to share/')
