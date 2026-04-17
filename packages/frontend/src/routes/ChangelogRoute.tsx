import { CHANGELOG_COMMIT_COUNT, CHANGELOG_DAYS, CHANGELOG_GENERATED_AT } from '@ih3t/shared';

import ChangelogScreen from '../components/ChangelogScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { useQueryAccount, useQueryAccountPreferences } from '../query/accountClient';

function ChangelogRoute() {
    const accountQuery = useQueryAccount({ enabled: true });
    const accountPreferencesQuery = useQueryAccountPreferences({
        enabled: !accountQuery.isLoading && Boolean(accountQuery.data?.user),
    });

    return (
        <>
            <PageMetadata
                title={`Changelog • ${DEFAULT_PAGE_TITLE}`}
                description="Read the latest HeXO updates and release notes."
            />

            <ChangelogScreen
                changelogDays={CHANGELOG_DAYS}
                commitCount={CHANGELOG_COMMIT_COUNT}
                generatedAt={CHANGELOG_GENERATED_AT}
                account={accountQuery.data?.user ?? null}
                preferences={accountPreferencesQuery.data?.preferences ?? null}
                isPreferencesLoading={Boolean(accountQuery.data?.user) && (accountPreferencesQuery.isLoading || accountPreferencesQuery.isRefetching)}
                preferencesErrorMessage={accountPreferencesQuery.error instanceof Error ? accountPreferencesQuery.error.message : null}
            />
        </>
    );
}

export default ChangelogRoute;
