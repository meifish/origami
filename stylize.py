from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import numpy as np
from scipy import ndimage as nd
import argparse
import zipfile

parser = argparse.ArgumentParser(description='Prepare five origami photos in fold order.')
parser.add_argument('photos', nargs=5, type=Path)
parser.add_argument('--output', type=Path, default=Path('outputs'))
args = parser.parse_args()
out = args.output
pack = out / 'assets'
pack.mkdir(parents=True, exist_ok=True)
src = args.photos
styles = ['Soft Editorial','Textured Illustration','Graphic Paper Art']
bg = '#F5F0E7'
ink = '#25353E'
def font(size):
    return ImageFont.load_default(size=size)
def largest(mask):
    labels,n=nd.label(mask)
    counts=np.bincount(labels.ravel())
    counts[0]=0
    return nd.binary_fill_holes(labels==counts.argmax())
def paste(canvas,img,box):
    x,y,w,h=box
    img=ImageOps.contain(img,(w,h),Image.Resampling.LANCZOS)
    canvas.paste(img,(x+(w-img.width)//2,y+(h-img.height)//2),img if img.mode=='RGBA' else None)
def rgb(a):
    return Image.fromarray(np.uint8(np.clip(np.rint(a),0,255)))
board=Image.new('RGB',(1560,1508),bg)
d=ImageDraw.Draw(board)
d.text((35,24),'Paper Atelier  /  Photo stylization study',font=font(38),fill=ink)
d.text((36,80),'Same silhouette and scale across each row  /  Original shown as a paper cutout',font=font(21),fill=ink)
for j,label in enumerate(['Original cutout']+styles):
    d.text((155+j*350,134),label,font=font(23),fill=ink)
qa=Image.new('RGB',(1500,670),bg)
q=ImageDraw.Draw(qa)
q.text((25,24),'Source alignment  /  Mask contours on all five photographs',font=font(36),fill=ink)
for i,f in enumerate(src):
    im=ImageOps.exif_transpose(Image.open(f)).convert('RGB')
    if i>=2:
        im=im.transpose(Image.Transpose.ROTATE_90)
    im.save(pack/f'{i+1:02d}-source.png')
    a=np.asarray(im,dtype=np.float32)
    h,w=a.shape[:2]
    score=nd.gaussian_filter(a[:,:,2]-a[:,:,0],0.65)
    candidate=score>0
    candidate[:int(.11*h)]=False
    candidate[int(.90*h):]=False
    mask=largest(candidate)
    # Lock one subpixel matte to the local paper/wood color transition.
    gy,gx=np.gradient(score)
    slope=np.maximum(np.hypot(gx,gy),1)
    alpha=np.uint8(np.rint(255*np.clip(.5+score/slope,0,1)))
    edge_zone=nd.binary_dilation(mask)&~nd.binary_erosion(mask)
    alpha=np.where(edge_zone,alpha,255*mask).astype('uint8')
    matte=Image.fromarray(alpha)
    matte.save(pack/f'{i+1:02d}-mask.png')
    contour=mask & ~nd.binary_erosion(mask,iterations=2)
    overlay=a.copy()
    overlay[contour]=[255,138,68]
    paste(qa,rgb(overlay),(i*300+12,86,276,492))
    q.text((i*300+20,596),f'{i+1:02d}  /  '+('90° CCW' if i>=2 else ['Square','Triangle'][i]),font=font(22),fill=ink)
    q.text((i*300+20,627),f'{mask.sum():,} paper pixels',font=font(17),fill=ink)
    box=matte.getbbox()
    pad=16
    box=(max(0,box[0]-pad),max(0,box[1]-pad),min(w,box[2]+pad),min(h,box[3]+pad))
    cut=im.copy()
    cut.putalpha(matte)
    cut.crop(box).save(pack/f'{i+1:02d}-original-cutout.png')
    if i>=4:
        continue
    x0,y0,x1,y1=box
    a=a[y0:y1,x0:x1]
    m=mask[y0:y1,x0:x1]
    matte=matte.crop(box)
    g=a@np.array([.2126,.7152,.0722],dtype=np.float32)
    weight=m.astype(np.float32)
    n=np.maximum(nd.uniform_filter(weight,31),1e-5)
    def avg(x):
        return nd.uniform_filter(x*weight,31)/n
    mg=avg(g)
    var=np.maximum(avg(g*g)-mg*mg,0)
    base=[]
    for channel in np.moveaxis(a,-1,0):
        mc=avg(channel)
        k=(avg(g*channel)-mg*mc)/(var+18)
        base.append(avg(k)*g+avg(mc-k*mg))
    base=np.stack(base,axis=-1)
    detail=a-base
    distance=nd.distance_transform_edt(m)
    nearest=nd.distance_transform_edt(~m,return_distances=False,return_indices=True)
    gg=nd.gaussian_filter(g[tuple(nearest)],1.15)
    gradient=np.hypot(*np.gradient(gg))
    preserve=np.maximum(np.clip((7-distance)/5,0,1),np.clip((gradient-1.8)/2.6,0,1))[...,None]
    luma=base@np.array([.2126,.7152,.0722],dtype=np.float32)
    lo,hi=np.percentile(luma[m],[2,98])
    step=max((hi-lo)/4,2.5)
    quant=lo+np.round(np.clip((luma-lo)/step,0,4))*step
    tint=np.array([0.,3.,6.])
    soft=base+0.24*detail+np.array([12,14,16])
    texture=base+1.20*np.clip(detail,-8,8)+np.array([9,12,15])
    graphic=base+0.78*(quant-luma)[...,None]+0.12*detail+11+tint
    row_y=173+i*329
    d.text((35,row_y+128),f'{i+1:02d}',font=font(35),fill=ink)
    d.text((35,row_y+177),['Square','Triangle'][i%2],font=font(18),fill=ink)
    before=cut.crop(box)
    paste(board,before,(145,row_y,320,300))
    for j,(label,result) in enumerate(zip(styles,[soft,texture,graphic])):
        result=result*(1-preserve)+a*preserve
        img=rgb(result)
        img.putalpha(matte)
        name=pack/f'{i+1:02d}-{label.lower().replace(" ","-")}.png'
        img.save(name)
        saved=Image.open(name)
        assert np.array_equal(np.asarray(saved.getchannel('A')),np.asarray(before.getchannel('A')))
        arr=np.asarray(saved)
        print(i+1,label,'alpha mismatch 0; original protected RGB mismatch',np.count_nonzero(arr[:,:,:3][(preserve[...,0]==1)&m]!=a[(preserve[...,0]==1)&m]))
        paste(board,img,(145+(j+1)*350,row_y,320,300))
board.save(out/'style-comparison.png')
qa.save(out/'mask-check.png')
with zipfile.ZipFile(out/'origami-previews.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(pack.glob('*.png')):
        z.write(f,f.name)
