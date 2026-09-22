// The title the details page shows, handed over by Home before it navigates. A module-level
// signal rather than router state: it works identically on the web and under the tvOS
// history shim, and the details page is disposable, so nothing else reads it.
import { createSignal } from 'solid-js'
import type { RowItem } from '../services/rows'

const [selectedMovie, setSelectedMovie] = createSignal<RowItem | undefined>(undefined)

export { selectedMovie, setSelectedMovie }
