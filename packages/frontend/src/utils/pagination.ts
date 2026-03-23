export function getVisiblePageNumbers(currentPage: number, totalPages: number) {
  const maxVisiblePages = 5
  const halfVisiblePages = Math.floor(maxVisiblePages / 2)
  let startPage = Math.max(1, currentPage - halfVisiblePages)
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

  startPage = Math.max(1, endPage - maxVisiblePages + 1)

  return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index)
}
