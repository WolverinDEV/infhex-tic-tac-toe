import { ExpressAuth, type ExpressAuthConfig } from '@auth/express';
import _Discord, { type DiscordProfile } from '@auth/express/providers/discord';
import { type AccountPreferences, type ClientToServerEvents, DEFAULT_ACCOUNT_PREFERENCES, type ServerToClientEvents } from '@ih3t/shared';
import type { Request } from 'express';
import type { Socket } from 'socket.io';
import { inject, injectable } from 'tsyringe';

import { ServerConfig } from '../config/serverConfig';
import { getCookieValue } from '../network/clientInfo';
import { CorsConfiguration } from '../network/cors';
import { type AccountUserProfile, AuthRepository } from './authRepository';

/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const Discord: typeof _Discord = (_Discord as any).default ?? _Discord;

type SessionUserShape = {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
};

@injectable()
export class AuthService {
    readonly config: ExpressAuthConfig;
    readonly handler: ReturnType<typeof ExpressAuth>;
    readonly sessionCookieName = `ih3t.session-token`;

    constructor(
        @inject(ServerConfig) serverConfig: ServerConfig,
        @inject(CorsConfiguration) corsConfiguration: CorsConfiguration,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
    ) {
        const useSecureCookies = process.env.NODE_ENV === `production`;

        this.config = {
            trustHost: true,
            secret: serverConfig.authSecret,
            adapter: authRepository,
            session: {
                strategy: `database`,
            },
            useSecureCookies,
            cookies: {
                sessionToken: {
                    name: this.sessionCookieName,
                    options: {
                        httpOnly: true,
                        sameSite: `lax`,
                        path: `/`,
                        secure: useSecureCookies,
                    },
                },
            },
            providers: [
                Discord({
                    clientId: serverConfig.discordClientId,
                    clientSecret: serverConfig.discordClientSecret,
                    profile(profile: DiscordProfile) {
                        return {
                            id: profile.id,
                            name: profile.username,
                            email: profile.email,
                            image: getDiscordAvatarUrl(profile),
                        };
                    },
                }),
            ],
            callbacks: {
                async signIn({ profile }) {
                    if (typeof profile?.email === `string` && profile.email.trim().length > 0) {
                        return true;
                    }

                    throw new Error(`Discord did not provide a verified email address for this account.`);
                },
                async redirect({ url, baseUrl }) {
                    if (url.startsWith(`/`)) {
                        return `${baseUrl}${url}`;
                    }

                    try {
                        const target = new URL(url);
                        if (target.origin === baseUrl || corsConfiguration.isAllowedOrigin(target.origin)) {
                            return target.toString();
                        }
                    } catch {
                        return baseUrl;
                    }

                    return baseUrl;
                },
                async session({ session, user }) {
                    const sessionUser = session.user as typeof session.user & SessionUserShape;
                    sessionUser.id = user.id;
                    sessionUser.name = user.name;
                    sessionUser.email = user.email;
                    sessionUser.image = user.image;
                    return session;
                },
            },
        };

        this.handler = ExpressAuth(this.config);
    }

    async getUserFromRequest(request: Request): Promise<AccountUserProfile | null> {
        const sessionToken = getCookieValue(request.get(`cookie`), this.sessionCookieName);
        if (!sessionToken) {
            return null;
        }

        return this.authRepository.getUserProfileBySessionToken(sessionToken);
    }

    async getUserFromSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents>): Promise<AccountUserProfile | null> {
        const sessionToken = getCookieValue(
            typeof socket.handshake.headers.cookie === `string` ? socket.handshake.headers.cookie : null,
            this.sessionCookieName,
        );

        if (!sessionToken) {
            return null;
        }

        return this.authRepository.getUserProfileBySessionToken(sessionToken);
    }

    async getUserPreferences(userId: string): Promise<AccountPreferences> {
        return await this.authRepository.getAccountPreferences(userId) ?? DEFAULT_ACCOUNT_PREFERENCES;
    }
}

function getDiscordAvatarUrl(profile: DiscordProfile): string {
    if (profile.avatar === null) {
        const defaultAvatarNumber = profile.discriminator === `0`
            ? Number(BigInt(profile.id) >> BigInt(22)) % 6
            : Number.parseInt(profile.discriminator, 10) % 5;
        return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNumber}.png`;
    }

    const format = profile.avatar.startsWith(`a_`) ? `gif` : `png`;
    return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
}
