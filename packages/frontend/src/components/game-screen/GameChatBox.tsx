import { useEffect, useRef, useState } from 'react'
import type { SessionChatMessage } from '@ih3t/shared'
import GameHudShell from './GameHudShell'
import { cn } from '../../utils/cn'

interface SessionChatBoxProps {
  currentParticipantId: string
  messages: SessionChatMessage[]
  placement: 'in-game' | 'finished'
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSendMessage?: (message: string) => void
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10h10" />
      <path d="M7 14h6" />
      <path d="M5 19V6.8A1.8 1.8 0 0 1 6.8 5h10.4A1.8 1.8 0 0 1 19 6.8v7.4A1.8 1.8 0 0 1 17.2 16H9l-4 3Z" />
    </svg>
  )
}

function formatMessageTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function GameChatBox({
  currentParticipantId,
  messages,
  isOpen,
  onOpenChange,
  onSendMessage,
  placement,
}: Readonly<SessionChatBoxProps>) {
  const [draft, setDraft] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLInputElement | null>(null)
  const focusTargetRef = useRef<'panel' | 'composer'>('panel')
  const lastTrackedMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    const lastMessage = messages[messages.length - 1] ?? null
    if (!lastMessage) {
      lastTrackedMessageIdRef.current = null
      return
    }

    if (lastTrackedMessageIdRef.current === lastMessage.id) {
      return
    }

    lastTrackedMessageIdRef.current = lastMessage.id
    if (isOpen || lastMessage.participantId === currentParticipantId) {
      setUnreadCount(0)
      return
    }

    setUnreadCount((currentCount) => currentCount + 1)
  }, [currentParticipantId, isOpen, messages])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (focusTargetRef.current === 'composer') {
      composerRef.current?.focus()
      return
    }

    panelRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const container = messagesRef.current
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }, [isOpen, messages.length])

  const openChat = (focusComposer = false) => {
    focusTargetRef.current = focusComposer ? 'composer' : 'panel'
    setUnreadCount(0)
    onOpenChange(true)
  }

  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount)
  return (
    <GameHudShell
      role="right"
      isOpen={isOpen}
      onOpen={() => openChat(true)}
      onClose={() => onOpenChange(false)}
      openTitle={unreadCount > 0 ? `${unreadCount} unread chat messages` : 'Open chat'}
      openIcon={<ChatIcon />}
      closeTitle="Close chat"
      panelRef={panelRef}
      openButtonBadge={unreadCount > 0
        ? (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-[0_8px_20px_rgba(244,63,94,0.45)]">
            {unreadLabel}
          </span>
        )
        : undefined}
    >
      <div className="text-sm uppercase tracking-[0.25em] text-sky-300">Chat Box</div>
      <h1 className="mt-1 text-2xl font-bold">Player Chat</h1>
      <div
        ref={messagesRef}
        className="h-72 overflow-y-auto rounded-2xl mt-2 mr-[-1em] pr-[1em]"
      >
        {messages.length === 0 ? (
          <div className="px-2 py-5 text-sm leading-6 text-slate-300">
            No messages yet. Say something to your opponent while the match is live.
          </div>
        ) : messages.map((message, index) => {
          const isSameSender = index > 0 && messages[index - 1].participantId === message.participantId && message.sentAt - messages[index - 1].sentAt < 60_000
          const isOwnMessage = message.participantId === currentParticipantId

          if (isSameSender) {
            return (
              <div
                key={message.id}
                className="ml-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-100/80"
              >
                {message.message}
              </div>
            )
          }

          return (
            <div
              key={message.id}
              className="px-1 pt-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className={`text-[.75rem] font-medium uppercase tracking-[0.1em] ${isOwnMessage ? 'text-sky-100/80' : 'text-slate-200/66'}`}>
                  {isOwnMessage ? 'You' : message.participantDisplayName}
                </div>
                <div className="text-[.8rem] text-slate-400/38">
                  {formatMessageTime(message.sentAt)}
                </div>
              </div>
              <div className="mt-1 ml-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-100/80">
                {message.message}
              </div>
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          const nextMessage = draft.trim()
          if (!nextMessage) {
            return
          }

          onSendMessage?.(nextMessage)
          setDraft('')
        }}
        className="pointer-events-auto mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2"
      >
        <label className="sr-only" htmlFor={`session-chat-input-${placement}`}>
          Send a chat message
        </label>
        <input
          ref={composerRef}
          id={`session-chat-input-${placement}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={280}
          placeholder={onSendMessage ? "Send a message" : "You can not send a message"}
          className={cn(
            "min-h-11 rounded-full border border-white/10 bg-slate-950/35 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-400/70 focus:border-sky-300/40 focus:bg-slate-950/55",
            !onSendMessage && "bg-slate-950/10"
          )}

          disabled={!onSendMessage}
        />
        <button
          type="submit"
          disabled={!onSendMessage || draft.trim().length === 0}
          className="min-w-28 rounded-full bg-sky-600 px-4 py-2.5 font-medium shadow-lg transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Send
        </button>
      </form>
    </GameHudShell>
  )
}

export default GameChatBox
