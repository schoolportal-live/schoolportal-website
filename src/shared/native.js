/**
 * SchoolOS — Native Bridge
 *
 * Provides access to native device features via Capacitor plugins.
 * Falls back gracefully when running in a regular browser (non-native).
 *
 * Features:
 *   - Biometric authentication (fingerprint/face)
 *   - Camera (document scanning)
 *   - Status bar styling
 *   - Haptic feedback
 */

/** Check if running inside a Capacitor native shell */
export function isNative() {
  return window.Capacitor?.isNativePlatform() === true
}

// ── Biometric Auth ────────────────────────────────────────────────────────

/**
 * Check if biometric auth is available on this device.
 * @returns {Promise<boolean>}
 */
export async function isBiometricAvailable() {
  if (!isNative()) return false
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    const result = await BiometricAuth.checkBiometry()
    return result.isAvailable
  } catch {
    return false
  }
}

/**
 * Prompt for biometric authentication.
 * @param {string} reason - Why we're asking (shown to user)
 * @returns {Promise<boolean>} - true if authenticated
 */
export async function authenticateWithBiometric(reason = 'Verify your identity') {
  if (!isNative()) return false
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,  // Allow PIN/pattern as fallback
    })
    return true
  } catch {
    return false
  }
}

// ── Camera ────────────────────────────────────────────────────────────────

/**
 * Take a photo using the device camera.
 * @param {Object} opts
 * @param {'base64'|'uri'} opts.resultType - How to return the image
 * @param {number} opts.quality - JPEG quality 0-100
 * @returns {Promise<{dataUrl?: string, path?: string} | null>}
 */
export async function takePhoto({ quality = 80, resultType = 'base64' } = {}) {
  if (!isNative()) {
    // Fallback: use file input for browser
    return browserFileInput('image/*')
  }
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const image = await Camera.getPhoto({
      quality,
      allowEditing: false,
      resultType: resultType === 'base64' ? CameraResultType.Base64 : CameraResultType.Uri,
      source: CameraSource.Camera,
    })
    if (resultType === 'base64') {
      return { dataUrl: `data:image/jpeg;base64,${image.base64String}` }
    }
    return { path: image.webPath }
  } catch {
    return null
  }
}

/**
 * Pick a photo from the device gallery.
 * @returns {Promise<{dataUrl?: string} | null>}
 */
export async function pickFromGallery({ quality = 80 } = {}) {
  if (!isNative()) {
    return browserFileInput('image/*')
  }
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
    const image = await Camera.getPhoto({
      quality,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
    })
    return { dataUrl: `data:image/jpeg;base64,${image.base64String}` }
  } catch {
    return null
  }
}

/**
 * Scan a document using camera (takes photo + returns for upload).
 * This is a simple camera capture — real OCR would need a cloud service.
 * @returns {Promise<{dataUrl: string} | null>}
 */
export async function scanDocument() {
  return takePhoto({ quality: 90, resultType: 'base64' })
}

// ── Haptics ───────────────────────────────────────────────────────────────

/**
 * Trigger a light haptic tap (for button feedback).
 */
export async function hapticTap() {
  if (!isNative()) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch { /* silent */ }
}

/**
 * Trigger a success haptic notification.
 */
export async function hapticSuccess() {
  if (!isNative()) return
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType.Success })
  } catch { /* silent */ }
}

// ── Status Bar ────────────────────────────────────────────────────────────

/**
 * Set the Android status bar color to match school branding.
 * @param {string} color - Hex color
 */
export async function setStatusBarColor(color) {
  if (!isNative()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setBackgroundColor({ color })
    // Use light text if the color is dark
    const brightness = hexBrightness(color)
    await StatusBar.setStyle({ style: brightness < 128 ? Style.Dark : Style.Light })
  } catch { /* silent */ }
}

// ── App lifecycle ─────────────────────────────────────────────────────────

/**
 * Handle Android back button (prevent accidental exit).
 */
export async function setupBackButton() {
  if (!isNative()) return
  try {
    const { App } = await import('@capacitor/app')
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        // On the main page — ask to exit
        if (confirm('Exit SchoolOS?')) {
          App.exitApp()
        }
      }
    })
  } catch { /* silent */ }
}

// ── Utilities ─────────────────────────────────────────────────────────────

/** Browser fallback: file input for camera/gallery */
function browserFileInput(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.capture = 'environment'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = () => resolve({ dataUrl: reader.result })
      reader.readAsDataURL(file)
    }
    input.click()
  })
}

/** Calculate brightness of a hex color (0=dark, 255=bright) */
function hexBrightness(hex) {
  const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) return 128
  const r = parseInt(match[1], 16)
  const g = parseInt(match[2], 16)
  const b = parseInt(match[3], 16)
  return (r * 299 + g * 587 + b * 114) / 1000
}
