import type { BoardCellRenderOptions, BoardTheme } from "../themes";
import { traceHexPath } from "../utils";
import { darkBoardColors } from "./darkColors";

export const normalBoardTheme: BoardTheme = {
    colors: darkBoardColors,
    drawCell({ context, cell, centerX, centerY, radius }: BoardCellRenderOptions) {
        traceHexPath(context, centerX, centerY, radius - 2);
        context.fillStyle = darkBoardColors.players[cell.colorIndex];
        context.fill();
    },
};
