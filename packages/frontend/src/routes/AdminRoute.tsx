import { Navigate, useNavigate } from 'react-router';

import AdminStatsScreen from '../components/AdminStatsScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { useQueryAccount } from '../query/accountClient';
import { useTranslation } from 'react-i18next'

function AdminRoute() {
    const { t } = useTranslation()
    const navigate = useNavigate();
    const accountQuery = useQueryAccount({ enabled: true });
    const isAdmin = accountQuery.data?.user?.role === `admin`;
    if (accountQuery.isLoading) {
        return (
            <>
                <PageMetadata
                    title={t('adminDashboardDefault_page_title', 'Admin Dashboard • {{DEFAULT_PAGE_TITLE}}', { DEFAULT_PAGE_TITLE })}
                    description={t('administrativeStatisticsForHexo', 'Administrative statistics for HeXO.')}
                    robots="noindex, nofollow"
                />

                <div className="px-6 py-10 text-center text-slate-300">
                    {t('loadingStatistics', 'Loading statistics...')}
                </div>
            </>
        );
    }

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return (
        <>
            <PageMetadata
                title={t('adminDashboardDefault_page_title', 'Admin Dashboard • {{DEFAULT_PAGE_TITLE}}', { DEFAULT_PAGE_TITLE })}
                description={t('administrativeStatisticsForHexo', 'Administrative statistics for HeXO.')}
                robots="noindex, nofollow"
            />

            <AdminStatsScreen
                onOpenGame={(gameId) => void navigate(`/games/${encodeURIComponent(gameId)}`)}
            />
        </>
    );
}

export default AdminRoute;
