# Scene builder: free canvas with splitting tiles

The scene builder (`/layouts`) gets a new work surface. Today it wraps
react-grid-layout with collisions forbidden: tiles resize only at the bottom
right corner and only into free space, the grid is invisible, and dropping a
widget onto an occupied area creates an overlap that the backend then
refuses to save. The built-in scenes are full, so adding a widget means
making room by hand first.

Nothing outside the builder changes: scenes stay rectangles on the shared
12 x 24 grid, the saved format, the feed, the backend validation and the
wall are untouched.

## The surface

- A 9:16 sheet showing all 12 x 24 cells as a dashed grid.
- Below the grid, inside the sheet, a fixed greyed strip labelled
  "Statusleiste (immer sichtbar)". It is not a widget and cannot be moved,
  resized or removed; it shows that the wall's footer is always there.
- Tiles snap to cells. Gaps are allowed. Tiles never overlap, at any moment.

## Adding a widget (drag from the sidebar)

While dragging, a preview shows exactly what releasing will do:

- **Over free cells:** the widget is placed at its minimum size with the
  pointer's cell inside it. If the minimum-size rectangle anchored at the
  pointer's cell does not fit, the nearest position that is free and still
  contains the pointer's cell is used. Preview: green outline.
- **Over a tile:** the tile is split. The side of the tile nearest to the
  pointer (left, right, top, bottom) goes to the new widget; the tile keeps
  the rest. The new widget gets half of the tile along the split axis
  (rounded down), but at least its own minimum; the tile must keep at least
  its minimum; across the split axis the new widget takes the tile's full
  extent, which must satisfy the new widget's minimum. If that side is not
  possible, the other sides are tried in order of distance to the pointer.
  Preview: green outline for the new widget, and the tile shown at its
  reduced size.
- **Nothing possible:** red outline at the pointer's cell with the text
  "Kein Platz"; releasing does nothing.

Clicking a sidebar entry (the keyboard path) keeps working: first free spot
at minimum size; if there is none, the largest tile that can be split is
split on its bottom or right side (whichever keeps both parts larger).

## Moving a tile

Drag the tile body. Over free cells it moves, clamped to the grid;
positions that would overlap show the red outline and releasing there leaves
the tile where it was.

Moving the pointer onto another tile splits that tile, exactly like dropping
a new widget from the sidebar (the layout is looked at without the dragged
tile): the target shrinks to its reduced rectangle and the dragged tile takes
the added rectangle, shown as a green outline with the tile's name. It keeps
its id, type, props and fallback but not its old size. If no split fits, the
outline is red with "Kein Platz" and releasing changes nothing. The old place
simply becomes free; neighbours do not grow into it, and tiles still do not
swap. Escape cancels. Arrow-key moves only use free cells.

## Resizing a tile

Handles on all four edges and four corners.

- **Growing** an edge takes free space first. A tile that lies directly in
  the way and is adjacent to the moving edge has its near edge pushed and
  shrinks, down to its minimum. The edge stops where the first neighbour
  reaches its minimum or the grid ends.
- **Shrinking** an edge moves only that tile. Neighbours stay where they
  are and the freed cells become a gap. To move the line between two tiles,
  grow the other one.
- The tile itself never goes below its minimum.
- A corner handle applies both of its edges.

## Removing a tile

The tile disappears and the gap is filled when possible: if the tiles on one
side of the removed tile are all flush against it and together cover exactly
that side (each one's extent within it), they grow into the gap. If several
sides qualify, the side with the fewest tiles wins; ties go to left, top,
right, bottom. If no side qualifies, the gap stays.

## Undo, clear

- "Rückgängig" (button and Ctrl/Cmd+Z) restores the widgets as they were
  before the last change to the layout: add, move, resize, remove, clear,
  and tile setting changes. At least 20 steps. The history belongs to the
  open scene and is dropped when another scene is selected or the draft is
  discarded, reset or restored.
- "Szene leeren" removes all tiles after a confirmation and can be undone.

## Keyboard

Tiles are focusable. Arrow keys move the focused tile by one cell (free
cells only). Shift + arrow keys move its right or bottom edge by one cell
with the resize rules above. Delete or Backspace removes it. Each tile's
accessible name states widget name, position and size.

## Not in scope

Swapping tiles, pixel-free placement without a grid, a different grid
resolution, phone or tablet layouts (the builder stays laptop-only), any
change to the wall or the Convex backend.
