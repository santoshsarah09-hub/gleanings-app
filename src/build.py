import os,re
d=os.path.dirname(os.path.abspath(__file__))
app=open(os.path.join(d,'..','idea-capture.html')).read()
shim=open(os.path.join(d,'shim.js')).read()
head='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#14213D"></head><body>
<script>'''+shim+'''</script>
'''
open(os.path.join(d,'index.html'),'w').write(head+app+'\n</body></html>\n')
print('built',len(head+app))
