import { inject, injectable } from 'tsyringe';
import { DEFAULT_PLAYER_ELO, EloRepository } from './eloRepository';
import { PlayerRating, PlayerRatingAdjustment } from '@ih3t/shared';

const PROVISIONAL_GAMES_THRESHOLD = 10;
const PROVISIONAL_K_FACTOR = 30;
const ESTABLISHED_K_FACTOR = 15;
const MINIMUM_PLAYER_ELO = 100;

@injectable()
export class EloHandler {
    constructor(
        @inject(EloRepository) private readonly eloRepository: EloRepository
    ) { }

    async getPlayerRating(profileId: string): Promise<PlayerRating> {
        return await this.eloRepository.getPlayerRating(profileId) ?? {
            eloScore: DEFAULT_PLAYER_ELO,
            gameCount: 0
        };
    }

    calculateEloAdjustments(player: PlayerRating, opponent: Pick<PlayerRating, "eloScore">): PlayerRatingAdjustment {
        const expectedScore = this.calculateExpectedScore(player.eloScore, opponent.eloScore);
        return {
            eloGain: this.calculateEloDelta(player, expectedScore, 1),
            eloLoss: this.calculateEloDelta(player, expectedScore, 0)
        }
    }

    async applyGameResult(playerId: string, adjustment: PlayerRatingAdjustment, result: "win" | "loss"): Promise<PlayerRating> {
        const delta = result === "win" ? adjustment.eloGain : adjustment.eloLoss;
        return await this.eloRepository.performEloAdjustment(playerId, delta);
    }

    private calculateExpectedScore(playerElo: number, opponentElo: number): number {
        return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    }

    private calculateEloDelta(playerRating: PlayerRating, expectedScore: number, actualScore: 0 | 1): number {
        const nextElo = Math.max(
            MINIMUM_PLAYER_ELO,
            Math.round(playerRating.eloScore + this.getKFactor(playerRating.gameCount) * (actualScore - expectedScore))
        );
        return nextElo - playerRating.eloScore;
    }

    private getKFactor(ratedGamesPlayed: number): number {
        return ratedGamesPlayed < PROVISIONAL_GAMES_THRESHOLD
            ? PROVISIONAL_K_FACTOR
            : ESTABLISHED_K_FACTOR;
    }
}
