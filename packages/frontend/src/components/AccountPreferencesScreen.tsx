import type { AccountBot, AccountPreferences, AccountProfile } from '@ih3t/shared';
import { useState } from 'react';
import React from 'react';
import { toast } from 'react-toastify';

import { createAccountBot, deleteAccountBot, updateAccountBot, updateAccountPreferences } from '../query/accountClient';
import { signInWithDiscord } from '../query/authClient';
import PageCorpus from './PageCorpus';

function showErrorToast(message: string) {
    toast.error(message, {
        toastId: `error:${message}`,
    });
}

type AccountPreferencesScreenProps = {
    account: AccountProfile | null
    preferences: AccountPreferences | null
    bots: AccountBot[]
    isLoading: boolean
    isPreferencesLoading: boolean
    isBotsLoading: boolean
    errorMessage: string | null
    preferencesErrorMessage: string | null
    botsErrorMessage: string | null
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

type BotManagerProps = {
    bots: AccountBot[]
    isLoading: boolean
    errorMessage: string | null
};

function BotManager({ bots, isLoading, errorMessage }: Readonly<BotManagerProps>) {
    const [editingBotId, setEditingBotId] = useState<string | null>(null);
    const [name, setName] = useState(``);
    const [endpoint, setEndpoint] = useState(``);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletingBotId, setIsDeletingBotId] = useState<string | null>(null);

    const resetForm = () => {
        setEditingBotId(null);
        setName(``);
        setEndpoint(``);
    };

    const handleEdit = (bot: AccountBot) => {
        setEditingBotId(bot.id);
        setName(bot.name);
        setEndpoint(bot.endpoint);
    };

    const handleSave = async () => {
        setIsSaving(true);

        try {
            if (editingBotId) {
                await updateAccountBot(editingBotId, { name, endpoint });
            } else {
                await createAccountBot({ name, endpoint });
            }

            resetForm();
        } catch (error) {
            console.error(`Failed to save bot:`, error);
            showErrorToast(error instanceof Error ? error.message : `Failed to save bot.`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (botId: string) => {
        setIsDeletingBotId(botId);

        try {
            await deleteAccountBot(botId);
            if (editingBotId === botId) {
                resetForm();
            }
        } catch (error) {
            console.error(`Failed to delete bot:`, error);
            showErrorToast(error instanceof Error ? error.message : `Failed to delete bot.`);
        } finally {
            setIsDeletingBotId(null);
        }
    };

    return (
        <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
                        Bot Players
                    </h3>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                        Save up to 20 stateless HTTTX bots tied to your account. Saved bots can be seated directly in new casual lobbies.
                    </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                    {bots.length}
                    /20 saved
                </div>
            </div>

            {isLoading ? (
                <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-8 text-center text-sm text-slate-300">
                    Loading your bots...
                </div>
            ) : errorMessage ? (
                <div className="mt-4 rounded-[1.25rem] border border-rose-300/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
                    {errorMessage}
                </div>
            ) : (
                <React.Fragment>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                {editingBotId ? `Edit Bot` : `Add Bot`}
                            </div>

                            <div className="mt-4 grid gap-3">
                                <label className="grid gap-1.5 text-sm text-slate-200">
                                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                        Bot Name
                                    </span>

                                    <input
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        placeholder="Example Bot"
                                        className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/40"
                                    />
                                </label>

                                <label className="grid gap-1.5 text-sm text-slate-200">
                                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                        Bot Endpoint
                                    </span>

                                    <input
                                        value={endpoint}
                                        onChange={(event) => setEndpoint(event.target.value)}
                                        placeholder="https://example.com/bot"
                                        className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/40"
                                    />
                                </label>

                                <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs leading-5 text-slate-300">
                                    The server verifies `GET /capabilities.json` and currently requires stateless `v1-alpha` support before a bot can be saved.
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={isSaving || name.trim().length === 0 || endpoint.trim().length === 0}
                                    onClick={() => void handleSave()}
                                    className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${isSaving || name.trim().length === 0 || endpoint.trim().length === 0
                                        ? `cursor-not-allowed bg-slate-500/60 text-slate-200`
                                        : `bg-sky-400 text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300`
                                        }`}
                                >
                                    {isSaving ? `Saving...` : editingBotId ? `Update Bot` : `Create Bot`}
                                </button>

                                {(editingBotId || name || endpoint) && (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/12"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                Saved Bots
                            </div>

                            {bots.length === 0 ? (
                                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-6 text-sm text-slate-300">
                                    No bots saved yet.
                                </div>
                            ) : (
                                <div className="mt-4 grid gap-3">
                                    {bots.map((bot) => (
                                        <div key={bot.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-white">
                                                        {bot.name}
                                                    </div>

                                                    <div className="mt-1 break-all text-xs leading-5 text-slate-400">
                                                        {bot.endpoint}
                                                    </div>
                                                </div>

                                                <div className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                                                    stateless
                                                </div>
                                            </div>

                                            {(bot.capabilities.meta.author || bot.capabilities.meta.version) && (
                                                <div className="mt-2 text-xs text-slate-300">
                                                    {[bot.capabilities.meta.author, bot.capabilities.meta.version].filter(Boolean).join(` • `)}
                                                </div>
                                            )}

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(bot)}
                                                    className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/12"
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    type="button"
                                                    disabled={isDeletingBotId === bot.id}
                                                    onClick={() => void handleDelete(bot.id)}
                                                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${isDeletingBotId === bot.id
                                                        ? `cursor-not-allowed bg-slate-500/60 text-slate-200`
                                                        : `bg-rose-500/85 text-white transition hover:bg-rose-400`
                                                        }`}
                                                >
                                                    {isDeletingBotId === bot.id ? `Deleting...` : `Delete`}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </React.Fragment>
            )}
        </section>
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
    bots,
    isLoading,
    isPreferencesLoading,
    isBotsLoading,
    errorMessage,
    preferencesErrorMessage,
    botsErrorMessage,
}: Readonly<AccountPreferencesScreenProps>) {
    const [savingPreferenceKey, setSavingPreferenceKey] = useState<keyof AccountPreferences | null>(null);

    const handleSignIn = async () => {
        try {
            await signInWithDiscord();
        } catch (error) {
            console.error(`Failed to start Discord sign in:`, error);
            showErrorToast(error instanceof Error ? error.message : `Failed to start Discord sign in.`);
        }
    };

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
                                Sign in with Discord to manage your account preferences.
                            </p>

                            <button
                                onClick={() => void handleSignIn()}
                                className="mt-6 rounded-full bg-[#5865F2] px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-[#6f7cff]"
                            >
                                Sign In With Discord
                            </button>
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

                        <BotManager
                            bots={bots}
                            isLoading={isBotsLoading}
                            errorMessage={botsErrorMessage}
                        />
                    </React.Fragment>
                )}
            </div>
        </PageCorpus>
    );
}

export default AccountPreferencesScreen;
