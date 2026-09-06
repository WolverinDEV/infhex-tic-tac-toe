import type { BoardCellRenderOptions, BoardTheme } from "../themes";
import { traceHexPath } from "../utils";
import { darkBoardColors } from "./darkColors";
import { drawMarker, getMarkerPalette } from "./markerDrawing";

export const markerBoardTheme: BoardTheme = {
    colors: darkBoardColors,
    drawCell(options: BoardCellRenderOptions) {
        const { context, cell, centerX, centerY, radius, scale } = options;
        const palette = getMarkerPalette(darkBoardColors.players[cell.colorIndex]);

        traceHexPath(context, centerX, centerY, radius - 2);
        context.fillStyle = palette.tileTint;
        context.fill();
        context.strokeStyle = palette.tileShadow;
        context.lineWidth = Math.max(2.5, scale * 0.09);
        context.stroke();

        traceHexPath(context, centerX, centerY, radius - 2);
        context.strokeStyle = palette.tileOutline;
        context.lineWidth = Math.max(1.6, scale * 0.055);
        context.stroke();

        drawMarker(options, {
            shadow: palette.markerShadow,
            outline: palette.markerOutline,
            fill: palette.markerFill,
            accent: palette.accent,
        });
    },
};
