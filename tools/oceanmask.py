# Builds ocean-mask.png from coast.json (OSM coastline: land is LEFT of way direction).
import json,math,numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage
J=json.load(open('coast.json'));S,W,N,Ea=J['bbox'];P=1024
xy=lambda a,l:((l-W)/(Ea-W)*(P-1),(N-a)/(N-S)*(P-1))
im=Image.new('L',(P,P),0);d=ImageDraw.Draw(im)
for L in J['lines']: d.line([xy(a,l) for a,l in L],fill=1,width=2)
bar=np.array(im)>0
lab,n=ndimage.label(~bar);votes=np.zeros((n+1,2))
for L in J['lines']:
  pts=[xy(a,l) for a,l in L]
  for (x1,y1),(x2,y2) in zip(pts,pts[1:]):
    dx,dy=x2-x1,y2-y1;m=math.hypot(dx,dy)
    if m<1e-6:continue
    nx,ny=dy/m,-dx/m;cx,cy=(x1+x2)/2,(y1+y2)/2
    for s,k in((3,0),(-3,1)):
      X,Y=int(cx+nx*s),int(cy+ny*s)
      if 0<=X<P and 0<=Y<P and lab[Y,X]:votes[lab[Y,X],k]+=1
water=votes[:,1]>votes[:,0]
mask=ndimage.binary_dilation(water[lab]&(lab>0),iterations=1)
Image.fromarray((mask*255).astype('uint8')).save('ocean-mask.png')
for nme,a,l in[('RA',48.1062,-122.8057),('CityHall',48.1161771,-122.753612),('Hosp',48.106,-122.789),('Sheriff',48.0241638,-122.764488),('IndianIsl',48.07,-122.725),('Marrowstone',48.06,-122.69),('PTBay',48.08,-122.75),('Strait',48.17,-122.8)]:
  x,y=map(int,xy(a,l));print(nme,int(mask[y,x]))
Image.fromarray((mask*255).astype('uint8')).resize((400,400)).save('/workspace/eear-oceanmask.png')
