import AccountPreferencesScreen from '../components/AccountPreferencesScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { useQueryAccount, useQueryAccountBots, useQueryAccountPreferences } from '../query/accountClient';

function AccountPreferencesRoute() {
    const accountQuery = useQueryAccount({ enabled: true });
    const accountPreferencesQuery = useQueryAccountPreferences({
        enabled: !accountQuery.isLoading && Boolean(accountQuery.data?.user),
    });
    const accountBotsQuery = useQueryAccountBots({
        enabled: !accountQuery.isLoading && Boolean(accountQuery.data?.user),
    });

    return (
        <>
            <PageMetadata
                title={`Account Preferences • ${DEFAULT_PAGE_TITLE}`}
                description="Manage your Infinity Hexagonal Tic-Tac-Toe account preferences."
                robots="noindex, nofollow"
            />

            <AccountPreferencesScreen
                account={accountQuery.data?.user ?? null}
                preferences={accountPreferencesQuery.data?.preferences ?? null}
                bots={accountBotsQuery.data?.bots ?? []}
                isLoading={accountQuery.isLoading}
                isPreferencesLoading={Boolean(accountQuery.data?.user) && (accountPreferencesQuery.isLoading || accountPreferencesQuery.isRefetching)}
                isBotsLoading={Boolean(accountQuery.data?.user) && (accountBotsQuery.isLoading || accountBotsQuery.isRefetching)}
                errorMessage={accountQuery.error instanceof Error ? accountQuery.error.message : null}
                preferencesErrorMessage={accountPreferencesQuery.error instanceof Error ? accountPreferencesQuery.error.message : null}
                botsErrorMessage={accountBotsQuery.error instanceof Error ? accountBotsQuery.error.message : null}
            />
        </>
    );
}

export default AccountPreferencesRoute;
