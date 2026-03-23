export function formatEloChange(eloChange: number) {
  return `${eloChange >= 0 ? '+' : ''}${eloChange}`
}
