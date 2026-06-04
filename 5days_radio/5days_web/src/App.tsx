import { useReducer, useEffect, useRef, useCallback, useState } from 'react'
import './index.css'
import {
  authApi, songApi, interactionApi, adminApi, userApi,
  resolveUrl,
  type ApiUser, type ApiSong, type ApiComment,
} from './services/api'
import { apiCall } from './hooks/useApi'

// ─── Feature flag: real API vs. mock data ────────────────────────────────
// Set VITE_USE_API=true in .env to connect to the Express backend.
// Leave unset (or false) to run with the built-in mock data only.
const USE_API = import.meta.env.VITE_USE_API === 'true'

// ─── Types ────────────────────────────────────────────────────────────────
interface Credit { role: string; name: string }
interface Track  { title: string; dur: string; audioName?: string; audioData?: string; audio_url?: string; credits?: Credit[] }
interface Comment { id: number; userId: number; user: string; avatar: string; text: string; ts: number; deleted: boolean }
interface Song {
  id: number; title: string; artist: string; userId: number
  type: 'single' | 'album'; genre: string; desc: string; cover: string
  audio_url?: string   // for singles — real file served by API
  likes: number[]; reposts: number[]; comments: Comment[]
  plays: number; deleted: boolean; tracks: Track[]; credits: Credit[]
}
interface User {
  id: number; name: string; username: string; email: string; password: string
  bio: string; avatar: string; role: 'user' | 'admin'; banned: boolean
  followers: number; following: number
}
type Page = 'home' | 'explore' | 'library' | 'upload' | 'profile' | 'admin' | 'song-detail'
type AdminTab = 'users' | 'songs' | 'comments'

interface PlayerState {
  queue: Song[]; index: number; isPlaying: boolean; progress: number
  currentSong: Song | null
}
interface AppState {
  currentUser: User | null; users: User[]; songs: Song[]
  page: Page; prevPage: Page; navHistory: Page[]; navPos: number
  currentDetailSong: Song | null; adminTab: AdminTab
  player: PlayerState; toastMsg: string; toastShow: boolean
  nextSongId: number; nextUserId: number; nextCommentId: number
  editSongId: number | null
}

// ─── Mock data ────────────────────────────────────────────────────────────
const NOW = Date.now()
const INITIAL_USERS: User[] = [
  { id:1, name:'Alex Rivera',  username:'alexrivera', email:'alex@demo.com', password:'demo123', bio:'Indie producer & songwriter 🎸', avatar:'https://i.pravatar.cc/150?img=3',  role:'admin', banned:false, followers:12400, following:89 },
  { id:2, name:'Mia Chen',     username:'miachen',   email:'mia@demo.com',  password:'demo123', bio:'Electronic music lover 🎛️',  avatar:'https://i.pravatar.cc/150?img=5',  role:'user',  banned:false, followers:4502,  following:200 },
  { id:3, name:'Jordan Lee',   username:'jordanlee', email:'jordan@demo.com',password:'demo123', bio:'Jazz pianist & composer',       avatar:'https://i.pravatar.cc/150?img=7',  role:'user',  banned:false, followers:8810,  following:120 },
  { id:4, name:'Sam Torres',   username:'samtorres', email:'sam@demo.com',  password:'demo123', bio:'Hip-hop artist from NYC',        avatar:'https://i.pravatar.cc/150?img=9',  role:'user',  banned:true,  followers:3200,  following:55 },
  { id:5, name:'Riley Park',   username:'rileypark', email:'riley@demo.com',password:'demo123', bio:'Pop vocalist 🎤',              avatar:'https://i.pravatar.cc/150?img=11', role:'user',  banned:false, followers:21000, following:400 },
  { id:6, name:'Dante Cruz',   username:'dantecruz', email:'dante@demo.com',password:'demo123', bio:'Rock guitarist & producer 🎸',  avatar:'https://i.pravatar.cc/150?img=15', role:'user',  banned:false, followers:6700,  following:310 },
  { id:7, name:'Yuna Kim',     username:'yunakim',   email:'yuna@demo.com', password:'demo123', bio:'R&B singer-songwriter 🎶',     avatar:'https://i.pravatar.cc/150?img=20', role:'user',  banned:false, followers:9340,  following:175 },
]
const INITIAL_SONGS: Song[] = [
  { id:1,  title:'Neon Echoes',       artist:'Alex Rivera', userId:1, type:'single', genre:'EDM',    desc:'A pulsing journey through synthetic landscapes. Recorded late-night in a basement studio.', cover:'https://picsum.photos/seed/neon/400',       likes:[2,3,5,7], reposts:[5,6], plays:15200, deleted:false,
    tracks:[], credits:[{role:'Producer',name:'Alex Rivera'},{role:'Songwriter',name:'Alex Rivera'},{role:'Mix & Master',name:'Jordan Lee'}],
    comments:[{id:1,userId:2,user:'Mia Chen',avatar:'https://i.pravatar.cc/150?img=5',text:'This is fire! 🔥',ts:NOW-3600000,deleted:false},{id:2,userId:3,user:'Jordan Lee',avatar:'https://i.pravatar.cc/150?img=7',text:'Reminds me of early Daft Punk.',ts:NOW-1800000,deleted:false}]},
  { id:2,  title:'Midnight Rain',     artist:'Mia Chen',    userId:2, type:'album',  genre:'Indie',  desc:'Four tracks about late nights and city lights.', cover:'https://picsum.photos/seed/rain/400',       likes:[1,5,6], reposts:[1], plays:9800, deleted:false,
    tracks:[{title:'City Pulse',dur:'3:12'},{title:'Glass Windows',dur:'2:58'},{title:'Midnight Rain',dur:'4:01'},{title:'Last Light',dur:'3:45'}],
    credits:[{role:'Artist',name:'Mia Chen'},{role:'Guitar',name:'Jordan Lee'},{role:'Mix',name:'Alex Rivera'}],
    comments:[{id:3,userId:1,user:'Alex Rivera',avatar:'https://i.pravatar.cc/150?img=3',text:'Mia you outdid yourself 🎧',ts:NOW-5400000,deleted:false}]},
  { id:3,  title:'Blue Note Sessions',artist:'Jordan Lee',  userId:3, type:'album',  genre:'Jazz',   desc:'Live recordings from the Blue Note NYC. One take, no overdubs.', cover:'https://picsum.photos/seed/jazz/400',       likes:[1,2,5,6,7], reposts:[2,4], plays:7600, deleted:false,
    tracks:[{title:'Prelude in Blue',dur:'5:20'},{title:'Rainy Tuesday',dur:'6:14'},{title:'After Midnight',dur:'7:33'},{title:'Satin Groove',dur:'4:55'},{title:'Blue Note',dur:'8:02'}],
    credits:[{role:'Piano',name:'Jordan Lee'},{role:'Bass',name:'Sam Torres'},{role:'Drums',name:'Dante Cruz'}],
    comments:[{id:4,userId:7,user:'Yuna Kim',avatar:'https://i.pravatar.cc/150?img=20',text:'Miles Davis energy. Incredible.',ts:NOW-86400000,deleted:false}]},
  { id:4,  title:'Street Gospel',     artist:'Sam Torres',  userId:4, type:'single', genre:'Hip-Hop',desc:'Bars about real life, real struggles. No filters.', cover:'https://picsum.photos/seed/hiphop/400', likes:[1,6], reposts:[], plays:4300, deleted:false,
    tracks:[], credits:[{role:'Artist & Songwriter',name:'Sam Torres'},{role:'Producer',name:'Alex Rivera'}],
    comments:[{id:5,userId:6,user:'Dante Cruz',avatar:'https://i.pravatar.cc/150?img=15',text:'Storytelling is next level fr',ts:NOW-43200000,deleted:false}]},
  { id:5,  title:'Bloom',             artist:'Riley Park',  userId:5, type:'single', genre:'Pop',    desc:'A feel-good anthem for summer days. Written on a beach in Bali. 🌸', cover:'https://picsum.photos/seed/bloom/400',      likes:[1,2,3,6,7], reposts:[1,3,6], plays:32000, deleted:false,
    tracks:[], credits:[{role:'Artist',name:'Riley Park'},{role:'Songwriter',name:'Yuna Kim'},{role:'Producer',name:'Mia Chen'},{role:'Mix',name:'Jordan Lee'}],
    comments:[{id:6,userId:2,user:'Mia Chen',avatar:'https://i.pravatar.cc/150?img=5',text:'My summer song omg 🌸',ts:NOW-1800000,deleted:false},{id:7,userId:6,user:'Dante Cruz',avatar:'https://i.pravatar.cc/150?img=15',text:'Goes in every summer playlist',ts:NOW-300000,deleted:false}]},
  { id:6,  title:'Lunar Static',      artist:'Alex Rivera', userId:1, type:'single', genre:'EDM',    desc:'Deep space vibes mixed with heavy bass.', cover:'https://picsum.photos/seed/lunar/400',      likes:[3,5,7], reposts:[2], plays:8900, deleted:false,
    tracks:[], credits:[{role:'Producer',name:'Alex Rivera'},{role:'Bass Guitar',name:'Dante Cruz'},{role:'Mix',name:'Mia Chen'}],
    comments:[{id:8,userId:7,user:'Yuna Kim',avatar:'https://i.pravatar.cc/150?img=20',text:'That bass line goes so hard',ts:NOW-21600000,deleted:false}]},
  { id:7,  title:'Velvet Underground', artist:'Dante Cruz',  userId:6, type:'single', genre:'Rock',   desc:'Raw, distortion-heavy track inspired by late nights in the studio.', cover:'https://picsum.photos/seed/velvet/400',    likes:[1,2,3,5], reposts:[1], plays:11200, deleted:false,
    tracks:[], credits:[{role:'Lead Guitar',name:'Dante Cruz'},{role:'Rhythm Guitar',name:'Alex Rivera'},{role:'Drums',name:'Jordan Lee'}],
    comments:[{id:9,userId:5,user:'Riley Park',avatar:'https://i.pravatar.cc/150?img=11',text:'Guitar tone is *chef\'s kiss*',ts:NOW-7200000,deleted:false}]},
  { id:8,  title:'Softly',            artist:'Yuna Kim',    userId:7, type:'single', genre:'R&B',    desc:'A tender, slow-burn R&B track about vulnerability and trust.', cover:'https://picsum.photos/seed/softly/400',     likes:[1,2,3,5,6], reposts:[2,5], plays:18700, deleted:false,
    tracks:[], credits:[{role:'Artist',name:'Yuna Kim'},{role:'Songwriter',name:'Riley Park'},{role:'Piano',name:'Jordan Lee'},{role:'Mix',name:'Alex Rivera'}],
    comments:[{id:10,userId:2,user:'Mia Chen',avatar:'https://i.pravatar.cc/150?img=5',text:"Yuna's voice is just... unreal 😭",ts:NOW-14400000,deleted:false}]},
  { id:9,  title:'City Lights',       artist:'Mia Chen',    userId:2, type:'single', genre:'EDM',    desc:'Driving, hypnotic track inspired by midnight drives through downtown.', cover:'https://picsum.photos/seed/citylights/400', likes:[1,6,7], reposts:[7], plays:6400, deleted:false,
    tracks:[], credits:[{role:'Producer',name:'Mia Chen'},{role:'Synth',name:'Alex Rivera'},{role:'Mix',name:'Jordan Lee'}],
    comments:[]},
  { id:10, title:'Fracture',          artist:'Jordan Lee',  userId:3, type:'single', genre:'Jazz',   desc:'Experimental jazz fusion exploring dissonance and resolution.', cover:'https://picsum.photos/seed/fracture/400',   likes:[1,7], reposts:[], plays:3900, deleted:false,
    tracks:[], credits:[{role:'Composer',name:'Jordan Lee'},{role:'Bass',name:'Sam Torres'},{role:'Percussion',name:'Dante Cruz'}],
    comments:[]},
  { id:11, title:'Golden Hour',       artist:'Riley Park',  userId:5, type:'album',  genre:'Pop',    desc:'10-track album capturing the warmth of a summer that felt too short.', cover:'https://picsum.photos/seed/golden/400',    likes:[1,2,3,6,7], reposts:[1,2,3,6], plays:45000, deleted:false,
    tracks:[{title:'Golden',dur:'3:22'},{title:'Summer Kids',dur:'2:58'},{title:'Bloom (Redux)',dur:'3:10'},{title:'Telephone',dur:'3:44'},{title:'Drive',dur:'4:05'},{title:'July',dur:'3:31'},{title:'Softly ft. Yuna Kim',dur:'3:55'},{title:'Ocean',dur:'4:12'},{title:'Daydream',dur:'3:00'},{title:'Golden Hour (Reprise)',dur:'2:48'}],
    credits:[{role:'Artist',name:'Riley Park'},{role:'Songwriter (Track 7)',name:'Yuna Kim'},{role:'Producer',name:'Mia Chen'},{role:'Mix',name:'Alex Rivera'},{role:'Mastering',name:'Jordan Lee'}],
    comments:[{id:11,userId:7,user:'Yuna Kim',avatar:'https://i.pravatar.cc/150?img=20',text:'So honored to be on this 💛',ts:NOW-172800000,deleted:false}]},
  { id:12, title:'Ember',             artist:'Dante Cruz',  userId:6, type:'single', genre:'Rock',   desc:"Slow burn rock ballad. The one I almost didn't release.", cover:'https://picsum.photos/seed/ember/400',      likes:[2,3,5,7], reposts:[5], plays:7100, deleted:false,
    tracks:[], credits:[{role:'Guitar',name:'Dante Cruz'},{role:'Piano',name:'Jordan Lee'},{role:'Backing Vocals',name:'Riley Park'},{role:'Mix',name:'Alex Rivera'}],
    comments:[{id:12,userId:5,user:'Riley Park',avatar:'https://i.pravatar.cc/150?img=11',text:"Why did you almost not release this?? It's beautiful",ts:NOW-21600000,deleted:false}]},
]

// ─── Helpers ──────────────────────────────────────────────────────────────
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
const fmtTime  = (s: number) => `${Math.floor(s/60)}:${s%60<10?'0':''}${Math.floor(s%60)}`
const fmtPlays = (n: number) => n>=1e6 ? (n/1e6).toFixed(1)+'M' : n>=1000 ? (n/1000).toFixed(1)+'K' : String(n)
const timeAgo  = (ts: number) => { const d=(Date.now()-ts)/1000; if(d<60)return 'just now'; if(d<3600)return Math.floor(d/60)+'m ago'; if(d<86400)return Math.floor(d/3600)+'h ago'; return Math.floor(d/86400)+'d ago' }
const greeting = () => { const h=new Date().getHours(); return h<12?'Good morning':h<18?'Good afternoon':'Good evening' }
const GENRE_COLORS: Record<string,[string,string]> = {
  EDM:['#0d1b4d','#1a3a8f'], Indie:['#2d1b4d','#6b3fa0'], Jazz:['#1a2d1a','#2e7d32'],
  'Hip-Hop':['#2d1a0d','#7d3a0f'], Pop:['#4d1a2d','#b5185c'], Rock:['#2d0d0d','#8b1a1a'],
  'R&B':['#1a1a3d','#3a3a8f'], Classical:['#2d2d1a','#6b6b2a'], Other:['#1a1a1a','#444'],
}
const CREDIT_ROLES = ['Producer','Songwriter','Composer','Mix & Master','Mixing','Mastering','Vocalist','Lead Guitar','Rhythm Guitar','Bass Guitar','Drums','Piano','Keyboard','Synth Programming','Strings','Brass','Percussion','Backing Vocals','Feature','Recorded by','A&R','Other']

// ─── Reducer ──────────────────────────────────────────────────────────────
type Action =
  | { type: 'LOGIN'; user: User }
  | { type: 'LOGOUT' }
  | { type: 'REGISTER'; user: User }
  | { type: 'NAV'; page: Page }
  | { type: 'NAV_BACK' }
  | { type: 'NAV_FWD' }
  | { type: 'OPEN_SONG'; song: Song }
  | { type: 'TOGGLE_LIKE'; songId: number; userId: number }
  | { type: 'TOGGLE_REPOST'; songId: number; userId: number }
  | { type: 'POST_COMMENT'; songId: number; comment: Comment }
  | { type: 'DELETE_COMMENT'; songId: number; commentId: number }
  | { type: 'PLAY_SONG'; songId: number }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'NEXT_SONG' }
  | { type: 'PREV_SONG' }
  | { type: 'SET_PROGRESS'; progress: number }
  | { type: 'PLAYER_LIKE'; userId: number }
  | { type: 'TOAST'; msg: string }
  | { type: 'TOAST_HIDE' }
  | { type: 'SET_ADMIN_TAB'; tab: AdminTab }
  | { type: 'UPLOAD_SONG'; song: Song }
  | { type: 'UPDATE_SONG'; song: Song }
  | { type: 'DELETE_SONG'; songId: number }
  | { type: 'UPDATE_PROFILE'; userId: number; data: Partial<User> }
  | { type: 'BAN_TOGGLE'; userId: number }
  | { type: 'SET_EDIT_SONG'; id: number | null }
  | { type: 'REPLACE_SONGS'; songs: Song[] }
  | { type: 'SET_USERS'; users: User[] }

const INITIAL_STATE: AppState = {
  // In API mode start with empty data — gets loaded from server after login
  // In mock mode keep the full preset data
  currentUser: null,
  users: USE_API ? [] : INITIAL_USERS,
  songs: USE_API ? [] : INITIAL_SONGS,
  page: 'home', prevPage: 'home', navHistory: ['home'], navPos: 0,
  currentDetailSong: null, adminTab: 'users',
  player: { queue: [], index: -1, isPlaying: false, progress: 0, currentSong: null },
  toastMsg: '', toastShow: false, nextSongId: 13, nextUserId: 8, nextCommentId: 100,
  editSongId: null,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN':  return { ...state, currentUser: action.user, navHistory: ['home'], navPos: 0, page: 'home' }
    case 'LOGOUT': return { ...INITIAL_STATE, users: state.users, songs: state.songs }
    case 'REGISTER': return { ...state, currentUser: action.user, users: [...state.users, action.user], navHistory: ['home'], navPos: 0, page: 'home' }

    case 'NAV': {
      const h = state.navHistory.slice(0, state.navPos + 1)
      if (h[h.length-1] !== action.page) { h.push(action.page) }
      return { ...state, page: action.page, prevPage: state.page, navHistory: h, navPos: h.length - 1 }
    }
    case 'NAV_BACK': {
      if (state.navPos <= 0) return state
      const pos = state.navPos - 1
      return { ...state, page: state.navHistory[pos], navPos: pos }
    }
    case 'NAV_FWD': {
      if (state.navPos >= state.navHistory.length - 1) return state
      const pos = state.navPos + 1
      return { ...state, page: state.navHistory[pos], navPos: pos }
    }

    case 'OPEN_SONG': {
      const h = state.navHistory.slice(0, state.navPos + 1)
      h.push('song-detail')
      return { ...state, currentDetailSong: action.song, page: 'song-detail', prevPage: state.page, navHistory: h, navPos: h.length - 1 }
    }

    case 'TOGGLE_LIKE': {
      const songs = state.songs.map(s => {
        if (s.id !== action.songId) return s
        const has = s.likes.includes(action.userId)
        return { ...s, likes: has ? s.likes.filter(id => id !== action.userId) : [...s.likes, action.userId] }
      })
      const det = state.currentDetailSong?.id === action.songId
        ? songs.find(s => s.id === action.songId) ?? state.currentDetailSong : state.currentDetailSong
      return { ...state, songs, currentDetailSong: det ?? null }
    }

    case 'TOGGLE_REPOST': {
      const songs = state.songs.map(s => {
        if (s.id !== action.songId) return s
        const has = s.reposts.includes(action.userId)
        return { ...s, reposts: has ? s.reposts.filter(id => id !== action.userId) : [...s.reposts, action.userId] }
      })
      const det = state.currentDetailSong?.id === action.songId
        ? songs.find(s => s.id === action.songId) ?? state.currentDetailSong : state.currentDetailSong
      return { ...state, songs, currentDetailSong: det ?? null }
    }

    case 'POST_COMMENT': {
      const songs = state.songs.map(s =>
        s.id === action.songId ? { ...s, comments: [...s.comments, action.comment] } : s)
      const det = state.currentDetailSong?.id === action.songId
        ? songs.find(s => s.id === action.songId) ?? state.currentDetailSong : state.currentDetailSong
      return { ...state, songs, currentDetailSong: det ?? null, nextCommentId: state.nextCommentId + 1 }
    }

    case 'DELETE_COMMENT': {
      const songs = state.songs.map(s =>
        s.id === action.songId ? { ...s, comments: s.comments.map(c => c.id === action.commentId ? { ...c, deleted: true } : c) } : s)
      const det = state.currentDetailSong?.id === action.songId
        ? songs.find(s => s.id === action.songId) ?? state.currentDetailSong : state.currentDetailSong
      return { ...state, songs, currentDetailSong: det ?? null }
    }

    case 'PLAY_SONG': {
      const queue = state.songs.filter(s => !s.deleted)
      const idx   = queue.findIndex(s => s.id === action.songId)
      if (idx === -1) return state
      const songs = state.songs.map(s => s.id === action.songId ? { ...s, plays: s.plays + 1 } : s)
      return { ...state, songs, player: { queue, index: idx, isPlaying: true, progress: 0, currentSong: queue[idx] } }
    }

    case 'TOGGLE_PLAY':
      return { ...state, player: { ...state.player, isPlaying: !state.player.isPlaying } }

    case 'NEXT_SONG': {
      const { queue, index } = state.player
      if (!queue.length) return state
      const nextIdx = (index + 1) % queue.length
      return { ...state, player: { ...state.player, index: nextIdx, currentSong: queue[nextIdx], progress: 0, isPlaying: true } }
    }

    case 'PREV_SONG': {
      const { queue, index } = state.player
      if (!queue.length) return state
      const prevIdx = (index - 1 + queue.length) % queue.length
      return { ...state, player: { ...state.player, index: prevIdx, currentSong: queue[prevIdx], progress: 0, isPlaying: true } }
    }

    case 'SET_PROGRESS':
      return { ...state, player: { ...state.player, progress: action.progress } }

    case 'PLAYER_LIKE': {
      const s = state.player.currentSong
      if (!s) return state
      const has = s.likes.includes(action.userId)
      const updated = { ...s, likes: has ? s.likes.filter(id => id !== action.userId) : [...s.likes, action.userId] }
      const songs = state.songs.map(so => so.id === s.id ? updated : so)
      const queue = state.player.queue.map(so => so.id === s.id ? updated : so)
      return { ...state, songs, player: { ...state.player, queue, currentSong: updated } }
    }

    case 'TOAST': return { ...state, toastMsg: action.msg, toastShow: true }
    case 'TOAST_HIDE': return { ...state, toastShow: false }
    case 'SET_ADMIN_TAB': return { ...state, adminTab: action.tab }

    case 'UPLOAD_SONG':
      return { ...state, songs: [...state.songs, action.song], nextSongId: state.nextSongId + 1 }

    case 'UPDATE_SONG':
      return { ...state, songs: state.songs.map(s => s.id === action.song.id ? action.song : s) }

    case 'DELETE_SONG':
      return { ...state, songs: state.songs.map(s => s.id === action.songId ? { ...s, deleted: true } : s) }

    case 'UPDATE_PROFILE':
      return {
        ...state,
        users: state.users.map(u => u.id === action.userId ? { ...u, ...action.data } : u),
        currentUser: state.currentUser?.id === action.userId ? { ...state.currentUser, ...action.data } : state.currentUser,
        songs: state.songs.map(s => s.userId === action.userId && action.data.name ? { ...s, artist: action.data.name! } : s),
      }

    case 'BAN_TOGGLE':
      return { ...state, users: state.users.map(u => u.id === action.userId ? { ...u, banned: !u.banned } : u) }

    case 'SET_EDIT_SONG': return { ...state, editSongId: action.id }

    case 'REPLACE_SONGS': return { ...state, songs: action.songs }
    case 'SET_USERS':     return { ...state, users: action.users }

    default: return state
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────

// Avatar helper
function Avatar({ user, size = 32 }: { user: User | null; size?: number }) {
  if (!user) return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.37 }}>?</div>
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.37 }}>
      {user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name)}
    </div>
  )
}

// Song thumbnail helper
function SongThumb({ cover, size = 40 }: { cover: string; size?: number }) {
  return (
    <div className="song-row-thumb" style={{ width: size, height: size }}>
      {cover ? <img src={cover} alt="" /> : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface3)' }}><i className="fas fa-music" style={{ color:'var(--muted)',fontSize:14 }} /></div>}
    </div>
  )
}

// Song row in table
function SongRow({ song, num, userId, isAdmin, canEdit, onPlay, onOpen, onEdit, onDelete }:{
  song: Song; num: number; userId: number; isAdmin: boolean; canEdit: boolean
  onPlay:()=>void; onOpen:()=>void; onEdit:()=>void; onDelete:()=>void
}) {
  const liked = song.likes.includes(userId)
  return (
    <tr onClick={onOpen}>
      <td><span className="song-row-num">{num}</span></td>
      <td><div className="song-row-info"><SongThumb cover={song.cover}/><div><div className="song-row-title">{song.title}</div><div className="song-row-artist">{song.artist}</div></div></div></td>
      <td><span className="genre-pill">{song.genre}</span></td>
      <td style={{ textAlign:'right', color:'var(--muted)', fontSize:13 }}>{fmtPlays(song.plays)}</td>
      <td>
        <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end' }}>
          <button className="song-action player-ctrl" onClick={e=>{e.stopPropagation();onPlay()}} style={{ color:'var(--muted)' }}><i className="fas fa-circle-play" style={{ fontSize:18 }} /></button>
          <span className="song-action" style={{ color:'var(--muted)',fontSize:12,minWidth:24,textAlign:'center' }}>{song.likes.length}</span>
          <i className={`song-action ${liked?'fas':'far'} fa-heart`} style={{ fontSize:14, color:liked?'var(--gold)':'var(--muted)' }} />
          {canEdit && <button className="song-action player-ctrl" onClick={e=>{e.stopPropagation();onEdit()}} style={{ color:'var(--muted)' }}><i className="fas fa-pen" style={{ fontSize:13 }} /></button>}
          {isAdmin && <button className="song-action player-ctrl" onClick={e=>{e.stopPropagation();onDelete()}} style={{ color:'var(--red)' }}><i className="fas fa-trash" style={{ fontSize:13 }} /></button>}
        </div>
      </td>
    </tr>
  )
}

// Song table wrapper
function SongTable({ songs, userId, isAdmin, onPlay, onOpen, onEdit, onDelete }: {
  songs: Song[]; userId: number; isAdmin: boolean
  onPlay:(id:number)=>void; onOpen:(s:Song)=>void; onEdit:(id:number)=>void; onDelete:(id:number)=>void
}) {
  return (
    <table className="song-table">
      <thead><tr><th style={{ width:32 }}>#</th><th>Title</th><th>Genre</th><th style={{ textAlign:'right' }}>Plays</th><th style={{ width:80 }} /></tr></thead>
      <tbody>
        {songs.map((s, i) => (
          <SongRow key={s.id} song={s} num={i+1} userId={userId} isAdmin={isAdmin}
            canEdit={userId === s.userId || isAdmin}
            onPlay={() => onPlay(s.id)} onOpen={() => onOpen(s)}
            onEdit={() => onEdit(s.id)} onDelete={() => onDelete(s.id)} />
        ))}
      </tbody>
    </table>
  )
}

// Quick pick item
function QuickItem({ song, onOpen, onPlay }: { song: Song; onOpen:()=>void; onPlay:(e:React.MouseEvent)=>void }) {
  return (
    <div className="quick-item" onClick={onOpen}>
      <div className="qi-img">{song.cover ? <img src={song.cover} alt="" /> : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface3)' }}><i className="fas fa-music" style={{ color:'var(--muted)',fontSize:14 }} /></div>}</div>
      <span className="qi-text">{song.title}</span>
      <div className="qi-play" onClick={onPlay}><i className="fas fa-play" style={{ color:'var(--black)',fontSize:14 }} /></div>
    </div>
  )
}

// ─── Page: Auth ──────────────────────────────────────────────────────────
function AuthPage({ dispatch, onLogin, onRegister }: {
  dispatch: React.Dispatch<Action>
  onLogin: (email:string, password:string) => Promise<void>
  onRegister: (data:{first_name:string;last_name:string;username:string;email:string;password:string}) => Promise<void>
}) {
  const [mode, setMode] = useState<'login'|'register'>('login')
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('')
  const [fname, setFname] = useState(''); const [lname, setLname] = useState('')
  const [uname, setUname] = useState(''); const [remail, setRemail] = useState(''); const [rpass, setRpass] = useState('')

  const doLogin = () => {
    onLogin(email, pass)
  }
  const quickLogin = (type: 'user'|'admin') => {
    onLogin(type==='admin'?'alex@demo.com':'mia@demo.com', 'demo123')
  }
  const doRegister = () => {
    if (!fname||!lname||!uname||!remail||!rpass) { dispatch({ type:'TOAST', msg:'⚠️ Fill all fields' }); return }
    onRegister({ first_name:fname, last_name:lname, username:uname, email:remail, password:rpass })
  }

  return (
    <div id="auth-screen">
      <div className="auth-box fade-in">
        <div className="auth-logo">
          <div className="logo-circle"><i className="fas fa-headphones" style={{ fontSize:22,color:'var(--black)' }} /></div>
          <div style={{ fontSize:24,fontWeight:800,marginBottom:4,background:'var(--gold-grad)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>5Days Radio</div>
          <div style={{ color:'var(--muted)',fontSize:13 }}>Millions of tracks. Free forever.</div>
        </div>

        {mode === 'login' ? (
          <>
            <div className="form-row"><label className="form-label">Email</label><input className="form-input" type="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} /></div>
            <div className="form-row"><label className="form-label">Password</label><input className="form-input" type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()} /></div>
            <button className="btn btn-green" style={{ width:'100%',justifyContent:'center',marginTop:8 }} onClick={doLogin}>Log In</button>
            <div className="auth-divider">or</div>
            <div className="demo-pills">
              <div className="demo-pill" onClick={()=>quickLogin('user')}>🎵 Demo User</div>
              <div className="demo-pill" onClick={()=>quickLogin('admin')}>⭐ Demo Admin</div>
            </div>
            <div className="auth-switch">Don't have an account? <a onClick={()=>setMode('register')}>Sign up here</a></div>
          </>
        ) : (
          <>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }} className="form-row">
              <div><label className="form-label">First Name</label><input className="form-input" placeholder="John" value={fname} onChange={e=>setFname(e.target.value)} /></div>
              <div><label className="form-label">Last Name</label><input className="form-input" placeholder="Doe" value={lname} onChange={e=>setLname(e.target.value)} /></div>
            </div>
            <div className="form-row"><label className="form-label">Username</label><input className="form-input" placeholder="coolartist" value={uname} onChange={e=>setUname(e.target.value)} /></div>
            <div className="form-row"><label className="form-label">Email</label><input className="form-input" type="email" placeholder="name@example.com" value={remail} onChange={e=>setRemail(e.target.value)} /></div>
            <div className="form-row"><label className="form-label">Password</label><input className="form-input" type="password" placeholder="Create a password" value={rpass} onChange={e=>setRpass(e.target.value)} /></div>
            <button className="btn btn-green" style={{ width:'100%',justifyContent:'center',marginTop:8 }} onClick={doRegister}>Create Account</button>
            <div className="auth-switch">Already have an account? <a onClick={()=>setMode('login')}>Log in here</a></div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page: Home ──────────────────────────────────────────────────────────
function HomePage({ songs, user, dispatch, onPlay, onOpen, onDelete }: {
  songs: Song[]; user: User; dispatch: React.Dispatch<Action>
  onPlay:(id:number)=>void; onOpen:(s:Song)=>void; onDelete:(id:number)=>void
}) {
  const active = songs.filter(s => !s.deleted)
  const trending = [...active].sort((a,b) => b.plays - a.plays)
  const onEdit = (id: number) => { dispatch({ type:'SET_EDIT_SONG', id }); dispatch({ type:'NAV', page:'upload' }) }

  return (
    <div className="page-content" style={{ paddingTop:8 }}>
      <h2 className="h2" style={{ marginBottom:16 }}>{greeting()}, {user.name.split(' ')[0]}</h2>
      <div className="quick-grid">
        {active.slice(0,6).map(s => <QuickItem key={s.id} song={s} onOpen={()=>onOpen(s)} onPlay={e=>{e.stopPropagation();onPlay(s.id)}} />)}
      </div>
      <h2 className="h2">Trending Now</h2>
      <SongTable songs={trending} userId={user.id} isAdmin={user.role==='admin'}
        onPlay={onPlay} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

// ─── Page: Explore ────────────────────────────────────────────────────────
function ExplorePage({ songs, user, dispatch, onPlay, onOpen, onDelete }: {
  songs: Song[]; user: User; dispatch: React.Dispatch<Action>
  onPlay:(id:number)=>void; onOpen:(s:Song)=>void; onDelete:(id:number)=>void
}) {
  const [q, setQ] = useState('')
  const active = songs.filter(s => !s.deleted)
  const filtered = q ? active.filter(s => s.title.toLowerCase().includes(q.toLowerCase()) || s.artist.toLowerCase().includes(q.toLowerCase()) || s.genre.toLowerCase().includes(q.toLowerCase())) : active
  const onEdit = (id: number) => { dispatch({ type:'SET_EDIT_SONG', id }); dispatch({ type:'NAV', page:'upload' }) }
  return (
    <div className="page-content" style={{ paddingTop:24 }}>
      <h1 className="h1" style={{ marginBottom:20 }}>Explore</h1>
      <div className="search-wrap"><i className="fas fa-search" /><input className="search-input" placeholder="What do you want to listen to?" value={q} onChange={e=>setQ(e.target.value)} /></div>
      {q && <p style={{ color:'var(--muted)',fontSize:13,marginBottom:16 }}>{filtered.length} result(s) for "<strong style={{ color:'var(--text)' }}>{q}</strong>"</p>}
      <SongTable songs={filtered} userId={user.id} isAdmin={user.role==='admin'}
        onPlay={onPlay} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

// ─── Page: Library ────────────────────────────────────────────────────────
function LibraryPage({ songs, user, dispatch, onPlay, onOpen, onDelete }: {
  songs: Song[]; user: User; dispatch: React.Dispatch<Action>
  onPlay:(id:number)=>void; onOpen:(s:Song)=>void; onDelete:(id:number)=>void
}) {
  const active = songs.filter(s => !s.deleted)
  const liked   = active.filter(s => s.likes.includes(user.id))
  const uploads = active.filter(s => s.userId === user.id)
  const onEdit = (id: number) => { dispatch({ type:'SET_EDIT_SONG', id }); dispatch({ type:'NAV', page:'upload' }) }
  return (
    <div className="page-content" style={{ paddingTop:24 }}>
      <h1 className="h1" style={{ marginBottom:24 }}>Your Library</h1>
      <h2 className="h2">Liked Songs</h2>
      {liked.length > 0 && <div className="quick-grid" style={{ marginBottom:16 }}>{liked.slice(0,4).map(s=><QuickItem key={s.id} song={s} onOpen={()=>onOpen(s)} onPlay={e=>{e.stopPropagation();onPlay(s.id)}} />)}</div>}
      {liked.length > 0 ? <SongTable songs={liked} userId={user.id} isAdmin={user.role==='admin'} onPlay={onPlay} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} /> : <p style={{ color:'var(--muted)',padding:'0 0 24px' }}>No liked songs yet.</p>}
      <h2 className="h2" style={{ marginTop:32 }}>Your Uploads</h2>
      {uploads.length > 0 ? <SongTable songs={uploads} userId={user.id} isAdmin={user.role==='admin'} onPlay={onPlay} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} /> : <p style={{ color:'var(--muted)' }}>No uploads yet.</p>}
    </div>
  )
}

// ─── Page: Profile ────────────────────────────────────────────────────────
function ProfilePage({ user, songs, dispatch, onOpen, onDelete, onUpdateProfile }: {
  user: User; songs: Song[]; dispatch: React.Dispatch<Action>
  onOpen:(s:Song)=>void; onDelete:(id:number)=>void
  onUpdateProfile:(data:Partial<User>&{old_password?:string;new_password?:string})=>Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name); const [uname, setUname] = useState(user.username)
  const [bio, setBio] = useState(user.bio); const [avatar, setAvatar] = useState(user.avatar)
  const [oldPass, setOldPass] = useState(''); const [newPass, setNewPass] = useState('')

  const mySongs = songs.filter(s => !s.deleted && s.userId === user.id)
  const onSave = () => {
    if (!name) { dispatch({ type:'TOAST', msg:'⚠️ Name cannot be empty' }); return }
    if (oldPass && newPass && oldPass !== user.password) { dispatch({ type:'TOAST', msg:'❌ Wrong password' }); return }
    const data: Partial<User> & { old_password?:string; new_password?:string } = { name, username:uname, bio, avatar }
    if (oldPass && newPass) { data.old_password = oldPass; data.new_password = newPass }
    onUpdateProfile(data)
    setEditing(false); setOldPass(''); setNewPass('')
  }
  const onEdit2 = (id: number) => { dispatch({ type:'SET_EDIT_SONG', id }); dispatch({ type:'NAV', page:'upload' }) }

  return (
    <>
      <div className="profile-hero">
        <div className="avatar avatar-xxl">{user.avatar ? <img src={user.avatar} alt="" /> : initials(user.name)}</div>
        <div className="profile-hero-info">
          <div className="kind">Profile</div>
          <div className="pname">{user.name}</div>
          <div className="pmeta"><span>{user.followers.toLocaleString()}</span> followers &nbsp;·&nbsp; <span>{user.following.toLocaleString()}</span> following &nbsp;·&nbsp; <span>{mySongs.length}</span> songs</div>
          {user.bio && <div style={{ marginTop:4,color:'rgba(255,255,255,.6)',fontSize:13 }}>{user.bio}</div>}
        </div>
      </div>
      <div className="page-content" style={{ paddingTop:24 }}>
        <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:24 }}>
          <button className="btn btn-green" onClick={()=>setEditing(true)}>Edit Profile</button>
          {user.role==='admin' && <span className="badge-green">ADMIN</span>}
        </div>
        <h2 className="h2">My Music</h2>
        {mySongs.length > 0 ? <SongTable songs={mySongs} userId={user.id} isAdmin={user.role==='admin'} onPlay={id=>dispatch({type:'PLAY_SONG',songId:id})} onOpen={onOpen} onEdit={onEdit2} onDelete={onDelete} /> : <p style={{ color:'var(--muted)' }}>No music uploaded yet.</p>}
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={()=>setEditing(false)}>
          <div className="modal-box fade-in" onClick={e=>e.stopPropagation()}>
            <h3 className="modal-title">Edit Profile</h3>
            <div className="form-row"><label className="form-label">Display Name</label><input className="form-input" value={name} onChange={e=>setName(e.target.value)} /></div>
            <div className="form-row"><label className="form-label">Username</label><input className="form-input" value={uname} onChange={e=>setUname(e.target.value)} /></div>
            <div className="form-row"><label className="form-label">Bio</label><textarea className="form-input" value={bio} onChange={e=>setBio(e.target.value)} /></div>
            <div className="form-row"><label className="form-label">Avatar URL</label><input className="form-input" value={avatar} onChange={e=>setAvatar(e.target.value)} placeholder="https://..." /></div>
            <div style={{ borderTop:'1px solid rgba(255,255,255,.1)',paddingTop:20,marginTop:4 }}>
              <p style={{ fontSize:13,fontWeight:700,marginBottom:12 }}>Change Password</p>
              <div className="form-row"><input className="form-input" type="password" placeholder="Current password" value={oldPass} onChange={e=>setOldPass(e.target.value)} /></div>
              <div className="form-row"><input className="form-input" type="password" placeholder="New password" value={newPass} onChange={e=>setNewPass(e.target.value)} /></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline btn-sm" onClick={()=>setEditing(false)}>Cancel</button>
              <button className="btn btn-green btn-sm" onClick={onSave}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Page: Admin ──────────────────────────────────────────────────────────
function AdminPage({ users, songs, tab, currentUser, dispatch, onBanToggle, onDeleteSong, onDeleteComment }: {
  users: User[]; songs: Song[]; tab: AdminTab; currentUser: User; dispatch: React.Dispatch<Action>
  onBanToggle:(userId:number)=>void; onDeleteSong:(id:number)=>void; onDeleteComment:(songId:number,commentId:number)=>void
}) {
  const allComments = songs.flatMap(s => s.comments.filter(c=>!c.deleted).map(c=>({ ...c, songId:s.id, songTitle:s.title })))
  return (
    <div className="page-content" style={{ paddingTop:24 }}>
      <h1 className="h1" style={{ marginBottom:4 }}>Admin Panel</h1>
      <p style={{ color:'var(--muted)',marginBottom:24 }}>Manage users, content, and platform safety</p>
      <div className="admin-tabs">
        {(['users','songs','comments'] as AdminTab[]).map(t => <div key={t} className={`admin-tab${tab===t?' active':''}`} onClick={()=>dispatch({type:'SET_ADMIN_TAB',tab:t})}>{t.charAt(0).toUpperCase()+t.slice(1)}</div>)}
      </div>

      {tab === 'users' && users.map(u => (
        <div key={u.id} className="admin-card">
          <Avatar user={u} />
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:2 }}>
              <span style={{ fontWeight:700,fontSize:14 }}>{u.name}</span>
              {u.role==='admin' && <span className="badge-green">ADMIN</span>}
              {u.banned && <span className="badge-red">BANNED</span>}
            </div>
            <div style={{ fontSize:12,color:'var(--muted)' }}>@{u.username} · {u.email}</div>
            <div style={{ fontSize:11,color:'var(--subtle)',marginTop:2 }}>{songs.filter(s=>s.userId===u.id&&!s.deleted).length} songs · {u.followers.toLocaleString()} followers</div>
          </div>
          {u.id !== currentUser.id
            ? <button className={`btn ${u.banned?'btn-outline':'btn-red'} btn-sm`} onClick={()=>onBanToggle(u.id)}>{u.banned?'Unban':'Ban'}</button>
            : <span style={{ fontSize:12,color:'var(--muted)' }}>You</span>}
        </div>
      ))}

      {tab === 'songs' && (songs.filter(s=>!s.deleted).length > 0
        ? songs.filter(s=>!s.deleted).map(s => (
          <div key={s.id} className="admin-card">
            <SongThumb cover={s.cover} />
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontWeight:700,fontSize:14 }}>{s.title}</div>
              <div style={{ fontSize:12,color:'var(--muted)' }}>{s.artist} · {s.genre} · {fmtPlays(s.plays)} plays · ❤️ {s.likes.length} · 💬 {s.comments.filter(c=>!c.deleted).length}</div>
            </div>
            <button className="btn btn-red btn-sm" onClick={()=>onDeleteSong(s.id)}>Delete</button>
          </div>
        ))
        : <p style={{ color:'var(--muted)',padding:16 }}>No songs.</p>
      )}

      {tab === 'comments' && (allComments.length > 0
        ? allComments.map(c => (
          <div key={c.id} className="admin-card">
            <div className="avatar" style={{ width:32,height:32,fontSize:12 }}>{initials(c.user)}</div>
            <div style={{ flex:1,minWidth:0 }}>
              <span style={{ fontWeight:700,fontSize:13 }}>{c.user}</span>
              <span style={{ color:'var(--muted)',fontSize:11,margin:'0 8px' }}>on "{c.songTitle}"</span>
              <span style={{ color:'var(--subtle)',fontSize:11 }}>{timeAgo(c.ts)}</span>
              <p style={{ fontSize:13,color:'var(--muted)',marginTop:4 }}>{c.text}</p>
            </div>
            <button className="btn btn-red btn-sm" onClick={()=>onDeleteComment(c.songId, c.id)}>Delete</button>
          </div>
        ))
        : <p style={{ color:'var(--muted)',padding:16 }}>No comments.</p>
      )}
    </div>
  )
}

// ─── Page: Song Detail ────────────────────────────────────────────────────
function SongDetailPage({ song, songs, user, player, dispatch, onLike, onRepost, onComment, onDeleteComment, onPlay }: {
  song: Song; songs: Song[]; user: User; player: PlayerState; dispatch: React.Dispatch<Action>
  onLike:(id:number)=>void; onRepost:(id:number)=>void
  onComment:(songId:number,text:string)=>void; onDeleteComment:(songId:number,commentId:number)=>void
  onPlay:(id:number)=>void
}) {
  const [commentText, setCommentText] = useState('')
  const [c1, c2] = GENRE_COLORS[song.genre] ?? GENRE_COLORS['Other']
  const liked    = song.likes.includes(user.id)
  const reposted = song.reposts.includes(user.id)
  const isPlaying = player.currentSong?.id === song.id && player.isPlaying
  const activeComments = song.comments.filter(c => !c.deleted)

  const postComment = () => {
    if (!commentText.trim()) return
    onComment(song.id, commentText.trim())
    setCommentText('')
  }

  // aggregate credits
  let allCredits: Credit[] = []
  if (song.tracks.length > 0) {
    song.tracks.forEach(t => t.credits?.forEach(c => { if (!allCredits.find(x=>x.role===c.role&&x.name===c.name)) allCredits.push(c) }))
  }
  if (allCredits.length === 0 && song.credits) allCredits = song.credits
  const grouped = allCredits.reduce<Record<string,string[]>>((acc, c) => {
    if (!acc[c.role]) acc[c.role] = []
    if (!acc[c.role].includes(c.name)) acc[c.role].push(c.name)
    return acc
  }, {})

  // Tracklist: all songs by the same artist, current song highlighted
  const tracklist = [...songs]
    .filter(s => !s.deleted && s.userId === song.userId)
    .sort((a, b) => {
      // current song always first, then by plays descending
      if (a.id === song.id) return -1
      if (b.id === song.id) return 1
      return b.plays - a.plays
    })

  return (
    <>
      {/* Hero */}
      <div className="song-detail-hero">
        <div className="song-detail-hero-bg" style={song.cover ? { backgroundImage:`url(${song.cover})` } : { background:`linear-gradient(160deg,${c1},${c2})` }} />
        <div className="song-detail-hero-overlay" />
        <div className="song-detail-cover">
          {song.cover ? <img src={song.cover} alt="" /> : <div className="cover-icon"><i className="fas fa-music" style={{ color:'var(--muted)',fontSize:48 }} /></div>}
        </div>
        <div className="song-detail-meta">
          <div className="kind">{song.type.charAt(0).toUpperCase()+song.type.slice(1)}</div>
          <div className="stitle">{song.title}</div>
          <div className="sartist"><span>{song.artist}</span> &nbsp;·&nbsp; {new Date().getFullYear()} &nbsp;·&nbsp; <span>{song.genre}</span></div>
        </div>
      </div>

      {/* Actions */}
      <div className="song-detail-actions">
        <button className="btn btn-green" style={{ padding:'14px 32px',fontSize:15 }} onClick={()=>isPlaying?dispatch({type:'TOGGLE_PLAY'}):onPlay(song.id)}>
          <i className={`fas ${isPlaying?'fa-pause':'fa-play'}`} />{isPlaying?'Pause':'Play'}
        </button>
        <button className={`action-btn-icon${liked?' active':''}`} onClick={()=>onLike(song.id)}>
          <i className={`${liked?'fas':'far'} fa-heart`} /><span>{song.likes.length}</span>
        </button>
        <button className={`action-btn-icon${reposted?' active':''}`} onClick={()=>onRepost(song.id)}>
          <i className="fas fa-repeat" /><span>{song.reposts.length}</span>
        </button>
        <button className="action-btn-icon">
          <i className="fas fa-comment" /><span>{activeComments.length}</span>
        </button>
        <button className="action-btn-icon" style={{ marginLeft:'auto' }} onClick={()=>dispatch({type:'NAV_BACK'})}>
          <i className="fas fa-arrow-left" /><span>Back</span>
        </button>
      </div>

      {/* Description */}
      {song.desc && <div style={{ padding:'0 24px 20px',color:'var(--muted)',fontSize:13,maxWidth:600,lineHeight:1.6 }}>{song.desc}</div>}

      {/* Album tracks */}
      {song.type==='album' && song.tracks.length>0 && (
        <>
          <div className="song-detail-section-title" style={{ paddingTop:0,paddingBottom:12 }}>Tracks</div>
          <div className="album-tracklist">
            {song.tracks.map((t,i) => (
              <div key={i} className="album-track-row">
                <span className="album-track-num">{i+1}</span>
                <div className="album-track-title">{t.title}</div>
                <span className="album-track-dur">{t.dur}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Credits */}
      {Object.keys(grouped).length > 0 && (
        <>
          <div className="song-detail-section-title" style={{ paddingTop:16,paddingBottom:12 }}>Credits</div>
          <div className="credits-grid">
            {Object.entries(grouped).map(([role,names]) => (
              <div key={role} style={{ minWidth:140 }}>
                <div className="credit-card-role">{role}</div>
                <div className="credit-card-names">{names.join(', ')}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Track listing — single shows 1 row, album shows all tracks */}
      <div className="song-detail-tracklist">
        <div className="tracklist-header">
          <span style={{ textAlign:'center' }}>#</span><span>Title</span><span style={{ textAlign:'center' }}>Likes</span><span style={{ textAlign:'right' }}>Duration</span>
        </div>
        {song.type === 'single' ? (
          // Single — one row for the song itself
          <div className={`tracklist-row${player.currentSong?.id===song.id&&player.isPlaying?' playing':''}`} onClick={()=>onPlay(song.id)}>
            <span className="tracklist-num">
              {player.currentSong?.id===song.id&&player.isPlaying
                ? <i className="fas fa-volume-high" style={{ fontSize:13,color:'var(--gold)' }} />
                : 1}
            </span>
            <div className="tracklist-info">
              <div className="tracklist-title">{song.title}</div>
              <div className="tracklist-artist">{song.artist}</div>
            </div>
            <div className="tracklist-actions">
              <button className={`action-btn-icon${song.likes.includes(user.id)?' active':''}`} onClick={e=>{e.stopPropagation();onLike(song.id)}} style={{ fontSize:12,gap:4 }}>
                <i className={`${song.likes.includes(user.id)?'fas':'far'} fa-heart`} style={{ fontSize:14 }} /><span>{song.likes.length}</span>
              </button>
            </div>
            <span className="tracklist-dur">{song.tracks?.[0]?.dur ?? ''}</span>
          </div>
        ) : (
          // Album — one row per track
          tracklist.map((t,i) => {
            const tPlaying = player.currentSong?.id===t.id && player.isPlaying
            const tLiked   = t.likes.includes(user.id)
            const trackDur = t.tracks?.[0]?.dur ?? ''
            return (
              <div key={t.id} className={`tracklist-row${tPlaying?' playing':''}`} onClick={()=>onPlay(t.id)}>
                <span className="tracklist-num">{tPlaying ? <i className="fas fa-volume-high" style={{ fontSize:13,color:'var(--gold)' }} /> : i+1}</span>
                <div className="tracklist-info"><div className="tracklist-title">{t.title}</div><div className="tracklist-artist">{t.artist}</div></div>
                <div className="tracklist-actions">
                  <button className={`action-btn-icon${tLiked?' active':''}`} onClick={e=>{e.stopPropagation();onLike(t.id)}} style={{ fontSize:12,gap:4 }}>
                    <i className={`${tLiked?'fas':'far'} fa-heart`} style={{ fontSize:14 }} /><span>{t.likes.length}</span>
                  </button>
                </div>
                <span className="tracklist-dur">{trackDur}</span>
              </div>
            )
          })
        )}
      </div>

      {/* Comments */}
      <div className="song-detail-section-title">Comments <span style={{ fontSize:14,fontWeight:400,color:'var(--muted)' }}>({activeComments.length})</span></div>
      <div className="song-detail-comments">
        {activeComments.length === 0 && <p style={{ color:'var(--muted)',fontSize:13,marginBottom:24 }}>No comments yet. Be the first!</p>}
        {activeComments.map(c => (
          <div key={c.id} className="comment-item">
            <div className="avatar">{c.avatar ? <img src={c.avatar} alt="" /> : initials(c.user)}</div>
            <div className="comment-body">
              <div className="comment-header">
                <span className="comment-username">{c.user}</span>
                <span className="comment-time">{timeAgo(c.ts)}</span>
                {user.role==='admin' && <button onClick={()=>onDeleteComment(song.id,c.id)} style={{ marginLeft:'auto',color:'var(--red)',background:'none',border:'none',cursor:'pointer' }}><i className="fas fa-trash" style={{ fontSize:12 }} /></button>}
              </div>
              <div className="comment-text">{c.text}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="comment-input-row">
        <Avatar user={user} />
        <input className="form-input" style={{ flex:1,borderRadius:99,padding:'10px 18px' }} placeholder="Write a comment…" value={commentText} onChange={e=>setCommentText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&postComment()} />
        <button className="btn btn-green btn-sm" onClick={postComment}>Post</button>
      </div>
    </>
  )
}

// ─── Page: Upload ─────────────────────────────────────────────────────────
interface TrackForm { id: number; title: string; audioName: string; audioData: string; audioFile: File | null; dur: string; credits: Credit[]; open: boolean }

function UploadPage({ user, songs, editSongId, dispatch, toast }: {
  user: User; songs: Song[]; editSongId: number | null; dispatch: React.Dispatch<Action>
  toast: (msg:string) => void
}) {
  const editSong = editSongId ? songs.find(s=>s.id===editSongId) : null
  const [title, setTitle]     = useState(editSong?.title ?? '')
  const [type, setType]       = useState<'single'|'album'>(editSong?.type ?? 'single')
  const [genre, setGenre]     = useState(editSong?.genre ?? 'Pop')
  const [desc, setDesc]       = useState(editSong?.desc ?? '')
  const [coverPreview, setCover] = useState(editSong?.cover ?? '')
  const [trackIdSeq, setTrackIdSeq] = useState(100)
  const [tracks, setTracks]   = useState<TrackForm[]>(() => {
    if (editSong) {
      if (editSong.type === 'album') return editSong.tracks.map((t,i) => ({ id:i, title:t.title, audioName:t.audioName??'', audioData:'', audioFile:null, dur:'', credits:t.credits??[], open:false }))
      return [{ id:0, title:'', audioName:'', audioData:'', audioFile:null, dur:'', credits:editSong.credits??[], open:true }]
    }
    return [{ id:0, title:'', audioName:'', audioData:'', audioFile:null, dur:'', credits:[{ role:'Producer', name:user.name }], open:true }]
  })

  const isAlbum = type === 'album'
  const coverRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editSong) { setTitle(editSong.title); setType(editSong.type); setGenre(editSong.genre); setDesc(editSong.desc); setCover(editSong.cover) }
  }, [editSongId])

  const handleCoverFile = (file: File) => {
    const r = new FileReader(); r.onload = e => setCover(e.target?.result as string); r.readAsDataURL(file)
  }

  const onTypeChange = (t: 'single'|'album') => {
    setType(t)
    if (t === 'album' && tracks.length <= 1 && !tracks[0]?.title) {
      const base = trackIdSeq; setTrackIdSeq(base+3)
      setTracks([{id:base,title:'',audioName:'',audioData:'',audioFile:null,dur:'',credits:[{role:'Producer',name:user.name}],open:true},{id:base+1,title:'',audioName:'',audioData:'',audioFile:null,dur:'',credits:[],open:false},{id:base+2,title:'',audioName:'',audioData:'',audioFile:null,dur:'',credits:[],open:false}])
    }
  }
  const addTrack = () => { setTracks(prev=>[...prev,{id:trackIdSeq,title:'',audioName:'',audioData:'',audioFile:null,dur:'',credits:[],open:true}]); setTrackIdSeq(p=>p+1) }
  const removeTrack = (id: number) => setTracks(prev=>prev.filter(t=>t.id!==id))
  const updateTrack = (id: number, patch: Partial<TrackForm>) => setTracks(prev=>prev.map(t=>t.id===id?{...t,...patch}:t))
  const addCredit = (trackId: number) => updateTrack(trackId, { credits:[...tracks.find(t=>t.id===trackId)!.credits,{role:'Producer',name:''}] })
  const updateCredit = (trackId: number, ci: number, patch: Partial<Credit>) => updateTrack(trackId, { credits: tracks.find(t=>t.id===trackId)!.credits.map((c,i)=>i===ci?{...c,...patch}:c) })
  const removeCredit = (trackId: number, ci: number) => updateTrack(trackId, { credits: tracks.find(t=>t.id===trackId)!.credits.filter((_,i)=>i!==ci) })

  const handleAudioFile = (trackId: number, file: File) => {
    // Read actual duration from the audio file
    const objUrl = URL.createObjectURL(file)
    const tmpAudio = new Audio(objUrl)
    tmpAudio.addEventListener('loadedmetadata', () => {
      const secs = Math.round(tmpAudio.duration)
      const mm   = Math.floor(secs / 60)
      const ss   = secs % 60
      updateTrack(trackId, { dur: `${mm}:${ss < 10 ? '0' : ''}${ss}` })
      URL.revokeObjectURL(objUrl)
    })
    // Store the File object and show filename immediately
    updateTrack(trackId, { audioName: file.name, audioFile: file })
    const r = new FileReader()
    r.onload = e => updateTrack(trackId, { audioData: e.target?.result as string })
    r.readAsDataURL(file)
  }

  const onSubmit = async () => {
    if (!title) { toast('⚠️ Title required'); return }

    const allC: Credit[] = []
    tracks.forEach(t => t.credits.forEach(c => { if (c.name && !allC.find(x=>x.role===c.role&&x.name===c.name)) allC.push(c) }))

    // For singles, always include a track row so dur gets stored in DB
    const finalTracks = isAlbum
      ? tracks.filter(t=>t.title).map(t=>({ title:t.title, dur: t.dur || '', audioName:t.audioName, credits:t.credits }))
      : [{ title: tracks[0]?.title || title, dur: tracks[0]?.dur || '', audioName: tracks[0]?.audioName || '', credits: tracks[0]?.credits || allC }]
    if (isAlbum && finalTracks.length === 0) { toast('⚠️ Add at least one track'); return }

    if (USE_API) {
      const fd = new FormData()
      fd.append('title', title); fd.append('type', type); fd.append('genre', genre); fd.append('description', desc)
      fd.append('tracks', JSON.stringify(finalTracks)); fd.append('credits', JSON.stringify(allC))

      // cover image
      if (coverPreview.startsWith('data:')) {
        const arr = coverPreview.split(','); const mime = arr[0].match(/:(.*?);/)?.[1] ?? 'image/jpeg'
        const bstr = atob(arr[1]); let n = bstr.length; const u8 = new Uint8Array(n)
        while(n--) u8[n] = bstr.charCodeAt(n)
        fd.append('cover', new Blob([u8], {type:mime}), 'cover.jpg')
      }

      // audio files — single gets field 'audio', album tracks get 'audio_0', 'audio_1', ...
      if (isAlbum) {
        finalTracks.forEach((_t, i) => {
          const trackForm = tracks.find(tf => tf.title === _t.title)
          if (trackForm?.audioFile) fd.append(`audio_${i}`, trackForm.audioFile)
        })
      } else {
        const audioFile = tracks[0]?.audioFile
        if (audioFile) fd.append('audio', audioFile)
      }
      if (editSong) {
        await apiCall(() => songApi.update(editSong.id, fd), () => {
          dispatch({ type:'UPDATE_SONG', song:{ ...editSong, title, type, genre, desc, cover:coverPreview||editSong.cover, tracks:finalTracks, credits:allC } })
          toast('✅ Song updated!')
        }, (err) => toast(`❌ ${err}`))
      } else {
        await apiCall(() => songApi.create(fd), (res) => {
          const newSong: Song = { id:res.song_id, title, type, genre, desc, cover:coverPreview, artist:user.name, userId:user.id, likes:[], reposts:[], comments:[], plays:0, deleted:false, tracks:finalTracks, credits:allC }
          dispatch({ type:'UPLOAD_SONG', song:newSong })
          toast('🎵 Music uploaded!')
        }, (err) => toast(`❌ ${err}`))
      }
    } else {
      if (editSong) {
        dispatch({ type:'UPDATE_SONG', song:{ ...editSong, title, type, genre, desc, cover:coverPreview||editSong.cover, tracks:finalTracks, credits:allC } })
        toast('✅ Song updated!')
      } else {
        const newSong: Song = { id:Date.now(), title, type, genre, desc, cover:coverPreview, artist:user.name, userId:user.id, likes:[], reposts:[], comments:[], plays:0, deleted:false, tracks:finalTracks, credits:allC }
        dispatch({ type:'UPLOAD_SONG', song:newSong })
        toast('🎵 Music uploaded!')
      }
    }
    dispatch({ type:'SET_EDIT_SONG', id:null })
    dispatch({ type:'NAV', page:'profile' })
  }

  return (
    <div className="page-content" style={{ paddingTop:24, maxWidth:680 }}>
      <h1 className="h1" style={{ marginBottom:8 }}>Upload Music</h1>
      <p style={{ color:'var(--muted)',marginBottom:24,fontSize:14 }}>Share your music with the world</p>
      <div className="form-box" style={{ maxWidth:'100%' }}>
        {/* Cover + title row */}
        <div style={{ display:'flex',gap:20,alignItems:'flex-start',marginBottom:16 }}>
          <div>
            <label className="form-label" style={{ marginBottom:8 }}>Cover Art</label>
            <div className={`cover-dropzone${coverPreview?' has-image':''}`}
              onClick={()=>coverRef.current?.click()}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f?.type.startsWith('image/'))handleCoverFile(f)}}>
              {coverPreview && <img src={coverPreview} alt="" />}
              <div className="cover-dz-label"><i className="fas fa-image" style={{ fontSize:24 }} /><span>Drop image<br/>or click</span><span style={{ fontSize:10,color:'var(--subtle)' }}>JPG · PNG</span></div>
              {coverPreview && <div style={{ position:'absolute',top:6,right:6,width:24,height:24,borderRadius:'50%',background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',zIndex:2 }} onClick={e=>{e.stopPropagation();setCover('')}}><i className="fas fa-xmark" style={{ fontSize:12,color:'#fff' }} /></div>}
              <input ref={coverRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)handleCoverFile(f)}} />
            </div>
          </div>
          <div style={{ flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:12 }}>
            <div><label className="form-label">Title *</label><input className="form-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="My awesome track" /></div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
              <div><label className="form-label">Type</label><select className="form-input" value={type} onChange={e=>onTypeChange(e.target.value as 'single'|'album')}><option value="single">Single</option><option value="album">Album</option></select></div>
              <div><label className="form-label">Genre</label><select className="form-input" value={genre} onChange={e=>setGenre(e.target.value)}>{['Pop','Rock','Hip-Hop','EDM','Jazz','Classical','R&B','Indie','Other'].map(g=><option key={g}>{g}</option>)}</select></div>
            </div>
            <div><label className="form-label">Description</label><textarea className="form-input" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Tell listeners about this track..." style={{ minHeight:64,resize:'none' }} /></div>
          </div>
        </div>

        {/* Tracks */}
        <div className="form-row" style={{ marginBottom:0 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
            <label className="form-label" style={{ marginBottom:0 }}>{isAlbum?'Tracks':'Track'}</label>
            {isAlbum && <button className="add-track-btn" style={{ width:'auto',padding:0 }} onClick={addTrack}><i className="fas fa-circle-plus" style={{ fontSize:15 }} />Add track</button>}
          </div>
          {tracks.map((t, tIdx) => (
            <div key={t.id} className={`track-card${t.open?' open':''}`}>
              <div className="track-card-header" onClick={()=>updateTrack(t.id,{open:!t.open})}>
                <span className="track-card-num">{tIdx+1}</span>
                <input className="track-card-title-input" placeholder={isAlbum?'Track title…':'Track title (optional)'} value={t.title} onChange={e=>updateTrack(t.id,{title:e.target.value})} onClick={e=>e.stopPropagation()} />
                <i className="fas fa-chevron-down track-card-chevron" />
                {isAlbum && <button className="track-card-remove" onClick={e=>{e.stopPropagation();removeTrack(t.id)}}><i className="fas fa-trash" style={{ fontSize:14 }} /></button>}
              </div>
              {t.open && (
                <div className="track-card-body">
                  <label className="form-label" style={{ marginBottom:6 }}>Audio File</label>
                  <div style={{ border:'1px dashed var(--subtle)',borderRadius:'var(--radius)',display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer',marginBottom:12,background:t.audioName?'rgba(201,168,76,.06)':'transparent',borderColor:t.audioName?'var(--gold-dim)':undefined }}
                    onClick={()=>document.getElementById(`aud_${t.id}`)?.click()}
                    onDragOver={e=>e.preventDefault()}
                    onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f?.type.startsWith('audio/'))handleAudioFile(t.id,f)}}>
                    <i className={`fas ${t.audioName?'fa-file-audio':'fa-file-arrow-up'}`} style={{ fontSize:18,color:t.audioName?'var(--gold)':'var(--muted)' }} />
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:13,fontWeight:600,color:t.audioName?'var(--text)':'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{t.audioName||'Drop MP3 / WAV or click to browse'}</div>
                      <div style={{ fontSize:11,color:'var(--subtle)',marginTop:1 }}>MP3 · WAV · FLAC</div>
                    </div>
                    {t.audioName && <button onClick={e=>{e.stopPropagation();updateTrack(t.id,{audioName:'',audioData:'',audioFile:null})}} style={{ color:'var(--subtle)',background:'none',border:'none',cursor:'pointer' }}><i className="fas fa-xmark" /></button>}
                    <input id={`aud_${t.id}`} type="file" accept="audio/*" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)handleAudioFile(t.id,f)}} />
                  </div>
                  <label className="form-label" style={{ margin:'12px 0 6px' }}>Credits</label>
                  {t.credits.map((c, ci) => (
                    <div key={ci} className="credit-item">
                      <select className="credit-role-select" value={c.role} onChange={e=>updateCredit(t.id,ci,{role:e.target.value})}>{CREDIT_ROLES.map(r=><option key={r}>{r}</option>)}</select>
                      <input className="credit-name-input" placeholder="Name…" value={c.name} onChange={e=>updateCredit(t.id,ci,{name:e.target.value})} />
                      <button style={{ color:'var(--subtle)',background:'none',border:'none',cursor:'pointer' }} onClick={()=>removeCredit(t.id,ci)}><i className="fas fa-circle-minus" style={{ fontSize:14 }} /></button>
                    </div>
                  ))}
                  <button className="add-track-btn" onClick={()=>addCredit(t.id)}><i className="fas fa-circle-plus" style={{ fontSize:15 }} />Add credit</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display:'flex',gap:10,marginTop:20 }}>
          <button className="btn btn-green" onClick={onSubmit}><i className={`fas ${editSong?'fa-floppy-disk':'fa-cloud-arrow-up'}`} />{editSong?'Save Changes':'Upload'}</button>
          {editSong && <button className="btn btn-outline" onClick={()=>{dispatch({type:'SET_EDIT_SONG',id:null});dispatch({type:'NAV',page:'profile'})}}>Cancel</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Player Bar ───────────────────────────────────────────────────────────
function PlayerBar({ player, user, dispatch }: { player: PlayerState; user: User | null; dispatch: React.Dispatch<Action> }) {
  const { currentSong: s, isPlaying, progress, queue } = player

  const audioRef = useRef<HTMLAudioElement>(null)

  const [duration, setDuration] = useState(0)
  const [volume, setVolume]     = useState(0.8)
  const [muted, setMuted]       = useState(false)
  const liked = user && s ? s.likes.includes(user.id) : false

  const audioSrc = s?.audio_url && s.audio_url !== resolveUrl(null)
    ? s.audio_url
    : (s?.tracks?.[0]?.audioData ?? s?.tracks?.[0]?.audio_url ?? '')

  // ── Play / pause ───────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      if (audioSrc && !audio.currentSrc) { audio.src = audioSrc; audio.load() }
      audio.play().catch(()=>{})
    } else {
      audio.pause()
    }
  }, [isPlaying])

  // ── Volume / mute ──────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = muted ? 0 : volume
  }, [volume, muted])

  // ── Load new track ─────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    setDuration(0)
    dispatch({ type: 'SET_PROGRESS', progress: 0 })
    if (audioSrc) { audio.src = audioSrc; audio.load(); if (isPlaying) audio.play().catch(()=>{}) }
    else audio.removeAttribute('src')
  }, [s?.id])

  // ── Events ─────────────────────────────────────────────────────────────
  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (audio && isFinite(audio.duration)) setDuration(audio.duration)
  }
  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    dispatch({ type: 'SET_PROGRESS', progress: (audio.currentTime / audio.duration) * 100 })
  }
  const handleEnded = () => dispatch({ type: 'NEXT_SONG' })
  const handleSeek  = (e: React.MouseEvent<HTMLDivElement>) => {
    const r   = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))
    dispatch({ type: 'SET_PROGRESS', progress: pct })
    const audio = audioRef.current
    if (audio?.duration) audio.currentTime = (pct / 100) * audio.duration
  }
  const handleVolClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setVolume(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
    setMuted(false)
  }

  const curSecs = duration > 0 ? Math.floor((progress / 100) * duration) : 0
  const durSecs = duration > 0 ? Math.floor(duration) : 0
  const volPct  = muted ? 0 : volume * 100
  const volIcon = muted || volume === 0 ? 'fa-volume-xmark' : volume < 0.4 ? 'fa-volume-low' : 'fa-volume-high'

  return (
    <footer id="player-bar">
      <audio ref={audioRef} onLoadedMetadata={handleLoadedMetadata} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} preload="metadata" />

      {/* Left */}
      <div className="player-left">
        <div className="player-cover">
          {s?.cover ? <img src={s.cover} alt="" /> : <div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface3)' }}><i className="fas fa-music" style={{ color:'var(--muted)',fontSize:18 }} /></div>}
        </div>
        <div className="player-track-info">
          <div className="player-title">{s?.title ?? '—'}</div>
          <div className="player-artist">{s?.artist ?? '—'}</div>
        </div>
        {user && s && <button className={`player-like${liked?' liked':''}`} onClick={()=>dispatch({type:'PLAYER_LIKE',userId:user.id})}><i className={`${liked?'fas':'far'} fa-heart`} /></button>}
      </div>

      {/* Center */}
      <div className="player-center">
        <div className="player-controls">
          <button className="player-ctrl"><i className="fas fa-shuffle" /></button>
          <button className="player-ctrl" onClick={()=>dispatch({type:'PREV_SONG'})}><i className="fas fa-backward-step" /></button>
          <button className="player-play" onClick={()=>{if(queue.length)dispatch({type:'TOGGLE_PLAY'})}}>
            <i className={`fas ${isPlaying?'fa-pause':'fa-play'}`} style={{ color:'var(--black)',fontSize:16 }} />
          </button>
          <button className="player-ctrl" onClick={()=>dispatch({type:'NEXT_SONG'})}><i className="fas fa-forward-step" /></button>
          <button className="player-ctrl"><i className="fas fa-repeat" /></button>
        </div>
        <div className="progress-row">
          <span className="progress-time">{durSecs > 0 ? fmtTime(curSecs) : '0:00'}</span>
          <div className="progress-track" onClick={handleSeek}>
            <div className="progress-fill" style={{ width:`${progress}%` }} />
          </div>
          <span className="progress-time">{durSecs > 0 ? fmtTime(durSecs) : '0:00'}</span>
        </div>
      </div>

      {/* Right — volume */}
      <div className="player-right">
        <button className="player-ctrl"><i className="fas fa-list" style={{ fontSize:14 }} /></button>
        <button className="player-ctrl" onClick={()=>setMuted(m=>!m)} title={muted?'Unmute':'Mute'}>
          <i className={`fas ${volIcon}`} style={{ fontSize:14 }} />
        </button>
        <div
          className="vol-track"
          onClick={handleVolClick}
          style={{ cursor:'pointer', position:'relative', width:80, height:4, background:'var(--surface3)', borderRadius:2, flexShrink:0 }}
        >
          <div style={{ position:'absolute', top:0, left:0, height:'100%', width:`${volPct}%`, background:'var(--gold-grad)', borderRadius:2 }} />
        </div>
      </div>
    </footer>
  )
}

// ─── API → local state converters ────────────────────────────────────────
function apiSongToLocal(s: ApiSong): Song {
  return {
    id:        s.id,
    title:     s.title,
    artist:    s.username,
    userId:    s.user_id,
    type:      s.type,
    genre:     s.genre,
    desc:      s.description ?? '',
    cover:     resolveUrl(s.cover_url),
    audio_url: resolveUrl(s.audio_url),
    likes:     [],
    reposts:   [],
    comments:  [],
    plays:     s.play_count,
    deleted:   Boolean(s.is_deleted),
    tracks:    (s.tracks ?? []).length > 0
      ? (s.tracks ?? []).map(t => ({ title:t.title, dur:t.duration ?? '', audio_url:resolveUrl(t.audio_url) }))
      // list endpoint has no tracks[] but gives first_track_dur — create synthetic entry
      : s.first_track_dur ? [{ title: s.title, dur: s.first_track_dur, audio_url: resolveUrl(s.audio_url) }] : [],
    credits: (s.credits ?? []).map(c => ({ role: c.role, name: c.name })),
  }
}

function apiUserToLocal(u: ApiUser): User {
  // /auth/me returns { id, username, email, role } — no first/last name
  // /api/users/:id returns full profile with first_name, last_name
  const fullName = (u.first_name && u.last_name)
    ? `${u.first_name} ${u.last_name}`
    : u.username   // fallback to username until profile is fetched
  return {
    id:        u.id,
    name:      fullName,
    username:  u.username,
    email:     u.email,
    password:  '',
    bio:       u.bio ?? '',
    avatar:    resolveUrl(u.avatar_url),
    role:      u.role,
    banned:    Boolean(u.is_banned),
    followers: u.followers_count ?? 0,
    following: u.following_count ?? 0,
  }
}

function apiCommentToLocal(c: ApiComment, songId: number): Comment {
  return {
    id:      c.id,
    userId:  c.user_id,
    user:    c.username,
    avatar:  resolveUrl(c.avatar_url),
    text:    c.body,
    ts:      new Date(c.created_at).getTime(),
    deleted: false,
  }
  void songId  // used by caller
}

// ─── Main App ─────────────────────────────────────────────────────────────
export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const { currentUser: user, page, songs, users, player, toastMsg, toastShow, adminTab, currentDetailSong, editSongId } = state
  const mainRef = useRef<HTMLDivElement>(null)
  const toast = useCallback((msg: string) => dispatch({ type:'TOAST', msg }), [])

  // ─── On mount: restore session if API is on ─────────────────────────────
  useEffect(() => {
    if (!USE_API) return
    apiCall(
      () => authApi.me(),
      ({ user: u }) => {
        dispatch({ type:'LOGIN', user: apiUserToLocal(u) })
        // load songs on session restore — replace mock data sepenuhnya
        apiCall(() => songApi.list({ limit:50 }), (rows) => {
          dispatch({ type:'REPLACE_SONGS', songs: rows.map(apiSongToLocal) })
        })
      },
    )
  }, [])

  // scroll to top on page change
  useEffect(() => { mainRef.current?.scrollTo(0, 0) }, [page])

  // toast auto-hide
  useEffect(() => {
    if (toastShow) { const t = setTimeout(() => dispatch({ type:'TOAST_HIDE' }), 2500); return () => clearTimeout(t) }
  }, [toastShow, toastMsg])

  // ─── Load songs when entering explore/home (API mode) ───────────────────
  useEffect(() => {
    if (!USE_API || !user) return
    if (page === 'home' || page === 'explore') {
      apiCall(() => songApi.list({ limit:50 }), (rows) => {
        dispatch({ type:'REPLACE_SONGS', songs: rows.map(apiSongToLocal) })
      })
    }
  }, [page, USE_API, user])

  // ─── Auth handlers ───────────────────────────────────────────────────────
  const handleLogin = useCallback(async (email: string, password: string) => {
    if (USE_API) {
      await apiCall(
        () => authApi.login(email, password),
        ({ user: u }) => {
          dispatch({ type:'LOGIN', user: apiUserToLocal(u) })
          toast('👋 Welcome back!')
          // preload songs — replace mock data sepenuhnya
          apiCall(() => songApi.list({ limit:50 }), rows =>
            dispatch({ type:'REPLACE_SONGS', songs: rows.map(apiSongToLocal) })
          )
        },
        (err) => toast(`❌ ${err}`),
      )
    } else {
      const u = users.find(x => x.email === email && x.password === password)
      if (!u)         { toast('❌ Invalid email or password'); return }
      if (u.banned)   { toast('🚫 Account banned'); return }
      dispatch({ type:'LOGIN', user: u })
    }
  }, [USE_API, users, toast])

  const handleRegister = useCallback(async (data: {
    first_name:string; last_name:string; username:string; email:string; password:string
  }) => {
    if (USE_API) {
      await apiCall(
        () => authApi.register(data),
        ({ user: u }) => {
          dispatch({ type:'REGISTER', user: apiUserToLocal(u) })
          toast('🎉 Account created!')
        },
        (err) => toast(`❌ ${err}`),
      )
    } else {
      const { first_name, last_name, username, email, password } = data
      if (users.find(u => u.email === email))    { toast('⚠️ Email taken'); return }
      if (users.find(u => u.username === username)) { toast('⚠️ Username taken'); return }
      const newUser: User = { id: state.nextUserId, name:`${first_name} ${last_name}`, username, email, password, bio:'', avatar:'', role:'user', banned:false, followers:0, following:0 }
      dispatch({ type:'REGISTER', user: newUser })
      toast('🎉 Account created!')
    }
  }, [USE_API, users, state.nextUserId, toast])

  const handleLogout = useCallback(async () => {
    if (USE_API) await apiCall(() => authApi.logout())
    dispatch({ type:'LOGOUT' })
  }, [USE_API])

  // ─── Song handlers ───────────────────────────────────────────────────────
  const handlePlaySong = useCallback((songId: number) => {
    dispatch({ type:'PLAY_SONG', songId })
    // increment play count in API silently
    if (USE_API) apiCall(() => songApi.get(songId))
  }, [USE_API])

  const handleLike = useCallback(async (songId: number) => {
    if (!user) return
    if (USE_API) {
      dispatch({ type:'TOGGLE_LIKE', songId, userId: user.id })   // optimistic
      const res = await apiCall(
        () => interactionApi.toggleLike(songId),
        undefined,
        (err) => { dispatch({ type:'TOGGLE_LIKE', songId, userId: user.id }); toast(`❌ ${err}`) }  // rollback on error
      )
      if (res) toast(res.liked ? '❤️ Liked!' : '💔 Unliked')
    } else {
      const liked = songs.find(s=>s.id===songId)?.likes.includes(user.id)
      dispatch({ type:'TOGGLE_LIKE', songId, userId: user.id })
      toast(liked ? '💔 Unliked' : '❤️ Liked!')
    }
  }, [USE_API, user, songs, toast])

  const handleRepost = useCallback(async (songId: number) => {
    if (!user) return
    if (USE_API) {
      dispatch({ type:'TOGGLE_REPOST', songId, userId: user.id })
      const res = await apiCall(
        () => interactionApi.toggleRepost(songId),
        undefined,
        (err) => { dispatch({ type:'TOGGLE_REPOST', songId, userId: user.id }); toast(`❌ ${err}`) }
      )
      if (res) toast(res.reposted ? '🔁 Reposted!' : '↩️ Repost removed')
    } else {
      const reposted = songs.find(s=>s.id===songId)?.reposts.includes(user.id)
      dispatch({ type:'TOGGLE_REPOST', songId, userId: user.id })
      toast(reposted ? '↩️ Repost removed' : '🔁 Reposted!')
    }
  }, [USE_API, user, songs, toast])

  const handleComment = useCallback(async (songId: number, text: string) => {
    if (!user || !text.trim()) return
    if (USE_API) {
      await apiCall(
        () => interactionApi.postComment(songId, text.trim()),
        (c) => {
          dispatch({ type:'POST_COMMENT', songId, comment: apiCommentToLocal(c, songId) })
          toast('💬 Comment posted!')
        },
        (err) => toast(`❌ ${err}`),
      )
    } else {
      dispatch({ type:'POST_COMMENT', songId, comment:{ id:Date.now(), userId:user.id, user:user.name, avatar:user.avatar||'', text:text.trim(), ts:Date.now(), deleted:false } })
      toast('💬 Comment posted!')
    }
  }, [USE_API, user, toast])

  const handleDeleteComment = useCallback(async (songId: number, commentId: number) => {
    dispatch({ type:'DELETE_COMMENT', songId, commentId })   // optimistic
    if (USE_API) {
      await apiCall(
        () => interactionApi.deleteComment(commentId),
        () => toast('🗑️ Comment deleted'),
        (err) => toast(`❌ ${err}`),
      )
    } else {
      toast('🗑️ Comment deleted')
    }
  }, [USE_API, toast])

  const handleDeleteSong = useCallback(async (songId: number) => {
    dispatch({ type:'DELETE_SONG', songId })
    if (USE_API) {
      await apiCall(
        () => songApi.delete(songId),
        () => toast('🗑️ Song deleted'),
        (err) => toast(`❌ ${err}`),
      )
    } else {
      toast('🗑️ Song deleted')
    }
  }, [USE_API, toast])

  const handleBanToggle = useCallback(async (targetUserId: number) => {
    const target = users.find(u=>u.id===targetUserId)
    dispatch({ type:'BAN_TOGGLE', userId: targetUserId })
    if (USE_API) {
      await apiCall(
        () => adminApi.banToggle(targetUserId),
        (r) => toast(r.is_banned ? `🚫 ${target?.name} banned` : `✅ ${target?.name} unbanned`),
        (err) => { dispatch({ type:'BAN_TOGGLE', userId:targetUserId }); toast(`❌ ${err}`) },
      )
    } else {
      toast(target?.banned ? `✅ ${target.name} unbanned` : `🚫 ${target?.name} banned`)
    }
  }, [USE_API, users, toast])

  const handleAdminDeleteComment = useCallback(async (songId: number, commentId: number) => {
    dispatch({ type:'DELETE_COMMENT', songId, commentId })
    if (USE_API) {
      await apiCall(
        () => adminApi.deleteComment(commentId),
        () => toast('🗑️ Comment deleted'),
        (err) => toast(`❌ ${err}`),
      )
    } else {
      toast('🗑️ Comment deleted')
    }
  }, [USE_API, toast])

  const handleUpdateProfile = useCallback(async (data: Partial<User> & { old_password?:string; new_password?:string }) => {
    if (!user) return
    if (USE_API) {
      await apiCall(
        () => userApi.update({ ...data }),
        () => {
          dispatch({ type:'UPDATE_PROFILE', userId:user.id, data })
          toast('✅ Profile updated!')
        },
        (err) => toast(`❌ ${err}`),
      )
    } else {
      dispatch({ type:'UPDATE_PROFILE', userId:user.id, data })
      toast('✅ Profile updated!')
    }
  }, [USE_API, user, toast])

  // ─── Load song detail comments from API ──────────────────────────────────
  const handleOpenSong = useCallback(async (song: Song) => {
    dispatch({ type:'OPEN_SONG', song })
    if (!USE_API) return
    // Fetch comments and update the detail song
    const comments = await apiCall(() => interactionApi.getComments(song.id))
    if (comments) {
      const converted: Comment[] = comments.map(c => apiCommentToLocal(c, song.id))
      // patch comments into the song in state
      dispatch({ type:'POST_COMMENT', songId: song.id, comment: converted[0] ?? { id:-1, userId:0, user:'', avatar:'', text:'__NOOP__', ts:0, deleted:true } })
    }
  }, [USE_API])

  if (!user) return (
    <AuthPage
      dispatch={dispatch}
      onLogin={handleLogin}
      onRegister={handleRegister}
    />
  )

  const isAdmin = user.role === 'admin'
  const activeSongs = songs.filter(s => !s.deleted)

  return (
    <>
      <div className={`toast-wrap${toastShow?' show':''}`}>{toastMsg}</div>

      <div id="app-layout">
        {/* Sidebar */}
        <aside id="sidebar">
          <div className="sidebar-logo">
            <div className="logo-icon"><i className="fas fa-headphones" style={{ fontSize:14,color:'var(--black)' }} /></div>
            <span>5Days Radio</span>
          </div>
          <div style={{ padding:'4px 8px' }}>
            {([['home','fa-house','Home'],['explore','fa-search','Explore'],['library','fa-layer-group','Your Library']] as [Page,string,string][]).map(([p,icon,label]) => (
              <button key={p} className={`nav-btn${page===p?' active':''}`} onClick={()=>dispatch({type:'NAV',page:p})}>
                <i className={`fas ${icon} nav-icon`} />{label}
              </button>
            ))}
          </div>
          <div className="sidebar-divider" />
          <div style={{ padding:'4px 8px' }}>
            <button className={`nav-btn${page==='upload'?' active':''}`} onClick={()=>{dispatch({type:'SET_EDIT_SONG',id:null});dispatch({type:'NAV',page:'upload'})}}><i className="fas fa-cloud-arrow-up nav-icon" />Upload Music</button>
            <button className={`nav-btn${page==='profile'?' active':''}`} onClick={()=>dispatch({type:'NAV',page:'profile'})}><i className="fas fa-circle-user nav-icon" />Profile</button>
            {isAdmin && <button className={`nav-btn${page==='admin'?' active':''}`} onClick={()=>dispatch({type:'NAV',page:'admin'})}><i className="fas fa-shield-halved nav-icon" />Admin</button>}
          </div>
          <div className="sidebar-divider" />
          <div style={{ padding:'4px 8px' }}>
            <button className="nav-btn" onClick={handleLogout} style={{ color:'var(--muted)' }}><i className="fas fa-right-from-bracket nav-icon" />Log Out</button>
          </div>
          <div className="sidebar-user">
            <div className="sidebar-user-inner" onClick={()=>dispatch({type:'NAV',page:'profile'})}>
              <Avatar user={user} />
              <div className="sidebar-user-info">
                <div className="name">{user.name}</div>
                <div className="sub">{user.role==='admin'?'⭐ Admin':'Free Member'}</div>
              </div>
            </div>
          </div>
          {USE_API && (
            <div style={{ padding:'8px 16px 12px',fontSize:10,color:'var(--gold)',letterSpacing:'.08em',fontWeight:700,textTransform:'uppercase',opacity:.7 }}>
              <i className="fas fa-circle" style={{ fontSize:7,marginRight:5 }} />Live
            </div>
          )}
        </aside>

        {/* Main content */}
        <main id="main-content" ref={mainRef}>
          {/* Topbar */}
          <div id="topbar">
            <div className="topbar-nav">
              <button className="topbar-nav-btn" onClick={()=>dispatch({type:'NAV_BACK'})}><i className="fas fa-chevron-left" style={{ fontSize:12 }} /></button>
              <button className="topbar-nav-btn" onClick={()=>dispatch({type:'NAV_FWD'})}><i className="fas fa-chevron-right" style={{ fontSize:12 }} /></button>
            </div>
            <div className="topbar-right">
              <div className="topbar-avatar-btn" onClick={()=>dispatch({type:'NAV',page:'profile'})}>
                <Avatar user={user} size={28} />
                <span style={{ fontSize:13,fontWeight:700 }}>{user.name}</span>
                <i className="fas fa-chevron-down" style={{ fontSize:11,color:'var(--muted)' }} />
              </div>
            </div>
          </div>

          {/* Pages */}
          {page === 'home'    && <HomePage    songs={activeSongs} user={user} dispatch={dispatch}
            onPlay={handlePlaySong} onOpen={handleOpenSong}
            onDelete={handleDeleteSong} />}
          {page === 'explore' && <ExplorePage songs={activeSongs} user={user} dispatch={dispatch}
            onPlay={handlePlaySong} onOpen={handleOpenSong}
            onDelete={handleDeleteSong} />}
          {page === 'library' && <LibraryPage songs={songs} user={user} dispatch={dispatch}
            onPlay={handlePlaySong} onOpen={handleOpenSong}
            onDelete={handleDeleteSong} />}
          {page === 'upload'  && <UploadPage  user={user} songs={songs} editSongId={editSongId}
            dispatch={dispatch} toast={toast} />}
          {page === 'profile' && <ProfilePage user={user} songs={songs} dispatch={dispatch}
            onOpen={handleOpenSong} onDelete={handleDeleteSong}
            onUpdateProfile={handleUpdateProfile} />}
          {page === 'admin'   && isAdmin && <AdminPage
            users={users} songs={songs} tab={adminTab} currentUser={user} dispatch={dispatch}
            onBanToggle={handleBanToggle}
            onDeleteSong={handleDeleteSong}
            onDeleteComment={handleAdminDeleteComment} />}
          {page === 'song-detail' && currentDetailSong && (
            <SongDetailPage song={currentDetailSong} songs={songs} user={user} player={player}
              dispatch={dispatch}
              onLike={handleLike} onRepost={handleRepost}
              onComment={handleComment} onDeleteComment={handleDeleteComment}
              onPlay={handlePlaySong} />
          )}
        </main>

        {/* Player */}
        <PlayerBar player={player} user={user} dispatch={dispatch} />
      </div>
    </>
  )
}