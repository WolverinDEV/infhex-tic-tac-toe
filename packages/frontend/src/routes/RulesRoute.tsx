import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import RulesScreen from '../components/RulesScreen';

function RulesRoute() {
    return (
        <>
            <PageMetadata
                title={`Rules • ${DEFAULT_PAGE_TITLE}`}
                description="Learn the Infinity Hexagonal Tic-Tac-Toe rules: turn order, legal placements, the 8-cell placement limit, and how to win with 6 in a row."
            />

            <RulesScreen />
        </>
    );
}

export default RulesRoute;
