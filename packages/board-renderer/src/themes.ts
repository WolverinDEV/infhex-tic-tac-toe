import type { PlacedCell } from ".";

export type BoardThemeColors = Readonly<{
    players: readonly [string, string];
    background: string;
    grid: string;
    emphasisFill: string;
    emphasisStroke: string;
    emphasisShadow: string;
    originFill: string;
    originStroke: string;
    hoverFill: string;
    hoverStroke: string;
    label: string;
    highlightNeutral: string;
    highlightYellow: string;
    highlightBlue: string;
    highlightDot: string;
    highlightLineShadow: string;
}>;

export type BoardCellRenderOptions = Readonly<{
    context: CanvasRenderingContext2D;
    cell: PlacedCell;
    centerX: number;
    centerY: number;
    radius: number;
    scale: number;
}>;

export type BoardTheme = Readonly<{
    colors: BoardThemeColors;
    intersectionGrid?: boolean;
    drawCell: (options: BoardCellRenderOptions) => void;
}>;

export { blackAndWhiteBoardTheme } from "./themes/blackAndWhite";
export { markerBoardTheme } from "./themes/marker";
export { normalBoardTheme } from "./themes/normal";
export { omokBoardTheme } from "./themes/omok";
