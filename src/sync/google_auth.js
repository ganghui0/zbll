// Access tokens for Google Drive, without a backend. A token is good for an hour.
//
// Signing in goes through Google Identity Services (the token model), which always opens a window and so
// has to start from a click. To get the next token without one, Google is asked in a hidden frame: it
// answers at once, with a token as long as the user is signed in to Google and the trainer still has
// their consent, otherwise with an error (also when the browser keeps Google's cookies from the frame).
import {GOOGLE_ACCOUNTS_URL, GOOGLE_CLIENT_ID} from "@/config";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

const TOKEN_KEY = "zbll_drive_token"
// a token is not used in its last minute
const EXPIRY_MARGIN_MS = 60000
const SILENT_TIMEOUT_MS = 10000
const SILENT_MESSAGE = "zbll-oauth-silent" // see public/oauth-silent.html

// code: what Google or its library called the error, or "timeout", "no_scope", "no_script"
export class AuthError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

// ---- the token, kept in localStorage: it is good in every tab, and after a reload

export const isTokenKey = key => key === TOKEN_KEY

export const storedToken = () => {
  try {
    const {token, expiresAt} = JSON.parse(localStorage.getItem(TOKEN_KEY))
    return expiresAt - EXPIRY_MARGIN_MS > Date.now() ? token : null
  } catch (e) {
    return null
  }
}

export const storeToken = ({token, expiresAt}) => localStorage.setItem(TOKEN_KEY, JSON.stringify({token, expiresAt}))

export const forgetToken = () => localStorage.removeItem(TOKEN_KEY)

// answer: access_token, expires_in and scope of Google's answer
const tokenFromAnswer = answer => {
  if (!`${answer.scope ?? ""}`.split(" ").includes(DRIVE_SCOPE)) {
    throw new AuthError("no_scope") // signed in, but the box to allow access to Drive was not ticked
  }
  return {token: answer.access_token, expiresAt: Date.now() + Number(answer.expires_in) * 1000}
}

// ---- signing in

const gis = () => window.google?.accounts?.oauth2
let scriptLoading = null

// Loads Google's script. Done ahead of the click on "sign in", which may then open the window right away.
export const loadSignIn = () => {
  if (gis()) {
    return Promise.resolve()
  }
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = `${GOOGLE_ACCOUNTS_URL}/gsi/client`
    script.async = true
    script.onload = () => gis() ? resolve() : reject(new AuthError("no_script"))
    script.onerror = () => {
      scriptLoading = null // try again next time
      script.remove()
      reject(new AuthError("no_script"))
    }
    document.head.appendChild(script)
  })
  return scriptLoading
}

// Must be called from a click. email: the account that was signed in before, to go on with that one.
// Returns {token, expiresAt}. Throws an AuthError, "popup_closed" when the user closed the window.
export const signIn = async email => {
  if (!gis()) {
    await loadSignIn()
  }
  return new Promise((resolve, reject) => {
    gis().initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      // "": only ask what has not been answered before
      prompt: email ? "" : "select_account",
      login_hint: email || undefined,
      callback: answer => {
        try {
          if (answer.error) {
            throw new AuthError(answer.error)
          }
          resolve(tokenFromAnswer(answer))
        } catch (e) {
          reject(e)
        }
      },
      error_callback: error => reject(new AuthError(error?.type ?? "unknown")),
    }).requestAccessToken()
  })
}

// ---- the next token, without a window

const silentRedirectUri = () => new URL("oauth-silent.html", document.baseURI).href

const randomState = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16)).join("")

// Returns {token, expiresAt}. Throws an AuthError: with what Google answered ("interaction_required",
// "login_required", ...), or "timeout" when there was no answer.
export const renewSilently = email => new Promise((resolve, reject) => {
  const state = randomState()
  const url = new URL(`${GOOGLE_ACCOUNTS_URL}/o/oauth2/v2/auth`)
  url.search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: silentRedirectUri(),
    response_type: "token",
    scope: DRIVE_SCOPE,
    prompt: "none",
    state,
    ...(email ? {login_hint: email} : {}),
  })
  const frame = document.createElement("iframe")
  frame.style.display = "none"
  frame.setAttribute("aria-hidden", "true")

  const finish = (settle, value) => {
    clearTimeout(timer)
    window.removeEventListener("message", onMessage)
    frame.remove()
    settle(value)
  }
  // Google sends the frame to oauth-silent.html with the answer after the #, the page passes it on
  const onMessage = event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== SILENT_MESSAGE) {
      return
    }
    const answer = Object.fromEntries(new URLSearchParams(`${event.data.hash}`.replace(/^#/, "")))
    try {
      if (answer.state !== state) {
        throw new AuthError("state_mismatch")
      }
      if (!answer.access_token) {
        throw new AuthError(answer.error ?? "no_token")
      }
      finish(resolve, tokenFromAnswer(answer))
    } catch (e) {
      finish(reject, e)
    }
  }
  const timer = setTimeout(() => finish(reject, new AuthError("timeout")), SILENT_TIMEOUT_MS)
  window.addEventListener("message", onMessage)
  frame.src = url.href
  document.body.appendChild(frame)
})
