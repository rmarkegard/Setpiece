using Setpiece.Rebuild;
using System.Drawing;

namespace Setpiece.Tests;

public class CoverTests
{
    private static readonly Rectangle Desk = new(0, 0, 1920, 1080);
    [Fact] public void AMaximizedWindowCoversEveryWidgetButLeavesTheTaskbarStrip()
    {
        // Setpiece hides the taskbar, but a maximized window still stops at the work area above it.
        var showing = Cover.Showing([(1, new Rectangle(0, 0, 1920, 1032)), (2, Rectangle.Empty)], 2, Desk);
        Assert.False(Cover.Shows(showing, new Rectangle(1440, 540, 460, 480)));
        Assert.True(Cover.Shows(showing, new Rectangle(0, 1040, 400, 40)));
    }
    [Fact] public void WindowsBelowTheDeskOrSeeThroughOnesHideNothing()
    {
        var showing = Cover.Showing([(5, Rectangle.Empty), (2, Rectangle.Empty), (9, Desk)], 2, Desk);
        Assert.True(Cover.Shows(showing, new Rectangle(100, 100, 10, 10)));
    }
    [Fact] public void TwoWindowsSideBySideCoverWhatNeitherCoversAlone()
    {
        var stack = new List<(nint, Rectangle)> { (1, new Rectangle(0, 0, 960, 1080)), (3, new Rectangle(960, 0, 960, 1080)), (2, Rectangle.Empty) };
        Assert.Empty(Cover.Showing(stack, 2, Desk));
        var halfCovered = Cover.Showing(stack.Skip(1).ToList(), 2, Desk);
        Assert.True(Cover.Shows(halfCovered, new Rectangle(900, 0, 100, 100))); Assert.False(Cover.Shows(halfCovered, new Rectangle(961, 10, 100, 100)));
    }
    [Fact] public void SubtractingLeavesNoOverlapAndKeepsTheRestOfTheArea()
    {
        var pieces = Cover.Subtract([Desk], new Rectangle(500, 300, 400, 200));
        Assert.Equal(Desk.Width * Desk.Height - 400 * 200, pieces.Sum(p => p.Width * p.Height));
        for (var i = 0; i < pieces.Count; i++) for (var j = i + 1; j < pieces.Count; j++) Assert.False(pieces[i].IntersectsWith(pieces[j]));
    }
    [Fact] public void AWindowNotInTheStackShowsNothing() => Assert.Empty(Cover.Showing([(1, Rectangle.Empty)], 2, Desk));
}
