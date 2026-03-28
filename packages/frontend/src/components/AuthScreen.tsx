import type { AccountProfile } from '@ih3t/shared';
import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';

import { getSignInErrorMessage, registerCredentialsAccount, signInWithCredentials, signInWithDiscord } from '../query/authClient';
import PageCorpus from './PageCorpus';

type AuthScreenProps = {
    account: AccountProfile | null
    isLoading: boolean
};

function resolveCallbackPath(callbackUrl: string | null): string {
    try {
        const fallbackOrigin = typeof window === `undefined` ? `http://localhost:3000` : window.location.origin;
        const target = new URL(callbackUrl ?? `/`, fallbackOrigin);
        if (typeof window !== `undefined` && target.origin !== window.location.origin) {
            return `/`;
        }

        return `${target.pathname}${target.search}${target.hash}` || `/`;
    } catch {
        return `/`;
    }
}

function AuthScreen({ account, isLoading }: Readonly<AuthScreenProps>) {
    const [searchParams] = useSearchParams();
    const callbackPath = resolveCallbackPath(searchParams.get(`callbackUrl`));
    const callbackUrl = typeof window === `undefined`
        ? callbackPath
        : new URL(callbackPath, window.location.origin).toString();

    const [signInUsername, setSignInUsername] = useState(``);
    const [signInPassword, setSignInPassword] = useState(``);
    const [registerUsername, setRegisterUsername] = useState(``);
    const [registerPassword, setRegisterPassword] = useState(``);
    const [errorMessage, setErrorMessage] = useState<string | null>(getSignInErrorMessage(searchParams.get(`error`)));
    const [activeAction, setActiveAction] = useState<`discord` | `sign-in` | `register` | null>(null);

    if (!isLoading && account) {
        return <Navigate to={callbackPath} replace />;
    }

    const isBusy = activeAction !== null;

    async function handleCredentialsSignIn() {
        setActiveAction(`sign-in`);
        setErrorMessage(null);

        try {
            const result = await signInWithCredentials({
                username: signInUsername,
                password: signInPassword,
            }, callbackUrl);

            if (result.errorMessage) {
                setErrorMessage(result.errorMessage);
                return;
            }

            window.location.assign(result.redirectUrl);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : `Unable to sign in right now.`);
        } finally {
            setActiveAction(current => current === `sign-in` ? null : current);
        }
    }

    async function handleRegister() {
        setActiveAction(`register`);
        setErrorMessage(null);

        try {
            await registerCredentialsAccount({
                username: registerUsername,
                password: registerPassword,
            });

            const result = await signInWithCredentials({
                username: registerUsername,
                password: registerPassword,
            }, callbackUrl);

            if (result.errorMessage) {
                setErrorMessage(result.errorMessage);
                return;
            }

            window.location.assign(result.redirectUrl);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : `Unable to create your account right now.`);
        } finally {
            setActiveAction(current => current === `register` ? null : current);
        }
    }

    async function handleDiscordSignIn() {
        setActiveAction(`discord`);
        setErrorMessage(null);

        try {
            await signInWithDiscord(callbackUrl);
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : `Unable to start Discord sign-in.`);
            setActiveAction(null);
        }
    }

    return (
        <PageCorpus
            category="Account"
            title="Sign In"
            description="Use a local username and password or continue with Discord."
        >
            <div className="px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,31,0.82),rgba(15,23,42,0.68))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.32)]">
                        <div className="text-xs uppercase tracking-[0.28em] text-sky-200/75">
                            Returning Player
                        </div>

                        <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.08em] text-white">
                            Username Login
                        </h2>

                        <div className="mt-5 space-y-4">
                            <label className="block">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                    Username
                                </div>

                                <input
                                    value={signInUsername}
                                    onChange={(event) => setSignInUsername(event.target.value)}
                                    autoComplete="username"
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/45"
                                />
                            </label>

                            <label className="block">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                    Password
                                </div>

                                <input
                                    value={signInPassword}
                                    onChange={(event) => setSignInPassword(event.target.value)}
                                    type="password"
                                    autoComplete="current-password"
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/45"
                                />
                            </label>
                        </div>

                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleCredentialsSignIn()}
                            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-300 disabled:cursor-wait disabled:opacity-70"
                        >
                            {activeAction === `sign-in` ? `Signing In...` : `Sign In`}
                        </button>

                        <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-slate-500">
                            <div className="h-px flex-1 bg-white/10" />
                            <span>Or</span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>

                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDiscordSignIn()}
                            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#5865F2] px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:-translate-y-0.5 hover:bg-[#6f7cff] disabled:cursor-wait disabled:opacity-70"
                        >
                            Continue With Discord
                        </button>
                    </section>

                    <section className="rounded-[1.75rem] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(56,28,0,0.2),rgba(15,23,42,0.7))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
                        <div className="text-xs uppercase tracking-[0.28em] text-amber-100/80">
                            New Account
                        </div>

                        <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.08em] text-white">
                            Register
                        </h2>

                        <p className="mt-3 text-sm leading-6 text-slate-300">
                            Create a local account for browser-based sign-in. You can change your username later from account settings.
                        </p>

                        <div className="mt-5 space-y-4">
                            <label className="block">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                    Username
                                </div>

                                <input
                                    value={registerUsername}
                                    onChange={(event) => setRegisterUsername(event.target.value)}
                                    autoComplete="username"
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/45"
                                />
                            </label>

                            <label className="block">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                    Password
                                </div>

                                <input
                                    value={registerPassword}
                                    onChange={(event) => setRegisterPassword(event.target.value)}
                                    type="password"
                                    autoComplete="new-password"
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/45"
                                />
                            </label>
                        </div>

                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRegister()}
                            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70"
                        >
                            {activeAction === `register` ? `Creating Account...` : `Create Account`}
                        </button>

                        <p className="mt-4 text-xs leading-5 text-slate-400">
                            Passwords must be 8 to 72 characters long. If you already have an account, use the sign-in panel instead.
                        </p>
                    </section>
                </div>

                {errorMessage && (
                    <div className="mt-6 rounded-[1.25rem] border border-rose-300/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
                        {errorMessage}
                    </div>
                )}

                {isLoading && (
                    <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-slate-950/45 px-4 py-4 text-sm text-slate-300">
                        Checking your current session...
                    </div>
                )}

                <div className="mt-6 text-sm text-slate-400">
                    By continuing, you agree to use this account for normal play only. See the <Link to="/rules" className="text-sky-200 transition hover:text-sky-100">game rules</Link> if you need a refresher.
                </div>
            </div>
        </PageCorpus>
    );
}

export default AuthScreen;
