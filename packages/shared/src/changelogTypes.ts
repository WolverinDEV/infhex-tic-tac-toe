export type ChangelogEntryKind = `feature` | `fix` | `maintenance` | `other`;

export type ChangelogEntry = {
    hash: string;
    shortHash: string;
    committedAt: number;
    date: string;
    type: string | null;
    scope: string | null;
    summary: string;
    kind: ChangelogEntryKind;
    isBreakingChange: boolean;
    breakingChangeNote: string | null;
};

export type ChangelogDay = {
    date: string;
    commitCount: number;
    entries: ChangelogEntry[];
};
