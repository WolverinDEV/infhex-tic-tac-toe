import { Link } from 'react-router';

import PageCorpus from './PageCorpus';

const TURN_FLOW = [
    `Player 1 starts with 1 hex at the center.`,
    `Player 2 replies with 2 hexes.`,
    `After that, every turn is 2 hexes.`,
    `The first player to connect six hexagons on one axis wins.`,
];

const LEGAL_MOVE_RULES = [
    `Place only on empty hexes.`,
    `A new hex can be placed at most 8 cells apart from any other hex.`,
    `The board is infinite, so play can expand in any direction.`,
];

const MATCH_NOTES = [
    `Public and private lobbies use the same rules.`,
    `Rated games affect the leaderboard; casual games do not.`,
    `Matches may use turn clocks, match clocks, or no clock.`,
    `Turn clocks limit each turn but reset to the initial value on after turn.`,
    `Match clocks limit the total time of the match but can be incremented after every turn.`,
];

function RulesScreen() {
    return (
        <PageCorpus
            category="How To Play"
            title="Game Rules"
            description="A two-player connection game on an infinite hex grid. Make a straight line of 6 before your opponent."
        >
            <div className="flex flex-1 flex-col gap-4 overflow-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">
                <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5 sm:p-6">
                    <div className="flex flex-wrap gap-2">
                        <div className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-amber-100">
                            2 Players
                        </div>

                        <div className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-sky-100">
                            2 Hexes Per Turn
                        </div>

                        <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-emerald-100">
                            6 In A Row Wins
                        </div>
                    </div>

                    <div className="mt-6 grid gap-6">
                        <section>
                            <p className="text-xs uppercase tracking-[0.3em] text-sky-200/75">
                                Game Play
                            </p>

                            <ol className="mt-3 grid gap-2">
                                {TURN_FLOW.map((step, index) => (
                                    <li key={step} className="flex gap-3 text-sm leading-6 text-slate-100 sm:text-base">
                                        {index + 1}
                                        .
                                        {step}
                                    </li>
                                ))}
                            </ol>
                        </section>

                        <section className="border-t border-white/10 pt-6">
                            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/75">
                                Win Condition
                            </p>

                            <p className="mt-3 text-sm leading-6 text-slate-100 sm:text-base">
                                Connect 6 of your own hexes in one straight line on any of the 3 board axes.
                            </p>

                            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
                                Horizontal and both diagonal directions count.
                            </p>
                        </section>

                        <section className="border-t border-white/10 pt-6">
                            <p className="text-xs uppercase tracking-[0.3em] text-amber-200/75">
                                Legal Placements
                            </p>

                            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-100 sm:text-base">
                                {LEGAL_MOVE_RULES.map((rule) => (
                                    <li key={rule} className="flex gap-3">
                                        <span className="text-amber-200" aria-hidden="true">
                                            •
                                        </span>

                                        <span>
                                            {rule}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className="border-t border-white/10 pt-6">
                            <p className="text-xs uppercase tracking-[0.3em] text-sky-200/75">
                                Match Settings
                            </p>

                            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-100 sm:text-base">
                                {MATCH_NOTES.map((note) => (
                                    <li key={note} className="flex gap-3">
                                        <span className={` text-sky-200`} aria-hidden="true">
                                            •
                                        </span>

                                        <span>
                                            {note}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </section>

                <section className="rounded-[1.75rem] border border-sky-300/15 bg-sky-400/10 p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-sky-100/80">
                                Ready To Try It
                            </p>

                            <h2 className="mt-2 text-xl font-black uppercase tracking-[0.08em] text-white sm:text-2xl">
                                Jump Into A Match
                            </h2>

                            <p className="mt-3 max-w-3xl text-sm leading-6 text-sky-50/90 sm:text-base">
                                Start a live lobby or use Sandbox Mode to test openings first.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Link
                                to="/sandbox"
                                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:-translate-y-0.5 hover:bg-white/14"
                            >
                                Open Sandbox
                            </Link>

                            <Link
                                to="/"
                                className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200"
                            >
                                Find a game
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        </PageCorpus>
    );
}

export default RulesScreen;
