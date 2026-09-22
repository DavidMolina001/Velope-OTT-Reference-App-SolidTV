import { NativeScriptConfig } from '@nativescript/core'

export default {
  id: 'com.edinburghanalytics.velopetv',
  projectName: 'VelopeTV',
  appPath: 'app',
  appResourcesPath: 'App_Resources',
  bundler: 'webpack',
  cli: {
    packageManager: 'pnpm',
  },
} as NativeScriptConfig
