import type { AccountPreferences, AccountProfile } from '@ih3t/shared';
import { useState } from 'react';
import React from 'react';
import { Link } from 'react-router';
import { toast } from 'react-toastify';

import { updateAccountPreferences } from '../query/accountClient';
import PageCorpus from './PageCorpus';

function showErrorToast(message: string) {
    toast.error(message, {
        toastId: `error:${message}`,
    });
}

type AccountPreferencesScreenProps = {
    account: AccountProfile | null
    preferences: AccountPreferences | null
    isLoading: boolean
    isPreferencesLoading: boolean
    errorMessage: string | null
    preferencesErrorMessage: string | null
};

function PreferencesLoadingState() {
    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-300">
            Loading your preferences...
        </div>
    );
}

function PreferencesErrorState({ message }: Readonly<{ message: string }>) {
    return (
        <div className="rounded-[1.25rem] border border-rose-300/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
            {message}
        </div>
    );
}

type PreferenceSwitchCardProps = {
    label: string
    description: string
    checked: boolean
    disabled: boolean
    isSaving: boolean
    onToggle: (nextChecked: boolean) => void
};

function PreferenceSwitchCard({
    label,
    description,
    checked,
    disabled,
    isSaving,
    onToggle,
}: Readonly<PreferenceSwitchCardProps>) {
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
                        {isSaving ? `Saving...` : checked ? `Enabled` : `Disabled`}
                    </div>
                </div>

                <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-label={label}
                    disabled={disabled}
                    onClick={() => onToggle(!checked)}
                    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition ${checked
                        ? `border-sky-300/50 bg-sky-400/80`
                        : `border-white/10 bg-slate-800/90`
                    } ${disabled ? `cursor-wait opacity-70` : `cursor-pointer`}`}
                >
                    <span
                        className={`inline-block h-6 w-6 rounded-full bg-white shadow-[0_6px_16px_rgba(15,23,42,0.25)] transition ${checked ? `translate-x-7` : `translate-x-1`
                        }`}
                    />
                </button>
            </div>
        </div>
    );
}

function AccountPreferencesScreen({
    account,
    preferences,
    isLoading,
    isPreferencesLoading,
    errorMessage,
    preferencesErrorMessage,
}: Readonly<AccountPreferencesScreenProps>) {
    const [savingPreferenceKey, setSavingPreferenceKey] = useState<keyof AccountPreferences | null>(null);

    async function handlePreferenceToggle<PreferenceKey extends keyof AccountPreferences>(
        key: PreferenceKey,
        nextValue: AccountPreferences[PreferenceKey],
    ) {
        if (!account || !preferences) {
            return;
        }

        const nextPreferences = {
            ...preferences,
            [key]: nextValue,
        };

        setSavingPreferenceKey(key);

        try {
            await updateAccountPreferences(nextPreferences);
        } catch (error) {
            console.error(`Failed to update account preferences:`, error);
            showErrorToast(error instanceof Error ? error.message : `Failed to update account preferences.`);
        } finally {
            setSavingPreferenceKey(currentKey => (currentKey === key ? null : currentKey));
        }
    }

    const isSavingPreference = savingPreferenceKey !== null;

    return (
        <PageCorpus
            category="Preferences"
            title="Account Preferences"
            description="Manage your personal gameplay, display, and matchmaking settings."
        >
            <div className="min-h-0 flex-1 px-4 pb-4 sm:px-6 sm:pb-6">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center rounded-[1.75rem] border border-white/10 bg-white/6 px-6 py-10 text-center text-slate-300">
                        Loading your account...
                    </div>
                ) : errorMessage ? (
                    <div className="rounded-3xl border border-rose-300/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                        {errorMessage}
                    </div>
                ) : !account ? (
                    <div className="flex h-full items-center justify-center">
                        <section className="w-full max-w-2xl rounded-[1.75rem] border border-amber-300/20 bg-amber-300/10 p-6 text-center shadow-[0_20px_80px_rgba(15,23,42,0.35)] sm:p-8">
                            <div className="text-xs uppercase tracking-[0.3em] text-amber-100/90">
                                Preferences Access
                            </div>

                            <h2 className="mt-4 text-3xl font-black uppercase tracking-[0.08em] text-white">
                                Sign In Required
                            </h2>

                            <p className="mt-4 text-sm leading-6 text-amber-50/85 sm:text-base">
                                Sign in to manage your account preferences.
                            </p>

                            <Link
                                to="/login"
                                className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
                            >
                                Sign In
                            </Link>
                        </section>
                    </div>
                ) : (
                    <React.Fragment>
                        <div className="mt-6">
                            {isPreferencesLoading ? (
                                <PreferencesLoadingState />
                            ) : preferencesErrorMessage ? (
                                <PreferencesErrorState message={preferencesErrorMessage} />
                            ) : preferences ? (
                                <div className="grid gap-4 lg:grid-cols-1">
                                    {/* <PreferenceSwitchCard
                    label="Turn Move Confirmation"
                    description="Require move confirmation before a turn is played."
                    checked={preferences.moveConfirmation}
                    disabled={isSavingPreference}
                    isSaving={savingPreferenceKey === 'moveConfirmation'}
                    onToggle={(nextChecked) => void handlePreferenceToggle('moveConfirmation', nextChecked)}
                  /> */}
                                    <PreferenceSwitchCard
                                        label="Show Tile Piece Markers"
                                        description={`Show visual "X" and "O" markers on hex tiles.`}
                                        checked={preferences.tilePieceMarkers}
                                        disabled={isSavingPreference}
                                        isSaving={savingPreferenceKey === `tilePieceMarkers`}
                                        onToggle={(nextChecked) => void handlePreferenceToggle(`tilePieceMarkers`, nextChecked)}
                                    />

                                    <PreferenceSwitchCard
                                        label="Zen Mode In-Game"
                                        description="Hide Elo numbers from the live match HUD so you can focus on the board while playing."
                                        checked={preferences.zenModeInGame}
                                        disabled={isSavingPreference}
                                        isSaving={savingPreferenceKey === `zenModeInGame`}
                                        onToggle={(nextChecked) => void handlePreferenceToggle(`zenModeInGame`, nextChecked)}
                                    />

                                    <PreferenceSwitchCard
                                        label="Auto-Place Opening Tile"
                                        description={`Automatically place the opening tile at "0,0" when a new match starts and it is your turn.`}
                                        checked={preferences.autoPlaceOriginTile}
                                        disabled={isSavingPreference}
                                        isSaving={savingPreferenceKey === `autoPlaceOriginTile`}
                                        onToggle={(nextChecked) => void handlePreferenceToggle(`autoPlaceOriginTile`, nextChecked)}
                                    />

                                    <PreferenceSwitchCard
                                        label="Allow Self-Joining Casual Lobbies"
                                        description="Allow you to join your own online casual lobby as the second player."
                                        checked={preferences.allowSelfJoinCasualGames}
                                        disabled={isSavingPreference}
                                        isSaving={savingPreferenceKey === `allowSelfJoinCasualGames`}
                                        onToggle={(nextChecked) => void handlePreferenceToggle(`allowSelfJoinCasualGames`, nextChecked)}
                                    />
                                </div>
                            ) : (
                                <PreferencesErrorState message="Your preferences are not available right now." />
                            )}
                        </div>

                        <div className="mt-4 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                            {isSavingPreference ? `Saving your latest preference change...` : `Changes save automatically.`}
                        </div>
                    </React.Fragment>
                )}
            </div>
        </PageCorpus>
    );
}

export default AccountPreferencesScreen;
