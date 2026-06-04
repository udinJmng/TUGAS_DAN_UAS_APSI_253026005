/**
 * 5Days Radio — API service layer
 *
 * In dev:  Vite proxies /api → http://localhost:3000
 * In prod: set VITE_API_URL to the deployed backend URL
 *
 * All requests use credentials: 'include' so the session cookie
 * is sent automatically.
 */

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'                          // works via Vite proxy in dev

// ─── Core fetch wrapper ────────────────────────────────────────────────────
async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  isFormData = false,
): Promise<T> {
  const headers: HeadersInit = {}
  if (body && !isFormData) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',          // send session cookie
    headers,
    body: body
      ? isFormData
        ? (body as FormData)
        : JSON.stringify(body)
      : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

const get  = <T>(path: string)                    => req<T>('GET',    path)
const post = <T>(path: string, body?: unknown)    => req<T>('POST',   path, body)
const put  = <T>(path: string, body?: unknown)    => req<T>('PUT',    path, body)
const patch= <T>(path: string, body?: unknown)    => req<T>('PATCH',  path, body)
const del  = <T>(path: string)                    => req<T>('DELETE', path)

// ─── Types (mirror backend shape) ─────────────────────────────────────────
export interface ApiUser {
  id: number; first_name: string; last_name: string; username: string
  email: string; bio: string | null; avatar_url: string | null
  role: 'user' | 'admin'; is_banned: boolean
  followers_count: number; following_count: number; created_at: string
}
export interface ApiSong {
  id: number; user_id: number; title: string
  type: 'single' | 'album'; genre: string; description: string | null
  cover_url: string | null; audio_url: string | null
  play_count: number; is_deleted: boolean; created_at: string
  username: string; avatar_url: string | null
  likes_count: number; reposts_count: number; comments_count: number
  first_track_dur?: string | null   // duration of first track, from list endpoint
  tracks?: ApiTrack[]; credits?: ApiCredit[]
}
export interface ApiTrack {
  id: number; song_id: number; track_number: number
  title: string; duration: string | null; audio_url: string | null
}
export interface ApiCredit  { id: number; song_id: number; role: string; name: string }
export interface ApiComment {
  id: number; user_id: number; username: string; avatar_url: string | null
  body: string; created_at: string
}

// ─── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  me:       ()                                                                                     => get<{ user: ApiUser }>('/auth/me'),
  login:    (email: string, password: string)                                                      => post<{ user: ApiUser }>('/auth/login', { email, password }),
  register: (d: { first_name:string; last_name:string; username:string; email:string; password:string }) => post<{ user: ApiUser }>('/auth/register', d),
  logout:   ()                                                                                     => post<{ message: string }>('/auth/logout'),
}

// ─── Users ─────────────────────────────────────────────────────────────────
export const userApi = {
  get:    (id: number)                                                                          => get<ApiUser>(`/users/${id}`),
  songs:  (id: number)                                                                          => get<ApiSong[]>(`/users/${id}/songs`),
  update: (d: Partial<ApiUser> & { old_password?: string; new_password?: string })             => put<{ message: string }>('/users/me', d),
}

// ─── Songs ─────────────────────────────────────────────────────────────────
export const songApi = {
  list:     (params?: { search?: string; genre?: string; sort?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(params as Record<string,string> ?? {}).toString()
    return get<ApiSong[]>(`/songs${qs ? '?'+qs : ''}`)
  },
  get:      (id: number)                                   => get<ApiSong>(`/songs/${id}`),
  create:   (form: FormData)                               => req<{ message:string; song_id:number }>('POST', '/songs', form, true),
  update:   (id: number, form: FormData)                   => req<{ message:string }>('PUT', `/songs/${id}`, form, true),
  delete:   (id: number)                                   => del<{ message:string }>(`/songs/${id}`),
  uploadAudio: (songId: number, form: FormData)            => req<{ message:string; audio_url:string }>('POST', `/songs/${songId}/audio`, form, true),
}

// ─── Interactions ──────────────────────────────────────────────────────────
export const interactionApi = {
  toggleLike:    (songId: number)                          => post<{ liked:boolean; likes_count:number }>(`/songs/${songId}/like`),
  getLike:       (songId: number)                          => get<{ liked:boolean; likes_count:number }>(`/songs/${songId}/likes`),
  toggleRepost:  (songId: number)                          => post<{ reposted:boolean; reposts_count:number }>(`/songs/${songId}/repost`),
  getComments:   (songId: number)                          => get<ApiComment[]>(`/songs/${songId}/comments`),
  postComment:   (songId: number, body: string)            => post<ApiComment>(`/songs/${songId}/comments`, { body }),
  deleteComment: (commentId: number)                       => del<{ message:string }>(`/comments/${commentId}`),
  likedSongs:    ()                                        => get<ApiSong[]>('/me/liked'),
}

// ─── Admin ─────────────────────────────────────────────────────────────────
export const adminApi = {
  users:         ()                                        => get<ApiUser[]>('/admin/users'),
  banToggle:     (userId: number)                          => patch<{ message:string; is_banned:boolean }>(`/admin/users/${userId}/ban`),
  songs:         ()                                        => get<ApiSong[]>('/admin/songs'),
  deleteSong:    (songId: number)                          => del<{ message:string }>(`/admin/songs/${songId}`),
  comments:      ()                                        => get<ApiComment[]>('/admin/comments'),
  deleteComment: (commentId: number)                       => del<{ message:string }>(`/admin/comments/${commentId}`),
}

// ─── Upload helpers ────────────────────────────────────────────────────────
/**
 * Build a FormData for POST /api/songs or PUT /api/songs/:id
 * coverFile can be a File (drag-dropped) or a data-URL string (from mock)
 */
export function buildSongForm(data: {
  title: string; type: string; genre: string; description: string
  coverFile?: File | null
  tracks?: { title: string; dur: string; credits?: { role:string; name:string }[] }[]
  credits?: { role: string; name: string }[]
}): FormData {
  const fd = new FormData()
  fd.append('title',       data.title)
  fd.append('type',        data.type)
  fd.append('genre',       data.genre)
  fd.append('description', data.description)
  if (data.coverFile) fd.append('cover', data.coverFile)
  if (data.tracks)  fd.append('tracks',  JSON.stringify(data.tracks))
  if (data.credits) fd.append('credits', JSON.stringify(data.credits))
  return fd
}

/** Resolve a cover URL: if it starts with /uploads, prepend the API origin */
export function resolveUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('data:')) return url
  const apiOrigin = import.meta.env.VITE_API_URL || ''
  return `${apiOrigin}${url}`
}
