"""Single-image adapter for the Paper Atelier pipeline in meifish/origami."""
from PIL import Image, ImageOps
import numpy as np
from scipy import ndimage as nd
import sys

def largest(mask):
    labels,n=nd.label(mask)
    counts=np.bincount(labels.ravel())
    counts[0]=0
    return nd.binary_fill_holes(labels==counts.argmax())

def stylize(im, style, remove_background):
    a=np.asarray(im,dtype=np.float32)
    h,w=a.shape[:2]
    score=nd.gaussian_filter(a[:,:,2]-a[:,:,0],0.65)
    candidate=score>0
    # Search the full frame so a rotated or edge-touching paper tip stays intact.
    if not np.any(candidate):
        raise ValueError('No cool-colored paper was detected. Try Basic edge color or another photo.')
    mask=largest(candidate)
    # Lock one subpixel matte to the local paper/wood color transition.
    gy,gx=np.gradient(score)
    slope=np.maximum(np.hypot(gx,gy),1)
    alpha=np.uint8(np.rint(255*np.clip(.5+score/slope,0,1)))
    edge_zone=nd.binary_dilation(mask)&~nd.binary_erosion(mask)
    alpha=np.where(edge_zone,alpha,255*mask).astype('uint8')
    matte=Image.fromarray(alpha)
    if style == 'original':
        im.putalpha(matte)
        return im

    x0, y0, x1, y1 = matte.getbbox()
    x0, y0, x1, y1 = max(0, x0-16), max(0, y0-16), min(w, x1+16), min(h, y1+16)
    a = a[y0:y1, x0:x1]
    m = mask[y0:y1, x0:x1]
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
    result = {'editorial': soft, 'texture': texture, 'graphic': graphic}[style]
    result = result*(1-preserve)+a*preserve
    patch = Image.fromarray(np.uint8(np.clip(np.rint(result),0,255)))
    patch.putalpha(matte.crop((x0, y0, x1, y1)))
    output = im.convert('RGBA')
    if remove_background:
        output.putalpha(matte)
        output.paste(patch, (x0, y0))
    else:
        output.alpha_composite(patch, (x0, y0))
    return output


if __name__ == '__main__':
    try:
        style, remove = sys.argv[1:]
        image = ImageOps.exif_transpose(Image.open(sys.stdin.buffer)).convert('RGB')
        stylize(image, style, remove == 'true').save(sys.stdout.buffer, format='PNG')
    except ValueError as error:
        sys.exit(str(error))
