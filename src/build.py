import os,re
d=os.path.dirname(os.path.abspath(__file__))
app=open(os.path.join(d,'..','idea-capture.html')).read()
shim=open(os.path.join(d,'shim.js')).read()
head='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#14213D"></head><body>
<script>'''+shim+'''</script>
<script>
if(!(window.google&&google.script)&&/github\.io$/.test(location.hostname)){document.addEventListener("DOMContentLoaded",function(){
  var d=document.createElement("div");d.setAttribute("role","alert");
  d.style.cssText="position:fixed;inset:0;z-index:99;background:rgba(10,14,28,.92);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font:16px/1.5 system-ui,sans-serif";
  d.innerHTML='<div style="max-width:420px"><h2 style="margin:0 0 10px;font-size:1.4rem">Open Gleanings from your Google link</h2><p style="margin:0 0 10px">This GitHub page is only where the app\'s code is kept. Here it cannot reach your Drive, Calendar or AI key, and notes would stay on this device only.</p><p style="margin:0">Open your Apps Script web app link instead: script.google.com &rarr; Gleanings &rarr; Deploy &rarr; Manage deployments &rarr; the Web app URL ending in <b>/exec</b>. Add that one to your home screen.</p></div>';
  document.body.appendChild(d)})}
</script>
'''
open(os.path.join(d,'index.html'),'w').write(head+app+'\n</body></html>\n')
print('built',len(head+app))
