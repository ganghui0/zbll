// The few calls of the Google Drive API that the sync needs. With the drive.file scope the trainer only
// sees the folder and the file that it made itself.
import {GOOGLE_APIS_URL} from "@/config";

export const FOLDER_NAME = "ZBLL Trainer"
export const FILE_NAME = "zbll-trainer-stats.json"
const FOLDER_TYPE = "application/vnd.google-apps.folder"
const JSON_TYPE = "application/json"
const REQUEST_TIMEOUT_MS = 60000

const API = `${GOOGLE_APIS_URL}/drive/v3`
const UPLOAD_API = `${GOOGLE_APIS_URL}/upload/drive/v3`

// kind: "offline" (no answer), "auth" (the token is not accepted), "missing" (no such file), "http" (other)
export class DriveError extends Error {
  constructor(kind, message, status = 0) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

const request = async (token, url, options = {}) => {
  let response
  try {
    response = await fetch(url, {
      ...options,
      headers: {Authorization: `Bearer ${token}`, ...options.headers},
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    throw new DriveError("offline", `${e?.message ?? e}`)
  }
  if (!response.ok) {
    const kind = response.status === 401 ? "auth" : response.status === 404 ? "missing" : "http"
    throw new DriveError(kind, (await response.text().catch(() => "")).slice(0, 300), response.status)
  }
  return response
}

// ids of the files that match, oldest first: should there ever be two, everyone picks the same one
const find = async (token, query) => {
  const params = new URLSearchParams({q: query, fields: "files(id)", orderBy: "createdTime", spaces: "drive"})
  return (await (await request(token, `${API}/files?${params}`)).json()).files.map(file => file.id)
}

// Returns {folderId, fileId}, fileId is null as long as there is no stats file. Makes the folder.
export const findStatsFile = async token => {
  let [folderId] = await find(token, `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_TYPE}' and trashed = false`)
  if (!folderId) {
    const created = await request(token, `${API}/files?fields=id`, {
      method: "POST",
      headers: {"Content-Type": JSON_TYPE},
      body: JSON.stringify({name: FOLDER_NAME, mimeType: FOLDER_TYPE}),
    })
    folderId = (await created.json()).id
  }
  const [fileId] = await find(token, `name = '${FILE_NAME}' and '${folderId}' in parents and trashed = false`)
  return {folderId, fileId: fileId ?? null}
}

// returns the id of the new file
export const createStatsFile = async (token, folderId, text) => {
  const boundary = "zbll" + Math.random().toString(36).slice(2)
  const created = await request(token, `${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: {"Content-Type": `multipart/related; boundary=${boundary}`},
    body: [
      `--${boundary}`,
      `Content-Type: ${JSON_TYPE}; charset=UTF-8`,
      "",
      JSON.stringify({name: FILE_NAME, parents: [folderId], mimeType: JSON_TYPE}),
      `--${boundary}`,
      `Content-Type: ${JSON_TYPE}`,
      "",
      text,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  })
  return (await created.json()).id
}

export const readFile = async (token, fileId) =>
    (await request(token, `${API}/files/${fileId}?alt=media`)).text()

export const writeFile = async (token, fileId, text) => {
  await request(token, `${UPLOAD_API}/files/${fileId}?uploadType=media&fields=id`, {
    method: "PATCH",
    headers: {"Content-Type": JSON_TYPE},
    body: text,
  })
}

// the email address of the account, or null
export const fetchEmail = async token => {
  try {
    return (await (await request(token, `${API}/about?fields=user(emailAddress)`)).json()).user?.emailAddress ?? null
  } catch (e) {
    return null
  }
}
