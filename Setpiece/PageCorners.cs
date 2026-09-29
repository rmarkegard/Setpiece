using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Setpiece.Rebuild;

/// <summary>
/// Smooth inner corners for a browser card. A web page is its own window, so its corners can only
/// be clipped with a window region, which has hard, stair-stepped edges. Instead the page stays
/// square and four tiny click-through windows sit over its corners, each showing the card as the
/// toolbar drew it there (a capture of the toolbar page) with an anti-aliased curve cut out of it.
/// </summary>
internal sealed class PageCorners : IDisposable
{
    private sealed class Cap : Form
    {
        public Cap(Form owner){FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;Owner=owner;}
        protected override bool ShowWithoutActivation=>true;
        // Layered (per-pixel alpha), click-through, never activated, not in Alt+Tab.
        protected override CreateParams CreateParams{get{var p=base.CreateParams;p.ExStyle|=0x80000|0x20|0x08000000|0x80;return p;}}
        public bool Draw(Bitmap image,Point screen)
        {
            var screenDc=GetDC(0);var memoryDc=CreateCompatibleDC(screenDc);var bitmap=image.GetHbitmap(Color.FromArgb(0));var previous=SelectObject(memoryDc,bitmap);
            try
            {
                var size=new Size(image.Width,image.Height);var source=Point.Empty;var blend=new Blend{Op=0,Flags=0,Alpha=255,Format=1};
                return UpdateLayeredWindow(Handle,screenDc,ref screen,ref size,memoryDc,ref source,0,ref blend,2);
            }
            finally{SelectObject(memoryDc,previous);DeleteObject(bitmap);DeleteDC(memoryDc);ReleaseDC(0,screenDc);}
        }
    }
    [StructLayout(LayoutKind.Sequential,Pack=1)] private struct Blend{public byte Op,Flags,Alpha,Format;}
    [DllImport("user32.dll")] private static extern bool UpdateLayeredWindow(nint window,nint destination,ref Point position,ref Size size,nint source,ref Point sourcePosition,int key,ref Blend blend,int flags);
    [DllImport("user32.dll")] private static extern nint GetDC(nint window);
    [DllImport("user32.dll")] private static extern int ReleaseDC(nint window,nint dc);
    [DllImport("gdi32.dll")] private static extern nint CreateCompatibleDC(nint dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(nint dc);
    [DllImport("gdi32.dll")] private static extern nint SelectObject(nint dc,nint item);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(nint item);

    private readonly Cap[] caps;
    public PageCorners(Form owner){caps=[new(owner),new(owner),new(owner),new(owner)];}

    public void Hide(){foreach(var cap in caps)if(cap.Visible)cap.Hide();}

    /// <summary>
    /// Covers the corners of <paramref name="page"/> (screen pixels) with the card from
    /// <paramref name="card"/>, a capture of the toolbar page whose pixel (0,0) is at
    /// <paramref name="origin"/> on screen and which is <paramref name="scale"/> capture pixels per screen pixel.
    /// </summary>
    public bool Show(Bitmap card,Point origin,double scale,Rectangle page,int radius)
    {
        if(radius<2||page.Width<radius*2||page.Height<radius*2){Hide();return true;}
        var ok=true;
        for(var corner=0;corner<4;corner++)
        {
            var right=corner is 1 or 2;var bottom=corner>=2;
            var x0=right?page.Right-radius:page.Left;var y0=bottom?page.Bottom-radius:page.Top;
            // The arc's centre: the corner square's inner corner.
            double cx=right?x0:x0+radius,cy=bottom?y0:y0+radius;
            using var image=new Bitmap(radius,radius,PixelFormat.Format32bppArgb);
            for(var y=0;y<radius;y++)for(var x=0;x<radius;x++)
            {
                // Coverage outside the rounded page, sampled 4×4 per pixel.
                var outside=0;
                for(var sy=0;sy<4;sy++)for(var sx=0;sx<4;sx++){var dx=x0+x+(sx+.5)/4-cx;var dy=y0+y+(sy+.5)/4-cy;if(dx*dx+dy*dy>radius*(double)radius)outside++;}
                if(outside==0){image.SetPixel(x,y,Color.Transparent);continue;}
                var px=(int)Math.Clamp((x0+x-origin.X)*scale,0,card.Width-1);var py=(int)Math.Clamp((y0+y-origin.Y)*scale,0,card.Height-1);
                var c=card.GetPixel(px,py);image.SetPixel(x,y,Color.FromArgb(c.A*outside/16,c.R,c.G,c.B));
            }
            var cap=caps[corner];if(!cap.Visible)cap.Show();
            ok&=cap.Draw(image,new Point(x0,y0));
        }
        return ok;
    }

    public void Dispose(){foreach(var cap in caps)cap.Dispose();}
}
