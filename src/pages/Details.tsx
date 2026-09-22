import { createSignal, onCleanup, onMount, type Component } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import type { KeyHandler } from '@solidtv/solid'
import ActionButton from '../components/ActionButton'
import { posterUrl } from '../services/tmdb'
import { selectedMovie } from '../state/selection'
import { DEMO_STREAM_URL } from '../state/playback'
import { resolveHost } from '../host'
import { colors, layout } from '../theme'

const POSTER_WIDTH = 460
const BUTTON_COUNT = 2
const placeholderTransition = { alpha: { duration: 300 } } as const
const hintTransition = { alpha: { duration: 200 } } as const

// Deliberately disposable: it receives its title from the selection store, renders from the
// data it already has (poster path, title, year, overview; no second API call), and is
// destroyed on exit. The same focus model shape as Home, in miniature (buttonIndex).
const Details: Component = () => {
  const navigate = useNavigate()
  const host = resolveHost()
  const movie = selectedMovie()
  const [buttonIndex, setButtonIndex] = createSignal(0)
  const [pressedIndex, setPressedIndex] = createSignal(-1)
  const [posterLoaded, setPosterLoaded] = createSignal(false)
  const [favourited, setFavourited] = createSignal(false)
  const [playHintVisible, setPlayHintVisible] = createSignal(false)
  const [playing, setPlaying] = createSignal(false)
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer)
      fn()
    }, ms)
    timers.add(timer)
  }
  onCleanup(() => {
    timers.forEach(clearTimeout)
    host.player?.stop()
  })
  onMount(() => {
    if (!movie) navigate('/', { replace: true })
  })

  const title = () => movie?.title ?? ''
  const year = () => movie?.year ?? ''
  const overview = () => movie?.overview || 'No description available.'
  const monogram = () => (movie?.title ?? '?').charAt(0).toUpperCase()
  const posterSrc = () => (movie ? posterUrl(movie.posterPath, POSTER_WIDTH) : undefined)
  const favouriteLabel = () => (favourited() ? 'Remove from favourites' : '+ Add to favourites')

  const handled = (e: { preventDefault?: () => void }) => {
    e.preventDefault?.()
    return true
  }
  const onLeft: KeyHandler = (e) => {
    setButtonIndex((i) => Math.max(0, i - 1))
    return handled(e)
  }
  const onRight: KeyHandler = (e) => {
    setButtonIndex((i) => Math.min(i + 1, BUTTON_COUNT - 1))
    return handled(e)
  }
  const onEnter: KeyHandler = (e) => {
    if (playing()) {
      host.player?.togglePause()
      return handled(e)
    }
    setPressedIndex(buttonIndex())
    later(150, () => setPressedIndex(-1))
    if (buttonIndex() === 0) {
      if (host.player) {
        // The same stream on both targets: AVPlayer on Apple TV (which owns the remote while it
        // is up), a <video> element over the canvas on the web (Enter pauses, Back stops).
        setPlaying(true)
        host.player.play(DEMO_STREAM_URL, () => setPlaying(false))
      } else {
        setPlayHintVisible(true)
        later(1800, () => setPlayHintVisible(false))
      }
    } else {
      setFavourited((f) => !f)
    }
    return handled(e)
  }
  // Back/Menu here is handled: it stops playback if any, otherwise returns to the grid with
  // Home's state intact.
  const onBack: KeyHandler = (e) => {
    if (playing()) {
      host.player?.stop()
      setPlaying(false)
      return handled(e)
    }
    navigate(-1)
    return handled(e)
  }

  return (
    <view
      autofocus
      width={layout.width}
      height={layout.height}
      color={colors.background}
      onLeft={onLeft}
      onRight={onRight}
      onEnter={onEnter}
      onBack={onBack}
    >
      <view x={120} y={150} width={460} height={690} borderRadius={16} color={colors.surface}>
        <view width={460} height={690} borderRadius={16} color={0xffffffff} src={posterSrc()} onEvent={{ loaded: () => setPosterLoaded(true) }} />
        <view width={460} height={690} borderRadius={16} color={colors.surface} alpha={posterLoaded() ? 0 : 1} transition={placeholderTransition}>
          <text x={230} y={345} mount={0.5} fontSize={130} color={colors.monogram}>
            {monogram()}
          </text>
        </view>
      </view>
      <view x={660} y={170}>
        <text fontFamily="raleway" fontSize={58} width={1140} contain="width" maxLines={2} lineHeight={68} color={colors.textPrimary}>
          {title()}
        </text>
        <text y={160} fontSize={30} color={colors.accent}>
          {year()}
        </text>
        <text y={230} fontSize={28} width={1100} contain="width" maxLines={9} lineHeight={42} color={colors.textSecondary}>
          {overview()}
        </text>
        <ActionButton y={640} width={290} label="Play now" focused={buttonIndex() === 0} pressed={pressedIndex() === 0} />
        <ActionButton y={640} x={330} width={400} label={favouriteLabel()} focused={buttonIndex() === 1} pressed={pressedIndex() === 1} />
        <text y={750} fontSize={24} color={colors.textMuted} alpha={playHintVisible() ? 1 : 0} transition={hintTransition}>
          Playback is not available on this runtime
        </text>
      </view>
      <text x={120} y={990} fontSize={24} color={colors.textMuted}>
        Back / Esc to return      Left / Right to switch buttons
      </text>
    </view>
  )
}

export default Details
