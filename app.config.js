// Extends app.json. The values in app.json are the real app; this file only adjusts them for:
//   * the testing copy ("Ente Chilavu (Dev)"), which installs NEXT TO the real app with its own separate
//     data, so trying new features can never touch your real finances. It is selected by the
//     APP_VARIANT setting in eas.json.
//   * permissions this app should never have (it only picks existing pictures; it never uses the
//     camera or microphone).
//   * the screenshot text reader: only the Latin-script model, and bundled inside the app, so nothing is
//     ever downloaded.

const IS_DEV = process.env.APP_VARIANT === 'development';

const OCR_PLUGIN = ['rn-mlkit-ocr', { ocrModels: ['latin'], ocrUseBundled: true }];
const pluginName = (p) => (Array.isArray(p) ? p[0] : p);

module.exports = ({ config }) => ({
  ...config,
  name: IS_DEV ? 'Ente Chilavu (Dev)' : config.name,
  scheme: IS_DEV ? 'entechilavudev' : config.scheme,
  plugins: [...(config.plugins || []).filter((p) => pluginName(p) !== 'rn-mlkit-ocr'), OCR_PLUGIN],
  android: {
    ...config.android,
    package: IS_DEV ? 'com.entechilav.app.dev' : config.android.package,
    blockedPermissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
  },
});
