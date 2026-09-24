"""Original Setpiece compositions. No legacy artwork or source material is used."""
from pathlib import Path
import math
import sys
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "artifacts/python-tools"))
import imageio_ffmpeg

OUT = ROOT / "Setpiece/Assets/Wallpapers"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 2560, 1440
RNG = np.random.default_rng(621)

def rgb(value):
    return np.array([int(value[i:i+2], 16) for i in (1, 3, 5)])

def ground(top, bottom, glow=None):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = yy[..., None] / H
    color = np.broadcast_to(rgb(top)*(1-t)+rgb(bottom)*t, (H,W,3)).copy()
    if glow:
        hue, x, y, strength = glow
        light=np.exp(-(((xx/W-x)*1.15)**2+((yy/H-y)*.8)**2)/.19)[...,None]*strength
        color=color*(1-light)+rgb(hue)*light
    color += RNG.normal(0,.65,(H,W,1))
    return Image.fromarray(np.clip(color,0,255).astype(np.uint8))

def layer(image, paint, blur=0):
    overlay=Image.new('RGBA',image.size);paint(ImageDraw.Draw(overlay))
    if blur: overlay=overlay.filter(ImageFilter.GaussianBlur(blur))
    image.paste(overlay,(0,0),overlay)

def wave(draw, base, amplitude, period, phase, color):
    points=[(x,base+amplitude*math.sin(x/period+phase)) for x in range(-20,W+21,8)]
    draw.polygon(points+[(W+20,H+20),(-20,H+20)],fill=color)

def build(name):
    if name=='fjord-glass':
        im=ground('#122D38','#578D98',('#B9D9CD',.75,.2,.68))
        layer(im,lambda d:d.ellipse((1620,140,2060,580),fill=(218,237,223,120)),35)
        for y,a,p,c in [(730,150,460,(40,86,100,255)),(920,100,580,(27,67,81,255)),(1130,80,430,(19,49,64,255))]:
            layer(im,lambda d,y=y,a=a,p=p,c=c:wave(d,y,a,p,1.2,c))
        layer(im,lambda d:d.rounded_rectangle((340,210,820,1050),100,fill=(203,233,230,27),outline=(222,243,238,70),width=2))
    elif name=='paper-horizon':
        im=ground('#E5DCCD','#C8BCAF',('#FAF3DF',.2,.12,.7))
        for y,a,p,c in [(780,100,500,(231,210,181,255)),(850,150,600,(196,167,146,255)),(1010,110,380,(160,139,128,255)),(1170,110,480,(120,117,112,255))]:
            layer(im,lambda d,y=y,a=a,p=p,c=c:wave(d,y,a,p,.6,c))
        layer(im,lambda d:d.ellipse((1760,240,1990,470),fill=(248,237,210,255)))
    elif name=='moss-geometry':
        im=ground('#213A32','#53624A',('#ADBA82',.76,.3,.42))
        layer(im,lambda d:d.ellipse((1180,-360,2430,890),fill=(150,169,113,150)))
        layer(im,lambda d:d.polygon([(0,1050),(720,120),(1510,1440),(0,1440)],fill=(27,63,48,255)))
        layer(im,lambda d:d.polygon([(940,1440),(1530,430),(2350,1440)],fill=(89,116,76,240)))
        layer(im,lambda d:d.polygon([(1700,1440),(2230,670),(2700,1440)],fill=(166,173,122,180)))
        layer(im,lambda d:d.line([(730,120),(1510,1440)],fill=(199,211,153,90),width=3))
    elif name=='blue-hour':
        im=ground('#121F43','#6D83AA',('#CB9CAD',.4,.85,.42))
        layer(im,lambda d:d.ellipse((1700,220,2010,530),fill=(206,219,233,230)))
        for y,a,p,c in [(1010,80,670,(43,64,101,255)),(1150,45,370,(27,45,75,255)),(1310,50,460,(17,33,61,255))]:
            layer(im,lambda d,y=y,a=a,p=p,c=c:wave(d,y,a,p,3.1,c))
        layer(im,lambda d:d.rounded_rectangle((330,470,610,1550),140,fill=(27,43,72,255)))
        layer(im,lambda d:d.rounded_rectangle((330,470,610,1550),140,outline=(124,149,180,85),width=3))
    elif name=='ember-grid':
        im=ground('#382C2B','#5E3F32',('#B76B44',.75,.32,.47))
        for row in range(5):
            for col in range(8):
                x,y=col*330-90,row*330-60
                alpha=17+(row*17+col*23)%46
                layer(im,lambda d,x=x,y=y,alpha=alpha:d.rounded_rectangle((x,y,x+300,y+300),36,outline=(223,164,114,alpha),width=2))
        layer(im,lambda d:d.rounded_rectangle((1560,250,2190,880),64,fill=(203,116,70,65),outline=(245,185,116,100),width=3))
        layer(im,lambda d:d.ellipse((530,740,940,1150),fill=(238,162,93,55)),5)
    elif name=='slate-dunes':
        im=ground('#A9B1B4','#636F76',('#E5DBCA',.72,.06,.55))
        for index in range(6):
            y=610+index*150;a=130+index*12;p=510+index*20
            color=(max(44,147-index*15),max(54,155-index*14),max(64,158-index*13),255)
            layer(im,lambda d,y=y,a=a,p=p,color=color:wave(d,y,a,p,index*.26,color))
    elif name=='orchard-mist':
        im=ground('#D9DFC5','#728C76',('#F8EDD0',.5,.1,.55))
        for row in range(3):
            for col in range(5):
                x=col*620+row*140-220;y=330+row*320
                layer(im,lambda d,x=x,y=y,row=row:d.ellipse((x,y,x+760,y+940),fill=(48+row*9,91+row*4,67+row*5,35+row*20)),40-row*9)
        layer(im,lambda d:d.rectangle((0,650,W,1100),fill=(226,235,206,80)),110)
    elif name=='violet-current':
        im=ground('#251F47','#454169',('#A09BCE',.77,.2,.45))
        for index in range(11):
            points=[(x,540+index*47+170*math.sin(x/550+index*.07)) for x in range(-20,W+21,6)]
            layer(im,lambda d,points=points,index=index:d.line(points,fill=(177+index*4,151+index*3,228,40+index*4),width=30-index*2),3)
    elif name=='quiet-coast':
        im=ground('#9FBFC0','#3C797C',('#E1E6CD',.22,.1,.58))
        layer(im,lambda d:wave(d,800,110,580,2.3,(92,153,147,255)))
        layer(im,lambda d:wave(d,1040,180,650,2.15,(220,215,189,255)))
        points=[(x,1020+180*math.sin(x/650+2.15)) for x in range(-20,W+21,6)]
        layer(im,lambda d:d.line(points,fill=(241,239,212,150),width=12),6)
    else:
        im=ground('#22282C','#535C60',('#ADB4B3',.72,.43,.43))
        cx,cy=1820,750
        for index in range(16):
            angle=index*math.tau/16;x=cx+290*math.cos(angle);y=cy+290*math.sin(angle)
            layer(im,lambda d,x=x,y=y,index=index:d.ellipse((x-450,y-450,x+450,y+450),outline=(217,222,216,35+index*2),width=8),2)
        layer(im,lambda d:d.ellipse((cx-210,cy-210,cx+210,cy+210),fill=(151,163,164,75)),55)
    return im

names=['fjord-glass','paper-horizon','moss-geometry','blue-hour','ember-grid','slate-dunes','orchard-mist','violet-current','quiet-coast','mono-bloom']
encoder=imageio_ffmpeg.get_ffmpeg_exe()
for name in names:
    still=OUT/(name+'.png');movie=OUT/(name+'.mp4')
    if not still.exists():build(name).save(still,optimize=True)
    if not movie.exists():
        motion="zoompan=z='1.06+0.012*sin(2*PI*on/288)':x='iw/2-iw/zoom/2+12*sin(2*PI*on/288)':y='ih/2-ih/zoom/2+8*cos(2*PI*on/288)':d=288:s=1280x720:fps=24"
        subprocess.run([encoder,'-hide_banner','-loglevel','error','-y','-i',str(still),'-vf',motion,'-frames:v','288','-an','-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(movie)],check=True)
    print(name,still.stat().st_size,movie.stat().st_size,flush=True)
