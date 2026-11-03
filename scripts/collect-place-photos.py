"""Fetch free Wikipedia lead photographs and retain Commons attribution.

Only used when deliberately refreshing bundled demo media, never at app runtime.
"""
import concurrent.futures, html, json, re, time, threading, urllib.parse, urllib.request
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'apps/api/assets/photos/places'
OUT.mkdir(parents=True,exist_ok=True)
UA='Ourworld/0.1 (travel application demo photography; attribution bundled with assets)'
LOCK=threading.Lock()
LAST=[0.0]
def fetch(url):
    request=urllib.request.Request(url,headers={'User-Agent':UA})
    for attempt in range(5):
        try:
            with LOCK:
                time.sleep(max(0,1.15-(time.monotonic()-LAST[0]))); LAST[0]=time.monotonic()
            with urllib.request.urlopen(request,timeout=35) as response: return response.read()
        except Exception:
            if attempt==4: raise
            time.sleep(4*(attempt+1))
def api(host,**params):
    return json.loads(fetch('https://'+host+'/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',formatversion=2,**params))))
def plain(value): return html.unescape(re.sub('<[^>]+>','',value or '')).strip()
catalog=[]
for path,marker in [('apps/api/src/seed.ts','const CITIES:'),('apps/api/src/enriched-data.ts','const CITY_META:')]:
    text=(ROOT/path).read_text('utf-8');text=text[text.index(marker):];text=text[:text.index('\n];')]
    for slug,zh,en,country in re.findall(r"\['([^']+)','([^']*)','([^']*)','([^']*)',",text):
        catalog.append(dict(id='city-'+slug,kind='city',name=dict(zh=zh,en=en)))
titles={'new-york':'New York City','nice':'Nice','bath':'Bath, Somerset','victoria':'Victoria, British Columbia','washington':'Washington, D.C.','xian':"Xi'an",'singapore':'Singapore','sao-paulo':'São Paulo','rio-de-janeiro':'Rio de Janeiro','cape-town':'Cape Town','queenstown':'Queenstown, New Zealand'}
cities=[p for p in catalog if p['kind']=='city']
items=[]
for p in cities:
    slug=p['id'].removeprefix('city-');title=titles.get(slug,p['name']['en'])
    items.append((slug,title))
def collect(entry):
    slug,title=entry
    target=OUT/(slug+'.jpg');record=OUT/(slug+'.json')
    if target.exists() and record.exists(): return json.loads(record.read_text('utf-8'))
    page=api('en.wikipedia.org',titles=title,redirects=1,prop='pageimages',piprop='thumbnail|name',pithumbsize=1600,pilicense='free')['query']['pages'][0]
    filename=page.get('pageimage')
    if slug=='singapore':
        found=api('commons.wikimedia.org',generator='search',gsrnamespace=6,gsrsearch='Singapore skyline filetype:bitmap',gsrlimit=8,prop='imageinfo',iiprop='size|mime')['query']['pages']
        options=[p for p in found if p.get('imageinfo') and p['imageinfo'][0].get('mime')=='image/jpeg' and p['imageinfo'][0]['width']>p['imageinfo'][0]['height'] and not re.search('flag|map|logo',p['title'],re.I)]
        if not options: raise RuntimeError('No Singapore skyline photograph found')
        filename=options[0]['title'].removeprefix('File:')
    if not filename or not page.get('thumbnail'): raise RuntimeError(slug+': no freely licensed lead image')
    info=api('commons.wikimedia.org',titles='File:'+filename,prop='imageinfo',iiprop='url|extmetadata',iiurlwidth=1600)['query']['pages'][0]['imageinfo'][0]
    meta=info.get('extmetadata',{});license=plain(meta.get('LicenseShortName',{}).get('value',''))
    if not re.search(r'CC BY|CC0|Public domain|GFDL|KOGL Type 1',license,re.I): raise RuntimeError(slug+': unsupported license '+license)
    source=info.get('thumburl',info['url'])
    try: raw=fetch(source)
    except Exception:
        source=info['url']; raw=fetch(source)
    image=Image.open(BytesIO(raw));image=ImageOps.exif_transpose(image).convert('RGB');image.thumbnail((1600,1600));image.save(target,quality=86,optimize=True)
    result=dict(slug=slug,title=title,file=slug+'.jpg',source=info.get('descriptionurl','https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(filename)),imageUrl=source,author=plain(meta.get('Artist',{}).get('value','')),license=license,licenseUrl=plain(meta.get('LicenseUrl',{}).get('value','')),description=plain(meta.get('ImageDescription',{}).get('value','')),article='https://en.wikipedia.org/wiki/'+urllib.parse.quote(title.replace(' ','_')))
    record.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8');return result
results=[];errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    futures={pool.submit(collect,entry):entry for entry in items}
    for f in concurrent.futures.as_completed(futures):
        try:
            result=f.result();results.append(result);print('saved',result['slug'],flush=True)
        except Exception as exc: errors.append(dict(slug=futures[f][0],error=str(exc)));print('failed',futures[f][0],str(exc),flush=True)
representatives={'france':'paris','japan':'tokyo','china':'shanghai','usa':'new-york','uk':'london','italy':'rome','spain':'barcelona','australia':'sydney','thailand':'bangkok','canada':'vancouver','germany':'berlin','south-korea':'seoul','singapore':'singapore','new-zealand':'auckland','brazil':'rio-de-janeiro','egypt':'cairo','south-africa':'cape-town','portugal':'lisbon'}
manifest=dict(places={x['slug']:x for x in results},countries=representatives,errors=errors)
(OUT.parent/'places.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
print(json.dumps(dict(saved=len(results),expected=len(items),errors=errors),ensure_ascii=False),flush=True)
if errors: raise SystemExit(1)
