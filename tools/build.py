#!/usr/bin/env python3
"""Deploy-time cache busting. Usage: python3 tools/build.py "note"
 - new build id (ms) -> version.json {v,note}
 - every local .js/.css/.json/.png reference in the pages and root .js modules gets ?v=<build> (idempotent)
 - each page gets <meta name=eear-v>, Cache-Control no-cache metas and updater.js (first script)."""
import re,sys,os,time,json,glob
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));os.chdir(R)
V=str(int(time.time()*1000));note=sys.argv[1] if len(sys.argv)>1 else ''
SKIP={'version.json','sw.js'}
PAT=re.compile(r"""(?<=['"(=])(\./)?([\w][\w./-]*\.(?:js|css|json|png))(\?v=\d+)?(?=['"\s)>])""")
def fix(txt):
  def sub(m):
    p=m.group(2)
    if p in SKIP or p.startswith('audio/') or not os.path.isfile(p):return m.group(0)
    return (m.group(1) or '')+p+'?v='+V
  return PAT.sub(sub,txt)
HEAD='<meta name=eear-v content=%s><meta http-equiv=Cache-Control content=no-cache><meta http-equiv=Pragma content=no-cache><script src=updater.js?v=%s></script>'%(V,V)
for f in ['index.html','quest.html','gm.html','figures.html','dj.html','ghost.html','stats.html','dj-help.html','tour.html']:
  s=open(f).read()
  s=re.sub(r'<meta name=eear-v content=\d+><meta http-equiv=Cache-Control content=no-cache><meta http-equiv=Pragma content=no-cache><script src=updater\.js\?v=\d+></script>','',s)
  s=fix(s)
  m=re.search(r'<meta charset=[^>]*>',s);i=m.end() if m else s.find('<head>')+6;s=s[:i]+HEAD+s[i:]
  open(f,'w').write(s)
for f in glob.glob('*.js'):
  if f in ('sw.js','updater.js') or f.endswith('.min.js'):continue
  s=open(f).read();t=fix(s)
  if t!=s:open(f,'w').write(t)
json.dump({'v':V,'note':note},open('version.json','w'))
print(V)
