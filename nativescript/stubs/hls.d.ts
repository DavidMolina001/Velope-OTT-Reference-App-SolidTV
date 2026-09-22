// hls.js is web-only (aliased to stubs/empty.cjs in webpack.config.js); this keeps the tvOS
// typecheck of the shared src/ happy without the package.
declare module 'hls.js' {
  const Hls: any
  export default Hls
}
