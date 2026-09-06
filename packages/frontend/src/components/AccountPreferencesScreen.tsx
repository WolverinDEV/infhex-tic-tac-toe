import {
    blackAndWhiteBoardTheme,
    BoardController,
    type BoardState,
    type BoardTheme,
    GameBoardRenderer,
    markerBoardTheme,
    normalBoardTheme,
    omokBoardTheme,
} from '@ih3t/board-renderer';
import type { AccountPreferences, BoardThemeId } from '@ih3t/shared';
import { kBoardThemeNormal, kBoardThemeBlackAndWhite, kBoardThemeMarker, kBoardThemeOmok } from '@ih3t/shared';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';

import { updateAccountPreferences, useQueryAccountPreferences } from '../query/accountClient';
import PageCorpus from './PageCorpus';
import { Switch } from './ui/switch';
import { cn } from '../utils/cn';
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next';

type BooleanPreference = {
    [Key in keyof AccountPreferences]: AccountPreferences[Key] extends boolean ? Key : never
}[keyof AccountPreferences];

const themeChoices: readonly {
    id: BoardThemeId,
    label: (t: TFunction) => string,
    description: (t: TFunction) => string,
    theme: BoardTheme,
}[] = [
        {
            id: kBoardThemeNormal,
            label: (t) => t('normal', 'Normal'),
            description: (t) => t('solidPlayerColors', 'Solid player colors.'),
            theme: normalBoardTheme,
        },
        {
            id: kBoardThemeMarker,
            label: (t) => t('markers', 'Markers'),
            description: (t) => t('playerColorsWithXAndOMarkers', 'Player colors with X and O markers.'),
            theme: markerBoardTheme,
        },
        {
            id: kBoardThemeOmok,
            label: (t) => t('omok', 'Omok'),
            description: (t) => t('woodenGridWithBlackAndWhiteStones', 'Wooden grid with black and white stones.'),
            theme: omokBoardTheme,
        },
        {
            id: kBoardThemeBlackAndWhite,
            label: (t) => t('blackAndWhite', 'Black & White'),
            description: (t) => t('highcontrastMonochromeMarkers', 'High-contrast monochrome markers.'),
            theme: blackAndWhiteBoardTheme,
        },
    ];

const previewBoard: BoardState = {
    placedCells: [
        { x: -2, y: 0, marker: `X`, colorIndex: 0 },
        { x: -1, y: 0, marker: `O`, colorIndex: 1 },
        { x: 0, y: 0, marker: `O`, colorIndex: 1 },
        { x: 1, y: 0, marker: `X`, colorIndex: 0 },
        { x: 2, y: 0, marker: `X`, colorIndex: 0 },
        { x: -1, y: -1, marker: `X`, colorIndex: 0 },
        { x: 0, y: -1, marker: `O`, colorIndex: 1 },
        { x: 1, y: -1, marker: `X`, colorIndex: 0 },
        { x: 0, y: 1, marker: `X`, colorIndex: 0 },
    ],
    labels: [{ x: -1, y: 1, text: `A1` }],
};

function ThemePreview({ theme }: { theme: BoardTheme }) {
    const controller = useMemo(() => {
        const previewController = new BoardController();
        previewController.updateViewState({ scale: 28 });
        previewController.setEmphasizedCells([{ x: 1, y: 0 }]);
        previewController.setHighlights([
            {
                kind: `cell`,
                cells: [{ x: -1, y: 0 }],
                color: theme.colors.highlightYellow,
            }, {
                kind: `cell`,
                cells: [{ x: -2, y: 1 }],
                color: theme.colors.highlightYellow,
            },
            {
                kind: `cell`,
                cells: [{ x: 1, y: 0 }],
                color: theme.colors.highlightBlue,
            }, {
                kind: `cell`,
                cells: [{ x: 1, y: 1 }],
                color: theme.colors.highlightBlue,
            }
        ]);
        return previewController;
    }, [theme]);

    return (
        <GameBoardRenderer
            className="h-full w-full"
            state={previewBoard}
            controller={controller}
            options={{
                viewInteractions: false,
                cellInteractions: false,
                theme,
            }}
        />
    );
}

function ThemePreferenceCard() {
    const { t } = useTranslation()
    const queryPreferences = useQueryAccountPreferences();
    const mutatePreference = useMutation({ mutationFn: updateAccountPreferences });
    const savedTheme = queryPreferences.data?.preferences.boardTheme ?? `normal`;
    const selectedTheme = mutatePreference.isPending
        ? mutatePreference.variables?.boardTheme ?? savedTheme
        : savedTheme;
    const selectedChoice = themeChoices.find(choice => choice.id === selectedTheme)
        ?? themeChoices[0];

    return (
        <section className="max-w-xl rounded-3xl border border-white/10 bg-slate-950/45 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                {t('boardTheme', 'Board Theme')}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
                {t('chooseHowCellsAndBoardColorsAreRendered', 'Choose how cells and board colors are rendered.')}
            </p>

            <div className={"flex flex-col gap-4 mt-4 md:flex-row"}>
                <div className="flex flex-col flex-1 justify-stretch gap-2">
                    {themeChoices.map(choice => {
                        const selected = choice.id === selectedTheme;
                        return (
                            <button
                                key={choice.id}
                                type="button"
                                disabled={queryPreferences.isLoading || mutatePreference.isPending}
                                onClick={() => {
                                    if (choice.id !== savedTheme) {
                                        mutatePreference.mutate({ boardTheme: choice.id });
                                    }
                                }}
                                className={`flex-1 rounded-xl cursor-pointer border px-4 py-3 text-left transition ${selected
                                    ? `border-sky-400 bg-sky-400/10 ring-1 ring-sky-400`
                                    : `border-white/10 bg-slate-900/60 hover:border-white/30`
                                    } disabled:cursor-wait disabled:opacity-70`}
                            >
                                <div className="font-semibold text-white">{choice.label(t)}</div>
                                <div className="mt-1 text-xs text-slate-400">{choice.description(t)}</div>
                            </button>
                        );
                    })}
                </div>

                <div className={cn(
                    "overflow-hidden rounded-xl border border-white/10 bg-slate-900/60",
                    "flex flex-1 w-full h-64",
                    "min-h-10 max-h-64 min-w-10",
                )}>
                    <ThemePreview theme={selectedChoice.theme} />
                </div>
            </div>

            <div className="mt-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                {mutatePreference.isPending
                    ? t('saving', 'Saving...')
                    : mutatePreference.isError
                        ? t('couldNotSave', 'Could not save')
                        : t('saved', 'Saved')}
            </div>
        </section >
    );
}

function PreferenceSwitchCard({
    label,
    description,
    preference,
}: {
    label: string,
    description: string,
    preference: BooleanPreference,
}) {
    const { t } = useTranslation()
    const queryPreferences = useQueryAccountPreferences();
    const mutatePreference = useMutation({ mutationFn: updateAccountPreferences });

    const savedValue = queryPreferences.data?.preferences[preference] === true;
    const optimisticValue = mutatePreference.isPending ? !savedValue : savedValue;

    return (
        <div className="max-w-xl rounded-3xl border border-white/10 bg-slate-950/45 p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                        {label}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                        {description}
                    </p>

                    <div className="mt-3 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                        {mutatePreference.isPending
                            ? t('saving', 'Saving...')
                            : optimisticValue
                                ? t('enabled', 'Enabled')
                                : t('disabled', 'Disabled')}
                    </div>
                </div>

                <Switch
                    checked={optimisticValue}
                    onClick={() => mutatePreference.mutate({ [preference]: !savedValue })}
                    disabled={queryPreferences.isLoading || mutatePreference.isPending}
                />
            </div>
        </div>
    );
}

function AccountPreferencesScreen() {
    const { t } = useTranslation()
    return (
        <PageCorpus
            category="Preferences"
            title={t('accountPreferences', 'Account Preferences')}
            description={t('manageYourPersonalGameplayDisplayAndMatchmakingSettings', 'Manage your personal gameplay, display, and matchmaking settings.')}
        >
            <div className="grid gap-4 lg:grid-cols-1 mx-4">
                <ThemePreferenceCard />

                <PreferenceSwitchCard
                    label={t('zenModeIngame', 'Zen Mode In-Game')}
                    description={t('hideEloNumbersFromTheLiveMatchHudSoYouCanFocusOnTheBoardWhilePlaying', 'Hide Elo numbers from the live match HUD so you can focus on the board while playing.')}
                    preference="zenModeInGame"
                />

                <PreferenceSwitchCard
                    label={t('autoplaceOpeningTile', 'Auto-Place Opening Tile')}
                    description={t('automaticallyPlaceTheOpeningTileAt00WhenANewMatchStartsAndItIsYourTurn', 'Automatically place the opening tile at "0,0" when a new match starts and it is your turn.')}
                    preference="autoPlaceOriginTile"
                />

                <PreferenceSwitchCard
                    label={t('allowSelfjoiningCasualLobbies', 'Allow Self-Joining Casual Lobbies')}
                    description={t('allowYouToJoinYourOwnOnlineCasualLobbyAsTheSecondPlayer', 'Allow you to join your own online casual lobby as the second player.')}
                    preference="allowSelfJoinCasualGames"
                />
            </div>
        </PageCorpus>
    );
}

export default AccountPreferencesScreen;
