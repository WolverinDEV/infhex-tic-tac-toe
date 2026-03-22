import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ChangelogEntryKind = 'feature' | 'fix' | 'maintenance' | 'other';

interface ChangelogEntry {
    hash: string;
    shortHash: string;
    committedAt: number;
    date: string;
    scope: string | null;
    summary: string;
    kind: ChangelogEntryKind;
}

interface ChangelogDay {
    date: string;
    commitCount: number;
    entries: ChangelogEntry[];
}

const SCRIPT_DIRECTORY_PATH = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT_PATH = resolve(SCRIPT_DIRECTORY_PATH, '..');
const SHARED_CHANGELOG_MODULE_PATH = resolve(REPOSITORY_ROOT_PATH, 'packages', 'shared', 'src', 'generatedChangelog.ts');

function readGitLog(): string {
    return execFileSync(
        'git',
        [
            '-c',
            `safe.directory=${REPOSITORY_ROOT_PATH}`,
            'log',
            '--date=short',
            '--pretty=format:%H%x09%ct%x09%ad%x09%s'
        ],
        {
            cwd: REPOSITORY_ROOT_PATH,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'inherit']
        }
    );
}

function normalizeSummary(value: string): string {
    const normalizedValue = value.trim().replace(/\s+/g, ' ');
    if (!normalizedValue) {
        return 'Untitled change';
    }

    return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

function resolveCommitKind(type: string | null): ChangelogEntryKind {
    switch (type?.toLowerCase()) {
        case 'feat':
            return 'feature';
        case 'fix':
            return 'fix';
        case 'misc':
        case 'chore':
        case 'docs':
        case 'refactor':
        case 'perf':
        case 'build':
        case 'ci':
        case 'test':
        case 'style':
            return 'maintenance';
        default:
            return 'other';
    }
}

function parseCommitLine(line: string): ChangelogEntry {
    const [hash, committedAtValue, date, subject] = line.split('\t');
    const committedAt = Number.parseInt(committedAtValue ?? '', 10) * 1000;
    if (!hash || !date || !subject || !Number.isFinite(committedAt)) {
        throw new Error(`Unable to parse git log line: ${line}`);
    }

    const conventionalCommitMatch = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/i);
    const summary = normalizeSummary(conventionalCommitMatch?.[3] ?? subject);

    return {
        hash,
        shortHash: hash.slice(0, 7),
        committedAt,
        date,
        scope: conventionalCommitMatch?.[2] ?? null,
        summary,
        kind: resolveCommitKind(conventionalCommitMatch?.[1] ?? null)
    };
}

function groupCommitsByDate(entries: ChangelogEntry[]): ChangelogDay[] {
    const groupedEntries = new Map<string, ChangelogEntry[]>();

    for (const entry of entries) {
        const dateEntries = groupedEntries.get(entry.date);
        if (dateEntries) {
            dateEntries.push(entry);
            continue;
        }

        groupedEntries.set(entry.date, [entry]);
    }

    return [...groupedEntries.entries()].map(([date, dateEntries]) => ({
        date,
        commitCount: dateEntries.length,
        entries: dateEntries
    }));
}

function renderSharedModule(days: ChangelogDay[], generatedAt: string): string {
    return [
        "export type ChangelogEntryKind = 'feature' | 'fix' | 'maintenance' | 'other';",
        '',
        'export interface ChangelogEntry {',
        '    hash: string;',
        '    shortHash: string;',
        '    committedAt: number;',
        '    date: string;',
        '    scope: string | null;',
        '    summary: string;',
        '    kind: ChangelogEntryKind;',
        '}',
        '',
        'export interface ChangelogDay {',
        '    date: string;',
        '    commitCount: number;',
        '    entries: ChangelogEntry[];',
        '}',
        '',
        `export const CHANGELOG_GENERATED_AT = ${JSON.stringify(generatedAt)};`,
        `export const CHANGELOG_COMMIT_COUNT = ${days.reduce((total, day) => total + day.commitCount, 0)};`,
        `export const CHANGELOG_DAYS: ChangelogDay[] = ${JSON.stringify(days, null, 4)};`,
        ''
    ].join('\n');
}

function main(): void {
    const generatedAt = new Date().toISOString();
    const changelogEntries = readGitLog()
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map(parseCommitLine);
    const changelogDays = groupCommitsByDate(changelogEntries);

    mkdirSync(resolve(SHARED_CHANGELOG_MODULE_PATH, '..'), { recursive: true });
    writeFileSync(SHARED_CHANGELOG_MODULE_PATH, renderSharedModule(changelogDays, generatedAt), 'utf8');
}

main();
