/* Bot styles (server sends p.style for permanent BOTs): lightblue (#7ec8ff), plaid (navy #1b2a6b tartan with light green #9be89b + thin navy/green crossing stripes), default (normal per-id colour) */
(function(){
const COL={lightblue:'#7ec8ff',plaid:'#9be89b'};
function tile(n){const cv=document.createElement('canvas');cv.width=cv.height=n;const x=cv.getContext('2d'),u=n/64,R=(a,b,w,c)=>{x.fillStyle=c;x.fillRect(a*u,0,w*u,n);x.fillRect(0,a*u,n,w*u)};
 x.fillStyle='#1b2a6b';x.fillRect(0,0,n,n);R(8,0,16,'rgba(155,232,155,.55)');R(40,0,4,'rgba(155,232,155,.95)');R(15,0,2,'rgba(12,20,70,.95)');R(52,0,1.5,'rgba(155,232,155,.8)');R(30,0,1.5,'rgba(12,20,70,.9)');return cv}
let big,small,tx={};
window.EEAR_BOTSTYLE={COL,
 col:(o,fallback)=>o&&o.bot&&COL[o.style]||fallback,
 plaid:()=>big||(big=tile(64)),plaidSmall:()=>small||(small=tile(8)),
 tex(T,rx=1,ry=1){const k=rx+'x'+ry;if(!tx[k]){const t=new T.CanvasTexture(this.plaid());t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry);if('colorSpace'in t&&T.SRGBColorSpace)t.colorSpace=T.SRGBColorSpace;tx[k]=t}return tx[k]},
 /* Leaflet/SVG: <svg> pattern id eearPlaid (inject once) */
 svgDefs(){if(document.getElementById('eearPlaidDefs'))return;document.body.insertAdjacentHTML('beforeend','<svg id=eearPlaidDefs width=0 height=0 style="position:absolute"><defs><pattern id=eearPlaid width=8 height=8 patternUnits=userSpaceOnUse><rect width=8 height=8 fill="#1b2a6b"/><rect x=1 width=2 height=8 fill="#9be89b" opacity=.6 /><rect y=1 width=8 height=2 fill="#9be89b" opacity=.6 /><rect x=5 width=.6 height=8 fill="#9be89b"/><rect y=5 width=8 height=.6 fill="#9be89b"/><rect x=2 width=.4 height=8 fill="#0c1446"/><rect y=2 width=8 height=.4 fill="#0c1446"/></pattern></defs></svg>')}};
})();
