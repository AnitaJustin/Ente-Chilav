// One place to control how big every piece of text in the app is.
//
// FONT_OFFSET is added to every font size and line height. It is currently -2,
// which makes everything 2 points smaller than the original design.
// Change it to -1, 0 or +1 and the whole app follows. (Text also still respects
// the font-size setting in your phone's accessibility options.)
export const FONT_OFFSET = -2;

export const fs = (size: number): number => size + FONT_OFFSET;
