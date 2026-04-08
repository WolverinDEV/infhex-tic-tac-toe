import type { AccountProfile } from '@ih3t/shared';
import { useState } from 'react';
import { toast } from 'react-toastify';

import { listDevAuthUsers, signInWithDevUser, signOutDevUser } from '../query/devAuthClient';

function PermissionBadge({
    label,
    tone,
}: {
    label: string
    tone: `default` | `warning` | `accent`
}) {
    const className = tone === `warning`
        ? `bg-amber-300/18 text-amber-100`
        : tone === `accent`
            ? `bg-sky-300/18 text-sky-100`
            : `bg-white/10 text-slate-200`;

    return (
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${className}`}>
            {label}
        </span>
    );
}

function DevAuthPanel({ account }: { account: AccountProfile | null }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [users, setUsers] = useState<AccountProfile[]>([]);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);

    if (!import.meta.env.DEV) {
        return null;
    }

    const loadUsers = async () => {
        try {
            setIsLoadingUsers(true);
            const response = await listDevAuthUsers();
            setUsers(response.users);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : `Failed to load development users.`;
            toast.error(message, {
                toastId: `error:${message}`,
            });
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const handleToggle = () => {
        const nextOpen = !isOpen;
        setIsOpen(nextOpen);
        if (nextOpen && users.length === 0 && !isLoadingUsers) {
            void loadUsers();
        }
    };

    const handleSignIn = async (userId: string) => {
        try {
            setPendingUserId(userId);
            const response = await signInWithDevUser(userId);
            toast.success(`Signed in as ${response.user?.username ?? `development user`}.`, {
                toastId: `success:dev-sign-in:${userId}`,
            });
            setIsOpen(false);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : `Failed to sign in as the selected development user.`;
            toast.error(message, {
                toastId: `error:${message}`,
            });
        } finally {
            setPendingUserId(null);
        }
    };

    const handleSignOut = async () => {
        try {
            setPendingUserId(`logout`);
            await signOutDevUser();
            toast.success(`Signed out of the development session.`, {
                toastId: `success:dev-sign-out`,
            });
            setIsOpen(false);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : `Failed to sign out of the development session.`;
            toast.error(message, {
                toastId: `error:${message}`,
            });
        } finally {
            setPendingUserId(null);
        }
    };

    return (
        <div className="relative self-start lg:self-auto">
            <button
                type="button"
                onClick={handleToggle}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-400/18 sm:text-[11px]"
            >
                {account ? `Switch Mock User` : `Mock Sign In`}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-[1.5rem] border border-emerald-300/18 bg-slate-950/95 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.5)] backdrop-blur-xl">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                        Development Auth
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                        Seeded local users for testing community events, official organizer access, and player check-in flows.
                    </p>

                    <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                        {isLoadingUsers ? (
                            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm text-slate-300">
                                Loading mock users...
                            </div>
                        ) : users.map((user) => {
                            const isSelected = account?.id === user.id;
                            const isPending = pendingUserId === user.id;

                            return (
                                <button
                                    key={user.id}
                                    type="button"
                                    onClick={() => void handleSignIn(user.id)}
                                    disabled={isPending}
                                    className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${isSelected
                                        ? `border-emerald-300/35 bg-emerald-400/12`
                                        : `border-white/10 bg-white/6 hover:bg-white/10`
                                    } disabled:cursor-wait disabled:opacity-60`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-white">
                                                {user.username}
                                            </div>

                                            <div className="truncate text-xs text-slate-400">
                                                {user.email ?? user.id}
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                            {user.role === `admin` && <PermissionBadge label="Admin" tone="warning" />}
                                            {user.role !== `admin` && user.permissions.length === 0 && (
                                                <PermissionBadge label="Player" tone="default" />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {account && (
                        <button
                            type="button"
                            onClick={() => void handleSignOut()}
                            disabled={pendingUserId === `logout`}
                            className="mt-4 w-full rounded-full border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-rose-100 transition hover:bg-rose-500/18 disabled:cursor-wait disabled:opacity-60"
                        >
                            Clear Mock Session
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default DevAuthPanel;
