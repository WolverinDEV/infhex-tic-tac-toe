import { ExpressAuth, type ExpressAuthConfig } from '@auth/express';
import _Credentials from '@auth/express/providers/credentials';
import _Discord, { type DiscordProfile } from '@auth/express/providers/discord';
import { getToken, type JWT } from '@auth/core/jwt';
import { type AccountPreferences, type ClientToServerEvents, DEFAULT_ACCOUNT_PREFERENCES, type ServerToClientEvents } from '@ih3t/shared';
import type { Request } from 'express';
import type { Socket } from 'socket.io';
import { inject, injectable } from 'tsyringe';

import { ServerConfig } from '../config/serverConfig';
import { CorsConfiguration } from '../network/cors';
import { type AccountUserProfile, AuthRepository } from './authRepository';

/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const Discord: typeof _Discord = (_Discord as any).default ?? _Discord;
/* eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const Credentials: typeof _Credentials = (_Credentials as any).default ?? _Credentials;

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
    private readonly authSecret: string;
    private readonly useSecureCookies: boolean;

    constructor(
        @inject(ServerConfig) serverConfig: ServerConfig,
        @inject(CorsConfiguration) corsConfiguration: CorsConfiguration,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
    ) {
        this.authSecret = serverConfig.authSecret;
        this.useSecureCookies = process.env.NODE_ENV === `production`;

        this.config = {
            trustHost: true,
            secret: serverConfig.authSecret,
            adapter: authRepository,
            pages: {
                signIn: `/login`,
            },
            session: {
                strategy: `jwt`,
            },
            useSecureCookies: this.useSecureCookies,
            cookies: {
                sessionToken: {
                    name: this.sessionCookieName,
                    options: {
                        httpOnly: true,
                        sameSite: `lax`,
                        path: `/`,
                        secure: this.useSecureCookies,
                    },
                },
            },
            providers: [
                Credentials({
                    name: `Username and Password`,
                    credentials: {
                        username: {
                            label: `Username`,
                            type: `text`,
                        },
                        password: {
                            label: `Password`,
                            type: `password`,
                        },
                    },
                    authorize: async (credentials) => {
                        if (!credentials?.username || !credentials.password) {
                            return null;
                        }

                        return await this.authRepository.verifyCredentialsUser(
                            String(credentials.username),
                            String(credentials.password),
                        );
                    },
                }),
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
                async signIn({ account, profile }) {
                    if (account?.provider !== `discord`) {
                        return true;
                    }

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
                async jwt({ token, user }) {
                    if (user) {
                        token.sub = user.id;
                        token.name = user.name;
                        token.email = user.email;
                        token.picture = user.image;
                    }

                    return token;
                },
                async session({ session, token }) {
                    const sessionUser = session.user as typeof session.user & SessionUserShape;
                    sessionUser.id = typeof token.sub === `string` ? token.sub : ``;
                    sessionUser.name = typeof token.name === `string` ? token.name : null;
                    sessionUser.email = typeof token.email === `string` ? token.email : ``;
                    sessionUser.image = typeof token.picture === `string` ? token.picture : null;
                    return session;
                },
            },
        };

        this.handler = ExpressAuth(this.config);
    }

    async getUserFromRequest(request: Request): Promise<AccountUserProfile | null> {
        const token = await this.getSessionJwt({
            cookie: request.get(`cookie`) ?? null,
            authorization: request.get(`authorization`) ?? null,
        });
        return typeof token?.sub === `string`
            ? await this.authRepository.getAuthenticatedUserProfileById(token.sub)
            : null;
    }

    async getUserFromSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents>): Promise<AccountUserProfile | null> {
        const token = await this.getSessionJwt({
            cookie: typeof socket.handshake.headers.cookie === `string` ? socket.handshake.headers.cookie : null,
            authorization: typeof socket.handshake.headers.authorization === `string` ? socket.handshake.headers.authorization : null,
        });
        return typeof token?.sub === `string`
            ? await this.authRepository.getAuthenticatedUserProfileById(token.sub)
            : null;
    }

    async getUserPreferences(userId: string): Promise<AccountPreferences> {
        return await this.authRepository.getAccountPreferences(userId) ?? DEFAULT_ACCOUNT_PREFERENCES;
    }

    private async getSessionJwt(headers: {
        cookie: string | null
        authorization: string | null
    }): Promise<JWT | null> {
        if (!headers.cookie && !headers.authorization) {
            return null;
        }

        const requestHeaders = new Headers();
        if (headers.cookie) {
            requestHeaders.set(`cookie`, headers.cookie);
        }

        if (headers.authorization) {
            requestHeaders.set(`authorization`, headers.authorization);
        }

        return await getToken({
            req: {
                headers: requestHeaders,
            },
            secret: this.authSecret,
            secureCookie: this.useSecureCookies,
            cookieName: this.sessionCookieName,
        });
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
