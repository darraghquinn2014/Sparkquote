const config = require('./app.json');

// EAS Build sets this automatically during a cloud build (not during local
// `expo start`, where it's undefined and the base app.json values apply
// unchanged). Giving the "preview" profile — a standalone build with no dev
// client, built specifically to sit installed alongside the dev client for
// side-by-side testing — its own bundle id means installing it doesn't
// overwrite/uninstall the dev client build, mirroring how the local Android
// release build already uses applicationIdSuffix ".field" to stay a separate
// app from the Android dev client.
//
// Only ios.bundleIdentifier is touched, NOT the top-level `name` — changing
// `name` also changes the Xcode target name `expo prebuild` generates, which
// broke credential assignment ("Could not find target 'sparkquoteapp' in
// project.pbxproj") since EAS's cached scheme name didn't match. infoPlist's
// CFBundleDisplayName only affects the name shown under the home-screen icon
// without touching the underlying Xcode project/target naming.
// "field" profile (eas.json) deliberately does NOT set IS_PREVIEW — it's for
// installing on a field tester's own device, which has nothing else of ours
// on it, so there's no need for a separate bundle id, and no provisioning
// profile exists for the .preview id yet (preview builds have errored since
// that id was introduced — no one's fixed the Apple-side credentials for it).
const IS_PREVIEW = process.env.EAS_BUILD_PROFILE === 'preview';

if (IS_PREVIEW) {
  config.expo.ios.bundleIdentifier = 'com.dqm79.sparkquoteapp.preview';
  config.expo.ios.infoPlist.CFBundleDisplayName = 'SparkQuote (Preview)';
}

module.exports = config;
