#!/usr/bin/env node
// A TMDB stand-in for fault injection: proxies every /3/* request to the real API (so the data
// is real) and lets a test flip failures, delays, short rows and exhaustion on and off at
// runtime. Point the app at it with VITE_TMDB_BASE_URL=http://localhost:8787.
//
//   node tools/tmdb-mock.server.mjs [port]           default 8787
//   GET /__mock/fail?match=<substring>&status=500     every request whose URL contains match fails
//   GET /__mock/fail?off=1                            stop failing
//   GET /__mock/delay?ms=3000                         delay every proxied response
//   GET /__mock/short?count=3                         discover pages return only <count> results
//   GET /__mock/exhaust?page=3                        discover pages >= page return no results
//   GET /__mock/reset                                 clear everything
//   GET /__mock/state                                 current settings as JSON
import http from 'node:http'
import https from 'node:https'

const port = Number(process.argv[2] ?? 8787)
const upstream = 'https://api.themoviedb.org'
const state = { failMatch: null, failStatus: 500, delayMs: 0, shortCount: null, exhaustPage: null, requests: 0 }

function control(url, res) {
  const q = url.searchParams
  switch (url.pathname) {
    case '/__mock/fail':
      if (q.get('off')) state.failMatch = null
      else {
        state.failMatch = q.get('match') ?? '/3/'
        state.failStatus = Number(q.get('status') ?? 500)
      }
      break
    case '/__mock/delay':
      state.delayMs = Number(q.get('ms') ?? 0)
      break
    case '/__mock/short':
      state.shortCount = q.has('count') ? Number(q.get('count')) : null
      break
    case '/__mock/exhaust':
      state.exhaustPage = q.has('page') ? Number(q.get('page')) : null
      break
    case '/__mock/reset':
      Object.assign(state, { failMatch: null, failStatus: 500, delayMs: 0, shortCount: null, exhaustPage: null })
      break
    case '/__mock/state':
      break
    default:
      res.writeHead(404, cors()).end('unknown control endpoint')
      return
  }
  res.writeHead(200, cors({ 'content-type': 'application/json' })).end(JSON.stringify(state))
}

function cors(extra = {}) {
  return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', ...extra }
}

function rewrite(url, body) {
  if (!url.pathname.startsWith('/3/discover/')) return body
  const page = Number(url.searchParams.get('page') ?? 1)
  const data = JSON.parse(body)
  if (state.exhaustPage !== null && page >= state.exhaustPage) data.results = []
  if (state.shortCount !== null) data.results = data.results.slice(0, state.shortCount)
  return JSON.stringify(data)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  if (req.method === 'OPTIONS') return res.writeHead(204, cors()).end()
  if (url.pathname.startsWith('/__mock/')) return control(url, res)
  state.requests++
  const finish = (fn) => (state.delayMs > 0 ? setTimeout(fn, state.delayMs) : fn())
  if (state.failMatch !== null && req.url.includes(state.failMatch)) {
    console.log(`FAIL ${state.failStatus} ${url.pathname}?page=${url.searchParams.get('page') ?? '-'}`)
    return finish(() => res.writeHead(state.failStatus, cors({ 'content-type': 'application/json' })).end('{"status_message":"mock failure"}'))
  }
  https
    .get(upstream + req.url, { headers: { accept: 'application/json' } }, (up) => {
      const chunks = []
      up.on('data', (c) => chunks.push(c))
      up.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8')
        try {
          if (up.statusCode === 200) body = rewrite(url, body)
        } catch (error) {
          console.log('rewrite failed', error)
        }
        console.log(`${up.statusCode} ${url.pathname}?page=${url.searchParams.get('page') ?? '-'}${state.delayMs ? ` (+${state.delayMs}ms)` : ''}`)
        finish(() => res.writeHead(up.statusCode ?? 502, cors({ 'content-type': 'application/json' })).end(body))
      })
    })
    .on('error', (error) => {
      console.log('upstream error', error.message)
      res.writeHead(502, cors()).end('upstream error')
    })
})

server.listen(port, () => console.log(`TMDB mock listening on http://localhost:${port} (proxying ${upstream})`))
