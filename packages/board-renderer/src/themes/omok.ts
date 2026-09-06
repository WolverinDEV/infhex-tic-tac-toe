import type {
    BoardCellRenderOptions,
    BoardTheme,
    BoardThemeColors,
} from "../themes";

const omokBoardColors: BoardThemeColors = {
    players: [`#111111`, `#f4f4f4`],
    background: `#d0a979`,
    grid: `rgba(17, 17, 17, 0.86)`,
    emphasisFill: `rgba(255, 255, 255, 0.08)`,
    emphasisStroke: `#111111`,
    emphasisShadow: `rgba(17, 17, 17, 0.28)`,
    originFill: `rgba(255, 255, 255, 0.04)`,
    originStroke: `#111111`,
    hoverFill: `rgba(17, 17, 17, 0.22)`,
    hoverStroke: `rgba(17, 17, 17, 0.2)`,
    label: `#111111`,
    highlightNeutral: `#111111`,
    highlightYellow: `#ffffff`,
    highlightBlue: `#111111`,
    highlightDot: `#d0a979`,
    highlightLineShadow: `rgba(255, 255, 255, 0.5)`,
};

export const omokBoardTheme: BoardTheme = {
    colors: omokBoardColors,
    intersectionGrid: true,
    drawCell({
        context,
        cell,
        centerX,
        centerY,
        radius,
    }: BoardCellRenderOptions) {
        context.beginPath();
        context.arc(centerX, centerY, radius * 0.78, 0, Math.PI * 2);
        
        context.fillStyle = omokBoardColors.players[cell.colorIndex];
        context.fill();
    },
};
