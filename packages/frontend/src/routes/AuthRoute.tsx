import AuthScreen from '../components/AuthScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { useQueryAccount } from '../query/accountClient';

function AuthRoute() {
    const accountQuery = useQueryAccount({ enabled: true });

    return (
        <>
            <PageMetadata
                title={`Sign In • ${DEFAULT_PAGE_TITLE}`}
                description="Sign in to Infinity Hexagonal Tic-Tac-Toe with a username and password or with Discord."
                robots="noindex, nofollow"
            />

            <AuthScreen
                account={accountQuery.data?.user ?? null}
                isLoading={accountQuery.isLoading}
            />
        </>
    );
}

export default AuthRoute;
