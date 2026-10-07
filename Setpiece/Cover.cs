using System.Runtime.InteropServices;

namespace Setpiece.Rebuild;

/// <summary>
/// What other windows hide of Setpiece's own. WebView2 cannot tell when its window is covered and keeps drawing
/// it, so Setpiece looks for itself: on a desk, each widget under an application rests (no ticking, polling or
/// looping motion), and Studio rests whole while nothing of it shows. Overlays never count (click-through, tool
/// and see-through layered windows). An app made translucent on purpose (a terminal set below full opacity)
/// does count, so a widget behind one holds still until the app moves.
/// </summary>
internal static class Cover
{
    [DllImport("user32.dll")] private static extern bool IsIconic(nint window);

    /** The visible top-level windows, top first, each with what it hides (empty when it hides nothing). */
    public static List<(nint Window, Rectangle Hides)> Stack()
    {
        var result = new List<(nint, Rectangle)>();
        Windows.EnumWindows((window, _) =>
        {
            if (!Windows.IsWindowVisible(window)) return true;
            result.Add((window, Hides(window)));
            return true;
        }, 0);
        return result;
    }
    [DllImport("user32.dll")] private static extern bool GetLayeredWindowAttributes(nint window, out uint key, out byte alpha, out uint flags);
    private static Rectangle Hides(nint window)
    {
        // Click-through windows and tool windows are overlays and palettes (a game overlay spans the display).
        // Windows drawn through DirectComposition (Chrome, Edge, Electron, Store apps) count as solid.
        var style = (long)Windows.GetWindowLongPtr(window, -20);
        if (IsIconic(window) || (style & (0x20 | 0x80)) != 0) return Rectangle.Empty;
        // A layered window is solid only when Windows says it is drawn fully opaque, without a see-through colour.
        if ((style & 0x80000) != 0 && !(GetLayeredWindowAttributes(window, out _, out var alpha, out var flags) && (flags & 1) == 0 && ((flags & 2) == 0 || alpha == 255))) return Rectangle.Empty;
        if (Windows.DwmGetWindowAttribute(window, 14, out int cloaked, sizeof(int)) == 0 && cloaked != 0) return Rectangle.Empty;
        // The visible frame: the window rectangle also counts the invisible resize border around it.
        if (Windows.DwmGetWindowAttribute(window, 9, out Windows.Rect frame, Marshal.SizeOf<Windows.Rect>()) != 0 && !Windows.GetWindowRect(window, out frame)) return Rectangle.Empty;
        return Rectangle.FromLTRB(frame.Left, frame.Top, frame.Right, frame.Bottom);
    }

    /** What still shows of <paramref name="area"/> on <paramref name="window"/>, with every hiding window above it cut away. */
    public static List<Rectangle> Showing(List<(nint Window, Rectangle Hides)> stack, nint window, Rectangle area)
    {
        var showing = new List<Rectangle> { area };
        foreach (var (above, hides) in stack)
        {
            if (above == window) return showing;
            if (!hides.IsEmpty && hides.IntersectsWith(area)) showing = Subtract(showing, hides);
            if (showing.Count == 0) return showing;
        }
        // Not in the stack (hidden, or closing): nothing of it shows.
        return [];
    }
    /** Each rectangle with <paramref name="cut"/> taken out, as at most four pieces around it. */
    internal static List<Rectangle> Subtract(List<Rectangle> area, Rectangle cut)
    {
        var result = new List<Rectangle>(area.Count + 3);
        foreach (var piece in area)
        {
            var overlap = Rectangle.Intersect(piece, cut);
            if (overlap.IsEmpty) { result.Add(piece); continue; }
            if (overlap.Top > piece.Top) result.Add(Rectangle.FromLTRB(piece.Left, piece.Top, piece.Right, overlap.Top));
            if (overlap.Bottom < piece.Bottom) result.Add(Rectangle.FromLTRB(piece.Left, overlap.Bottom, piece.Right, piece.Bottom));
            if (overlap.Left > piece.Left) result.Add(Rectangle.FromLTRB(piece.Left, overlap.Top, overlap.Left, overlap.Bottom));
            if (overlap.Right < piece.Right) result.Add(Rectangle.FromLTRB(overlap.Right, overlap.Top, piece.Right, overlap.Bottom));
        }
        return result;
    }
    public static bool Shows(List<Rectangle> showing, Rectangle area) => showing.Any(piece => piece.IntersectsWith(area));

    /// <summary>
    /// Calls back on the UI thread, a moment after something that can uncover a window happened: another window
    /// came to the front, one was minimized or restored, or a move or resize ended. Everything else (a window
    /// maximized in place, say) is caught by a slow check the host runs anyway.
    /// </summary>
    internal sealed class Watcher : IDisposable
    {
        private readonly Windows.EventCallback callback;
        private readonly nint hook;
        private readonly System.Windows.Forms.Timer settle = new() { Interval = 60 };
        public Watcher(Action changed)
        {
            settle.Tick += (_, _) => { settle.Stop(); changed(); };
            callback = (_, kind, _, _, _, _, _) => { if (kind is 0x0003 or 0x000B or 0x0016 or 0x0017) { settle.Stop(); settle.Start(); } };
            // EVENT_SYSTEM_FOREGROUND through EVENT_SYSTEM_MINIMIZEEND: system events only, a few a minute.
            hook = Windows.SetWinEventHook(0x0003, 0x0017, 0, callback, 0, 0, 2);
        }
        public void Dispose() { if (hook != 0) Windows.UnhookWinEvent(hook); settle.Dispose(); GC.KeepAlive(callback); }
    }
}
