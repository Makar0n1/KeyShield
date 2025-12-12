// Generate unique visitor ID for voting/tracking
export function getVisitorId(): string {
  const storageKey = 'keyshield_visitor_id'
  let visitorId = localStorage.getItem(storageKey)

  if (!visitorId) {
    visitorId = 'v_' + Date.now().toString(36) + Math.random().toString(36).substring(2)
    localStorage.setItem(storageKey, visitorId)
  }

  return visitorId
}

export function hasVoted(type: 'post' | 'comment', id: string): boolean {
  const votes = JSON.parse(localStorage.getItem('keyshield_votes') || '{}')
  return !!votes[`${type}_${id}`]
}

export function markAsVoted(type: 'post' | 'comment', id: string, voteType: 'like' | 'dislike'): void {
  const votes = JSON.parse(localStorage.getItem('keyshield_votes') || '{}')
  votes[`${type}_${id}`] = voteType
  localStorage.setItem('keyshield_votes', JSON.stringify(votes))
}

export function getVoteType(type: 'post' | 'comment', id: string): 'like' | 'dislike' | null {
  const votes = JSON.parse(localStorage.getItem('keyshield_votes') || '{}')
  return votes[`${type}_${id}`] || null
}
