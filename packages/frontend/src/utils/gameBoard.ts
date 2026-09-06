import {
    blackAndWhiteBoardTheme,
    type BoardState as RendererBoardState,
    type BoardTheme,
    markerBoardTheme,
    normalBoardTheme,
    omokBoardTheme,
} from "@ih3t/board-renderer";
import type {
    BoardThemeId,
    DatabaseGamePlayer,
    GameState,
    PlayerNames,
    PlayerTileConfig,
} from "@ih3t/shared";
import {
    kBoardThemeNormal,
    kBoardThemeMarker,
    kBoardThemeBlackAndWhite,
    kBoardThemeOmok,
} from "@ih3t/shared";
import i18next from 'i18next'

type PlayerReference = string | DatabaseGamePlayer;

export const kBoardThemes: Record<BoardThemeId, BoardTheme> = {
    [kBoardThemeNormal]: normalBoardTheme,
    [kBoardThemeMarker]: markerBoardTheme,
    [kBoardThemeBlackAndWhite]: blackAndWhiteBoardTheme,
    [kBoardThemeOmok]: omokBoardTheme,
};

export function getBoardTheme(
    theme: BoardThemeId | null | undefined,
): BoardTheme {
    return (
        kBoardThemes[theme ?? kBoardThemeNormal] ??
        kBoardThemes[kBoardThemeNormal]
    );
}

export function toRendererBoardState(gameState: GameState): RendererBoardState {
    return {
        placedCells: gameState.cells.map((cell) => ({
            x: cell.x,
            y: cell.y,
            colorIndex: gameState.playerTiles[cell.occupiedBy]?.colorIndex ?? 0,
            marker: (gameState.playerTiles[cell.occupiedBy]?.colorIndex ?? 0) === 0 ? `X` : `O`,
        })),
    };
}

export function getPlayerColor(
    playerTiles: Record<string, PlayerTileConfig> | null | undefined,
    playerId: string,
    theme: BoardTheme = normalBoardTheme,
): string {
    return theme.colors.players[playerTiles?.[playerId]?.colorIndex ?? 0];
}

export function getPlayerLabel(
    players: readonly PlayerReference[],
    playerId: string | null,
    playerNames?: PlayerNames,
    fallbackName = i18next.t('aPlayer', 'A player'),
): string {
    if (!playerId) {
        return fallbackName;
    }

    const databasePlayer = players.find(
        (candidate) =>
            typeof candidate !== `string` && candidate.playerId === playerId,
    );
    if (databasePlayer && typeof databasePlayer !== `string`) {
        const displayName = databasePlayer.displayName.trim();
        if (displayName) {
            return displayName;
        }
    }

    const playerName = playerNames?.[playerId]?.trim();
    if (playerName) {
        return playerName;
    }

    const playerIndex = players.findIndex(
        (player) =>
            (typeof player === `string` ? player : player.playerId) ===
            playerId,
    );
    return playerIndex === -1 ? fallbackName : i18next.t('playerVal', 'Player {{val}}', { val: playerIndex + 1 });
}
