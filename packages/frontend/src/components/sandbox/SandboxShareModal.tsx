import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next'

type SandboxShareModalProps = {
    isOpen: boolean
    isCreating: boolean
    isCopying: boolean
    shareUrl: string | null
    initialName: string | null
    errorMessage: string | null
    onClose: () => void
    onCreate: (name: string) => void
    onCopy: () => void
};

function SandboxShareModal({
    isOpen,
    isCreating,
    isCopying,
    shareUrl,
    initialName,
    errorMessage,
    onClose,
    onCreate,
    onCopy,
}: Readonly<SandboxShareModalProps>) {
    const { t } = useTranslation()
    const [positionName, setPositionName] = useState(``);

    useEffect(() => {
        if (!isOpen) {
            setPositionName(``);
            return;
        }

        setPositionName(initialName ?? ``);
    }, [initialName, isOpen]);

    const trimmedName = positionName.trim();
    const validationMessage = useMemo(() => {
        if (trimmedName.length === 0) {
            return t('enterANameForThisPosition', 'Enter a name for this position.');
        }

        if (trimmedName.length > 80) {
            return t('positionNamesCanBeAtMost80CharactersLong', 'Position names can be at most 80 characters long.');
        }

        return null;
    }, [trimmedName]);
    const visibleErrorMessage = errorMessage ?? validationMessage;
    const isLinkReady = Boolean(shareUrl);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="pointer-events-auto w-full max-w-xl rounded-[1.5rem] border border-violet-300/20 bg-slate-900/95 px-6 py-6 text-center shadow-[0_30px_120px_rgba(15,23,42,0.58)] backdrop-blur sm:px-8 sm:py-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-violet-200/80 sm:text-xs">
                    {t('sharePosition', 'Share Position')}
                </div>

                <h2 className="mt-3 text-3xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl">
                    {isLinkReady ? t('sandboxLinkReady', 'Sandbox Link Ready') : t('nameThisPosition', 'Name This Position')}
                </h2>

                <p className="mt-4 text-sm leading-6 text-slate-200 sm:text-base">
                    {isLinkReady
                        ? t('anyoneWithThisLinkCanLoadTheCurrentSandboxPositionOntoTheirOwnBoard', 'Anyone with this link can load the current sandbox position onto their own board.')
                        : t('giveThisSandboxPositionANameBeforeCreatingTheShareLink', 'Give this sandbox position a name before creating the share link.')}
                </p>

                {!isLinkReady && (
                    <input
                        value={positionName}
                        onChange={(event) => setPositionName(event.target.value)}
                        placeholder={t('openingTrapLadderTestEndgameStudy', 'Opening Trap, Ladder Test, Endgame Study...')}
                        autoFocus
                        className="mt-6 w-full rounded-2xl border border-violet-300/15 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-slate-500 focus:border-violet-300/40 focus:bg-slate-950 focus:ring-2 focus:ring-violet-300/12"
                    />
                )}

                {isLinkReady && (
                    <>
                        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                {t('positionName', 'Position Name')}
                            </div>

                            <div className="mt-1 truncate text-sm text-white">
                                {trimmedName}
                            </div>
                        </div>

                        <input
                            value={shareUrl ?? ``}
                            readOnly
                            onFocus={(event) => event.currentTarget.select()}
                            className="mt-4 w-full rounded-2xl border border-sky-300/15 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-slate-500 focus:border-sky-300/40 focus:bg-slate-950 focus:ring-2 focus:ring-sky-300/12"
                        />
                    </>
                )}

                {visibleErrorMessage && (
                    <div className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-400/8 px-4 py-3 text-left text-sm text-rose-100">
                        {visibleErrorMessage}
                    </div>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button
                        onClick={onClose}
                        variant="outline" size="lg"
                    >
                        {t('close', 'Close')}
                    </Button>

                    {isLinkReady ? (
                        <Button
                            onClick={onCopy}
                            disabled={isCopying}
                            variant="violet" size="lg"
                        >
                            {isCopying ? `Copying...` : `Copy Link`}
                        </Button>
                    ) : (
                        <Button
                            onClick={() => onCreate(trimmedName)}
                            disabled={Boolean(validationMessage) || isCreating}
                            variant="violet" size="lg"
                        >
                            {isCreating ? `Creating...` : t('createLink', 'Create Link')}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SandboxShareModal;
