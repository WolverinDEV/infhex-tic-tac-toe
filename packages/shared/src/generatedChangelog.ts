export type ChangelogEntryKind = 'feature' | 'fix' | 'maintenance' | 'other';

export interface ChangelogEntry {
    hash: string;
    shortHash: string;
    committedAt: number;
    date: string;
    scope: string | null;
    summary: string;
    kind: ChangelogEntryKind;
}

export interface ChangelogDay {
    date: string;
    commitCount: number;
    entries: ChangelogEntry[];
}

export const CHANGELOG_GENERATED_AT = "2026-03-22T16:55:36.277Z";
export const CHANGELOG_COMMIT_COUNT = 1;
export const CHANGELOG_DAYS: ChangelogDay[] = [
    {
        "date": "2026-03-22",
        "commitCount": 1,
        "entries": [
            {
                "hash": "0000000000000000000000000000000000000000",
                "shortHash": "0000000",
                "committedAt": 1774189375000,
                "date": "2026-03-22",
                "scope": null,
                "summary": "This changelog will be automatically build by the CI build pipeline",
                "kind": "other"
            },
        ]
    }
];
