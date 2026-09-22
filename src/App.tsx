import type { Component, ParentProps } from 'solid-js'
import { Navigate, Route } from '@solidjs/router'
import { HashRouter, KeepAliveRoute } from '@solidtv/solid/primitives/router'
import Home from './pages/Home'
import Details from './pages/Details'
import { colors, layout } from './theme'

const Root: Component<ParentProps> = (props) => (
  <view width={layout.width} height={layout.height} color={colors.background}>
    {props.children}
  </view>
)

// Home is kept alive across navigation so the whole focus model and loaded rows survive a trip
// to the details page (back-with-state at zero cost), as the L3 build's keepAlive route does.
const App: Component = () => (
  <HashRouter root={Root}>
    <KeepAliveRoute id="home" path="/" component={Home} />
    <Route path="/details" component={Details} />
    <Route path="/*all" component={() => <Navigate href="/" />} />
  </HashRouter>
)

export default App
