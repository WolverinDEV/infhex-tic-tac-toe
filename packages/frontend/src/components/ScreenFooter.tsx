import { Link } from 'react-router'
import { APP_VERSION_HASH } from '../appVersion'

function ScreenFooter() {
  return (
    <footer className="mt-10 text-center text-xs uppercase tracking-[0.22em] text-slate-400">
      <a
        href="mailto:infhex-ttt@did.science"
        className="transition hover:text-sky-300"
      >
        Made with love by WolverinDEV
      </a>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>Copyright © {new Date().getFullYear()}</span>
        <span aria-hidden="true">•</span>
        <Link
          to="/changelog"
          className="font-mono tracking-[0.12em] transition hover:text-sky-300"
        >
          Version {APP_VERSION_HASH}
        </Link>
        <span aria-hidden="true">•</span>
        <Link
          to="/changelog"
          className="transition hover:text-sky-300"
        >
          Changelog
        </Link>
        <span aria-hidden="true">•</span>
        <a
          href="https://github.com/WolverinDEV/infhex-tic-tac-toe"
          target="_blank"
          rel="noreferrer"
          className="transition hover:text-sky-300"
        >
          GitHub
        </a>
      </div>
    </footer>
  )
}

export default ScreenFooter
