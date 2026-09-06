import { type PlayerColorIndex, type HexCoordinate, type CellKey, getCellKey } from "@ih3t/shared";

import { axialToUnitPoint, clampScale, kDefaultScale } from "./utils";

export type CellMarker = `X` | `O`;

export type PlacedCell = HexCoordinate & {
    marker: CellMarker;
    colorIndex: PlayerColorIndex;
};

export type CellLabel = HexCoordinate & {
    text: string;
};

export type BoardState = Readonly<{
    placedCells: readonly PlacedCell[];
    labels?: readonly CellLabel[];
}>;

export type BoardHighlight = Readonly<{
    kind: `cell` | `line`;
    cells: readonly HexCoordinate[];
    color: string;
}>;

export type BoardViewState = Readonly<{
    offsetX: number;
    offsetY: number;
    scale: number;
}>;

const kDefaultViewState: BoardViewState = {
    offsetX: 0,
    offsetY: 0,
    scale: kDefaultScale,
};

export class BoardController {
    private readonly listeners = new Set<() => void>();
    private viewState: BoardViewState = kDefaultViewState;
    private emphasizedCells: Set<CellKey> = new Set();
    private highlights: BoardHighlight[] = [];

    public getViewState(): BoardViewState {
        return this.viewState;
    }

    public getEmphasizedCells(): Set<CellKey> {
        return this.emphasizedCells;
    }
    public getHighlights(): readonly BoardHighlight[] {
        return this.highlights;
    }

    public subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public updateViewState(patch: Partial<BoardViewState>) {
        this.viewState = {
            ...this.viewState,
            ...patch,
            scale:
                patch.scale === undefined
                    ? this.viewState.scale
                    : clampScale(patch.scale),
        };
        this.notifyListeners();
    }

    public centerOnCell(cell: HexCoordinate) {
        const point = axialToUnitPoint(cell.x, cell.y);
        this.updateViewState({
            offsetX: -point.x * this.viewState.scale,
            offsetY: -point.y * this.viewState.scale,
        });
    }

    public setEmphasizedCells(cells: HexCoordinate[]) {
        this.emphasizedCells = new Set(
            cells.map((cell) => getCellKey(cell.x, cell.y)),
        );
        this.notifyListeners();
    }

    public setHighlights(highlights: BoardHighlight[]) {
        this.highlights = highlights;
        this.notifyListeners();
    }

    public addHighlight(highlight: BoardHighlight) {
        this.highlights.push(highlight);
    }

    public clearHighlights() {
        this.setHighlights([]);
    }

    public resetView() {
        this.updateViewState({
            offsetX: kDefaultViewState.offsetX,
            offsetY: kDefaultViewState.offsetY,
            scale: kDefaultViewState.scale,
        });
    }

    private notifyListeners() {
        this.listeners.forEach((listener) => listener());
    }
}

export {
    GameBoardRenderer,
    type GameBoardRendererProps,
    type GameBoardRenderOptions,
} from "./renderer";
export {
    blackAndWhiteBoardTheme,
    markerBoardTheme,
    normalBoardTheme,
    omokBoardTheme,
    type BoardCellRenderOptions,
    type BoardTheme,
    type BoardThemeColors,
} from "./themes";
export { getRenderableCellCount, traceHexPath } from "./utils";
