import { randomUUID } from 'node:crypto';

import createSealEngine from '@ih3t/bot-engine-seal';
import type {
    BotEngineInterface,
    CreateTournamentRequest,
    GameState,
    HexCoordinate,
    TournamentDetail,
    TournamentMatch,
    TournamentParticipant,
} from '@ih3t/shared';
import {
    applyGameMove,
    cloneGameState,
    getCellKey,
    isCellWithinPlacementRadius,
} from '@ih3t/shared';
import { inject, injectable } from 'tsyringe';

import { type AccountUserProfile, AuthRepository } from '../auth/authRepository';
import { ServerConfig } from '../config/serverConfig';
import { SessionError, SessionManager } from '../session/sessionManager';
import type { ServerGameSession } from '../session/types';
import { type TournamentRecord, TournamentRepository } from '../tournament/tournamentRepository';
import { TournamentService } from '../tournament/tournamentService';

const kBaseDevPlayerCount = 16;
const kQuickSealBotTournamentEntrants = 8;
const kSealBotTournamentTickIntervalMs = 250;
const kSealBotTournamentMoveDelayMs = 900;
const kSealBotTournamentReconcileIntervalMs = 1_000;
const kSealBotSuggestionTimeoutMs = 120;

type DevTournamentSeedState = `registered` | `checked-in`;

type DevUserSeed = {
    username: string;
    email: string;
    image?: string | null;
    role?: AccountUserProfile[`role`];
    permissions?: AccountUserProfile[`permissions`];
};

type DevAutoplaySessionState = {
    nextMoveAt: number;
    pendingMovesByPlayerId: Map<string, HexCoordinate[]>;
};

type DevAutoplayTournamentState = {
    sessions: Map<string, DevAutoplaySessionState>;
};

function isActiveParticipant(participant: TournamentParticipant): boolean {
    return participant.status !== `removed` && participant.status !== `dropped`;
}

function createActivity(message: string): TournamentRecord[`activity`][number] {
    return {
        id: randomUUID(),
        timestamp: Date.now(),
        actorProfileId: null,
        actorDisplayName: `Development Helper`,
        type: `dev-helper`,
        message,
    };
}

function canManageTournament(user: AccountUserProfile | null, tournament: TournamentRecord): boolean {
    if (!user) {
        return false;
    }

    if (user.role === `admin`) {
        return true;
    }

    return tournament.createdByProfileId === user.id
        || tournament.organizers?.includes(user.id) === true;
}

@injectable()
export class DevSupportService {
    private readonly autoplayTournaments = new Map<string, DevAutoplayTournamentState>();
    private autoplayInterval: ReturnType<typeof setInterval> | null = null;
    private autoplayTickInFlight = false;
    private nextAutoplayReconcileAt = 0;
    private sealBotEnginePromise: Promise<BotEngineInterface> | null = null;

    constructor(
        @inject(ServerConfig) private readonly serverConfig: ServerConfig,
        @inject(AuthRepository) private readonly authRepository: AuthRepository,
        @inject(SessionManager) private readonly sessionManager: SessionManager,
        @inject(TournamentRepository) private readonly tournamentRepository: TournamentRepository,
        @inject(TournamentService) private readonly tournamentService: TournamentService,
    ) {}

    isEnabled(): boolean {
        return this.serverConfig.isDevelopment;
    }

    async listDevUsers(): Promise<AccountUserProfile[]> {
        this.assertEnabled();
        const { users } = await this.ensureDevUsers(kBaseDevPlayerCount);
        return users;
    }

    async loginDevUser(userId: string): Promise<{
        user: AccountUserProfile;
        sessionToken: string;
        expires: Date;
    }> {
        this.assertEnabled();
        await this.ensureDevUsers(kBaseDevPlayerCount);

        const user = await this.authRepository.getUserProfileById(userId);
        if (!user) {
            throw new SessionError(`Development user not found.`);
        }

        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const sessionToken = await this.authRepository.createSessionTokenForUser(user.id, expires);
        return {
            user,
            sessionToken,
            expires,
        };
    }

    async createQuickSealBotTournament(actor: AccountUserProfile): Promise<TournamentDetail> {
        this.assertEnabled();

        const request: CreateTournamentRequest = {
            name: `Seal Bot Test ${new Date().toLocaleTimeString()}`,
            format: `double-elimination`,
            visibility: `private`,
            scheduledStartAt: Date.now() + 60_000,
            checkInWindowMinutes: 5,
            maxPlayers: kQuickSealBotTournamentEntrants,
            timeControl: { mode: `turn`, turnTimeMs: 20_000 },
            seriesSettings: {
                earlyRoundsBestOf: 1,
                finalsBestOf: 1,
                grandFinalBestOf: 1,
                grandFinalResetEnabled: false,
            },
            matchJoinTimeoutMinutes: 5,
        };

        const createdTournament = await this.tournamentService.createTournament(actor, request);
        await this.seedTournament(createdTournament.id, actor, {
            count: kQuickSealBotTournamentEntrants,
            state: `checked-in`,
        });
        await this.tournamentService.startTournament(createdTournament.id, actor);

        this.enableTournamentAutoplay(createdTournament.id);
        await this.tickAutoplayTournaments();
        await this.sessionManager.tickAllSessions();

        const tournament = await this.tournamentService.getTournamentDetail(createdTournament.id, actor);
        if (!tournament) {
            throw new SessionError(`The development tournament could not be loaded after creation.`);
        }

        return tournament;
    }

    async seedTournament(
        tournamentId: string,
        actor: AccountUserProfile,
        options: {
            count: number;
            state: DevTournamentSeedState;
        },
    ): Promise<{
        addedCount: number;
        tournament: TournamentRecord;
    }> {
        this.assertEnabled();

        const tournament = await this.tournamentRepository.getTournament(tournamentId);
        if (!tournament) {
            throw new SessionError(`Tournament not found.`);
        }

        if (!canManageTournament(actor, tournament)) {
            throw new SessionError(`Only tournament organizers can use the development seeding helper.`);
        }

        if (tournament.status === `live` || tournament.status === `completed` || tournament.status === `cancelled`) {
            throw new SessionError(`Development seeding is only available before the tournament goes live.`);
        }

        if (options.state === `checked-in` && tournament.status === `draft`) {
            throw new SessionError(`Publish the tournament before seeding checked-in entrants.`);
        }

        const activeParticipants = tournament.participants.filter(isActiveParticipant);
        const remainingSlots = tournament.maxPlayers - activeParticipants.length;
        const requestedCount = Math.max(1, Math.floor(options.count));
        const addCount = Math.min(requestedCount, remainingSlots);
        if (addCount <= 0) {
            return {
                addedCount: 0,
                tournament,
            };
        }

        const now = Date.now();
        if (options.state === `checked-in` && tournament.status === `registration-open`) {
            tournament.status = `check-in-open`;
            tournament.checkInOpensAt = now;
            tournament.updatedAt = now;
            tournament.activity.unshift(createActivity(`Development helper opened tournament check-in early.`));

            for (const participant of tournament.participants) {
                if (participant.status === `registered`) {
                    participant.checkInState = `pending`;
                }
            }
        }

        const activeProfileIds = new Set(activeParticipants.map((participant) => participant.profileId));
        const devPoolSize = Math.max(kBaseDevPlayerCount, tournament.maxPlayers, activeParticipants.length + addCount + 8);
        const { players } = await this.ensureDevUsers(devPoolSize);
        const availablePlayers = players.filter((player) =>
            !activeProfileIds.has(player.id)
            && player.id !== actor.id
            && player.id !== tournament.createdByProfileId);

        if (availablePlayers.length < addCount) {
            throw new SessionError(`Not enough development users are available to seed this tournament.`);
        }

        const shouldCheckIn = options.state === `checked-in` && tournament.status === `check-in-open`;
        for (const player of availablePlayers.slice(0, addCount)) {
            tournament.participants.push({
                profileId: player.id,
                displayName: player.username,
                image: player.image,
                registeredAt: now,
                checkedInAt: shouldCheckIn ? now : null,
                seed: null,
                status: shouldCheckIn ? `checked-in` : `registered`,
                checkInState: shouldCheckIn ? `checked-in` : tournament.status === `check-in-open` ? `pending` : `not-open`,
                isManual: true,
                removedAt: null,
                eliminatedAt: null,
                replacedByProfileId: null,
                replacesProfileId: null,
            });
        }

        tournament.updatedAt = Date.now();
        tournament.activity.unshift(createActivity(`Development helper added ${addCount} mock entrants as ${shouldCheckIn ? `checked-in players` : `registered players`}.`));
        await this.tournamentRepository.saveTournament(tournament);

        return {
            addedCount: addCount,
            tournament,
        };
    }

    /**
     * Resolve all unfinished matches in the current round by awarding walkovers
     * to the higher-seeded (left slot) player. Returns count of resolved matches.
     */
    async resolveCurrentRound(
        tournamentId: string,
        actor: AccountUserProfile,
    ): Promise<{ resolved: number }> {
        this.assertEnabled();

        const tournament = await this.tournamentRepository.getTournament(tournamentId);
        if (!tournament) throw new SessionError(`Tournament not found.`);
        if (!canManageTournament(actor, tournament)) throw new SessionError(`Only organizers can use dev helpers.`);
        if (tournament.status !== `live`) throw new SessionError(`Tournament is not live.`);

        const unresolvedMatches = tournament.matches.filter((m) =>
            m.state === `pending` || m.state === `ready` || m.state === `in-progress`);
        if (unresolvedMatches.length === 0) return { resolved: 0 };

        // Find the current round: lowest round number among unresolved matches
        const currentRound = this.getCurrentRoundMatches(unresolvedMatches);

        let resolved = 0;
        for (const match of currentRound) {
            const winnerId = this.pickWinner(match);
            if (winnerId) {
                await this.tournamentService.awardWalkover(tournamentId, match.id, winnerId, actor);
                resolved++;
            }
        }

        return { resolved };
    }

    /**
     * Resolve ALL remaining matches until the tournament completes.
     */
    async resolveAll(
        tournamentId: string,
        actor: AccountUserProfile,
    ): Promise<{ resolved: number }> {
        this.assertEnabled();

        let totalResolved = 0;
        for (let safety = 0; safety < 100; safety++) {
            const result = await this.resolveCurrentRound(tournamentId, actor);
            if (result.resolved === 0) break;
            totalResolved += result.resolved;
        }

        return { resolved: totalResolved };
    }

    /**
     * Resolve a specific number of matches from the current round.
     */
    async resolveN(
        tournamentId: string,
        actor: AccountUserProfile,
        count: number,
    ): Promise<{ resolved: number }> {
        this.assertEnabled();

        const tournament = await this.tournamentRepository.getTournament(tournamentId);
        if (!tournament) throw new SessionError(`Tournament not found.`);
        if (!canManageTournament(actor, tournament)) throw new SessionError(`Only organizers can use dev helpers.`);
        if (tournament.status !== `live`) throw new SessionError(`Tournament is not live.`);

        const unresolvedMatches = tournament.matches.filter((m) =>
            m.state === `pending` || m.state === `ready` || m.state === `in-progress`);
        const currentRound = this.getCurrentRoundMatches(unresolvedMatches);

        let resolved = 0;
        for (const match of currentRound.slice(0, count)) {
            const winnerId = this.pickWinner(match);
            if (winnerId) {
                await this.tournamentService.awardWalkover(tournamentId, match.id, winnerId, actor);
                resolved++;
            }
        }

        return { resolved };
    }

    private enableTournamentAutoplay(tournamentId: string): void {
        if (!this.autoplayTournaments.has(tournamentId)) {
            this.autoplayTournaments.set(tournamentId, {
                sessions: new Map(),
            });
        }

        this.ensureAutoplayLoop();
    }

    private ensureAutoplayLoop(): void {
        if (this.autoplayInterval) {
            return;
        }

        this.autoplayInterval = setInterval(() => {
            void this.tickAutoplayTournaments();
        }, kSealBotTournamentTickIntervalMs);
    }

    private stopAutoplayLoopIfIdle(): void {
        if (this.autoplayTournaments.size > 0 || !this.autoplayInterval) {
            return;
        }

        clearInterval(this.autoplayInterval);
        this.autoplayInterval = null;
    }

    private async tickAutoplayTournaments(): Promise<void> {
        if (this.autoplayTickInFlight) {
            return;
        }

        this.autoplayTickInFlight = true;
        try {
            const now = Date.now();
            if (this.autoplayTournaments.size > 0 && now >= this.nextAutoplayReconcileAt) {
                await this.tournamentService.reconcileAllTournaments();
                this.nextAutoplayReconcileAt = now + kSealBotTournamentReconcileIntervalMs;
            }

            for (const [tournamentId, tournamentState] of this.autoplayTournaments) {
                await this.tickAutoplayTournament(tournamentId, tournamentState);
            }
        } finally {
            this.autoplayTickInFlight = false;
            this.stopAutoplayLoopIfIdle();
        }
    }

    private async tickAutoplayTournament(
        tournamentId: string,
        tournamentState: DevAutoplayTournamentState,
    ): Promise<void> {
        const tournament = await this.tournamentRepository.getTournament(tournamentId);
        if (!tournament || tournament.status === `completed` || tournament.status === `cancelled`) {
            this.autoplayTournaments.delete(tournamentId);
            return;
        }

        if (tournament.status !== `live`) {
            return;
        }

        const activeSessionIds = new Set<string>();
        const now = Date.now();
        for (const match of tournament.matches) {
            if (!match.sessionId) {
                continue;
            }

            activeSessionIds.add(match.sessionId);

            const session = this.sessionManager.getSession(match.sessionId);
            if (!session) {
                continue;
            }

            let sessionState = tournamentState.sessions.get(session.id);
            if (!sessionState) {
                sessionState = {
                    nextMoveAt: 0,
                    pendingMovesByPlayerId: new Map(),
                };
                tournamentState.sessions.set(session.id, sessionState);
            }

            await this.ensureAutoplayPlayers(session);

            if (session.state === `in-game`) {
                await this.advanceAutoplaySession(session, sessionState, now);
            } else if (session.state === `finished`) {
                sessionState.pendingMovesByPlayerId.clear();
                sessionState.nextMoveAt = now + kSealBotTournamentMoveDelayMs;
            }
        }

        for (const sessionId of tournamentState.sessions.keys()) {
            if (!activeSessionIds.has(sessionId)) {
                tournamentState.sessions.delete(sessionId);
            }
        }
    }

    private async ensureAutoplayPlayers(session: ServerGameSession): Promise<void> {
        for (const profileId of session.reservedPlayerProfileIds) {
            let player = session.players.find((participant) => participant.profileId === profileId) ?? null;
            if (!player && session.state === `lobby`) {
                const profile = await this.authRepository.getUserProfileById(profileId);
                if (!profile) {
                    throw new SessionError(`A development bot player could not be found.`);
                }

                const participation = await this.sessionManager.joinSession(session, {
                    deviceId: this.getAutoplayDeviceId(profileId),
                    profile,
                    displayName: profile.username,
                    allowSelfJoinCasualGames: true,
                });

                if (participation.role !== `player`) {
                    throw new SessionError(`A development bot could not claim its reserved tournament seat.`);
                }

                player = participation.participant;
            }

            if (!player) {
                continue;
            }

            if (player.connection.status !== `connected`) {
                this.sessionManager.assignParticipantSocket(
                    session,
                    player.id,
                    this.getAutoplaySocketId(session.id, profileId),
                );
            }
        }
    }

    private async advanceAutoplaySession(
        session: ServerGameSession,
        sessionState: DevAutoplaySessionState,
        now: number,
    ): Promise<void> {
        if (now < sessionState.nextMoveAt) {
            return;
        }

        const playerId = session.gameState.currentTurnPlayerId;
        if (!playerId) {
            return;
        }

        let queuedMoves = sessionState.pendingMovesByPlayerId.get(playerId) ?? [];
        if (queuedMoves.length === 0) {
            queuedMoves = await this.buildAutoplayMoves(session, playerId);
        }

        const nextMove = queuedMoves[0] ?? null;
        if (!nextMove) {
            sessionState.pendingMovesByPlayerId.delete(playerId);
            sessionState.nextMoveAt = now + kSealBotTournamentMoveDelayMs;
            return;
        }

        try {
            await this.sessionManager.placeCell(session, playerId, {
                x: nextMove.x,
                y: nextMove.y,
            });
            const remainingMoves = queuedMoves.slice(1);
            if (remainingMoves.length > 0) {
                sessionState.pendingMovesByPlayerId.set(playerId, remainingMoves);
            } else {
                sessionState.pendingMovesByPlayerId.delete(playerId);
            }
        } catch (error: unknown) {
            if (!(error instanceof SessionError)) {
                throw error;
            }

            sessionState.pendingMovesByPlayerId.delete(playerId);
        }

        sessionState.nextMoveAt = Date.now() + kSealBotTournamentMoveDelayMs;
    }

    private async buildAutoplayMoves(session: ServerGameSession, playerId: string): Promise<HexCoordinate[]> {
        const gameState = cloneGameState(session.gameState);
        if (gameState.currentTurnPlayerId !== playerId || gameState.placementsRemaining <= 0) {
            return [];
        }

        if (gameState.cells.length === 0) {
            return this.sanitizeAutoplayMoves(gameState, playerId, [{ x: 0, y: 0 }]);
        }

        let suggestedMoves: readonly HexCoordinate[] = [];
        try {
            const engine = await this.getSealBotEngine();
            const suggestion = await engine.suggestTurn(cloneGameState(gameState), kSealBotSuggestionTimeoutMs);
            suggestedMoves = suggestion.status === `provide`
                ? suggestion.suggestion
                : [];
        } catch {
            suggestedMoves = [];
        }

        return this.sanitizeAutoplayMoves(gameState, playerId, suggestedMoves);
    }

    private sanitizeAutoplayMoves(
        gameState: GameState,
        playerId: string,
        suggestedMoves: readonly HexCoordinate[],
    ): HexCoordinate[] {
        const simulatedState = cloneGameState(gameState);
        const acceptedMoves: HexCoordinate[] = [];

        for (const move of suggestedMoves) {
            if (simulatedState.currentTurnPlayerId !== playerId || simulatedState.placementsRemaining <= 0) {
                break;
            }

            try {
                applyGameMove(simulatedState, {
                    playerId,
                    x: move.x,
                    y: move.y,
                });
                acceptedMoves.push(move);
            } catch {
                /* Ignore invalid bot suggestions and fill with fallback moves below. */
            }
        }

        while (simulatedState.currentTurnPlayerId === playerId && simulatedState.placementsRemaining > 0) {
            const fallbackMove = this.findFallbackMove(simulatedState, playerId);
            if (!fallbackMove) {
                break;
            }

            applyGameMove(simulatedState, {
                playerId,
                x: fallbackMove.x,
                y: fallbackMove.y,
            });
            acceptedMoves.push(fallbackMove);
        }

        return acceptedMoves;
    }

    private findFallbackMove(gameState: GameState, playerId: string): HexCoordinate | null {
        if (gameState.currentTurnPlayerId !== playerId || gameState.placementsRemaining <= 0) {
            return null;
        }

        if (gameState.cells.length === 0) {
            return { x: 0, y: 0 };
        }

        const occupiedCells = new Set(gameState.cells.map((cell) => getCellKey(cell.x, cell.y)));
        const maxCoordinate = gameState.cells.reduce((currentMax, cell) =>
            Math.max(currentMax, Math.abs(cell.x), Math.abs(cell.y), Math.abs(cell.x + cell.y)), 0);
        const searchRadius = maxCoordinate + 10;

        for (let radius = 0; radius <= searchRadius; radius += 1) {
            for (let x = -radius; x <= radius; x += 1) {
                for (let y = -radius; y <= radius; y += 1) {
                    const cellKey = getCellKey(x, y);
                    if (occupiedCells.has(cellKey)) {
                        continue;
                    }

                    const candidate = { x, y };
                    if (!isCellWithinPlacementRadius(gameState.cells, candidate)) {
                        continue;
                    }

                    const trialState = cloneGameState(gameState);
                    try {
                        applyGameMove(trialState, {
                            playerId,
                            x: candidate.x,
                            y: candidate.y,
                        });
                        return candidate;
                    } catch {
                        /* Keep scanning until we find a legal fallback move. */
                    }
                }
            }
        }

        return null;
    }

    private async getSealBotEngine(): Promise<BotEngineInterface> {
        if (!this.sealBotEnginePromise) {
            this.sealBotEnginePromise = createSealEngine()
                .catch((error: unknown) => {
                    this.sealBotEnginePromise = null;
                    throw error;
                });
        }

        return await this.sealBotEnginePromise;
    }

    private getAutoplayDeviceId(profileId: string): string {
        return `dev-bot:${profileId}`;
    }

    private getAutoplaySocketId(sessionId: string, profileId: string): string {
        return `dev-bot:${sessionId}:${profileId}`;
    }

    private getCurrentRoundMatches(unresolvedMatches: TournamentMatch[]): TournamentMatch[] {
        // Group by bracket, find lowest round per bracket, return those matches
        const byBracket = new Map<string, TournamentMatch[]>();
        for (const m of unresolvedMatches) {
            const list = byBracket.get(m.bracket) ?? [];
            list.push(m);
            byBracket.set(m.bracket, list);
        }

        const result: TournamentMatch[] = [];
        for (const matches of byBracket.values()) {
            const minRound = Math.min(...matches.map((m) => m.round));
            result.push(...matches.filter((m) => m.round === minRound));
        }
        return result;
    }

    private pickWinner(match: TournamentMatch): string | null {
        // Pick left slot (higher seed) as winner, skip byes / TBDs
        const realSlots = match.slots.filter((s) => s.profileId && !s.isBye);
        if (realSlots.length === 0) return null;
        if (realSlots.length === 1) return realSlots[0].profileId;
        // Random winner for variety
        return realSlots[Math.floor(Math.random() * realSlots.length)].profileId!;
    }

    private assertEnabled(): void {
        if (!this.isEnabled()) {
            throw new SessionError(`Development helpers are disabled in production.`);
        }
    }

    private async ensureDevUsers(playerCount: number): Promise<{
        users: AccountUserProfile[];
        players: AccountUserProfile[];
        admin: AccountUserProfile;
    }> {
        const admin = await this.authRepository.createDevUser({
            username: `Dev Admin`,
            email: `dev-admin@ih3t.local`,
            role: `admin`,
        });
        const players = await Promise.all(
            Array.from({ length: Math.max(kBaseDevPlayerCount, playerCount) }, (_, index) =>
                this.authRepository.createDevUser(this.createPlayerSeed(index + 1))),
        );

        return {
            users: [
                admin,
                ...players,
            ],
            players,
            admin,
        };
    }

    private createPlayerSeed(index: number): DevUserSeed {
        const paddedIndex = String(index).padStart(2, `0`);
        return {
            username: `Dev Player ${paddedIndex}`,
            email: `dev-player-${paddedIndex}@ih3t.local`,
            image: null,
        };
    }
}
