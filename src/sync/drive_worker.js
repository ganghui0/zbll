// Web worker that brings solve records into the stats file in Google Drive. Reading, merging and writing
// the full history happens here, so that it never holds up the page while a solve is timed.
//
// Message in: {id, token, records}. Message out: {id, result} or {id, error: {kind, message, status}},
// result: {sent: ids that were written now, confirmed: ids that the file had already, total: solves in the file}.
import {createStatsFile, findStatsFile, readFile, writeFile} from "./drive_api.js";
import {emptyStatsFile, mergeIntoFile, parseStatsFile, serializeStatsFile} from "./stats_file.js";

// {folderId, fileId} once found, for as long as the page is open: a file that was moved to the trash
// meanwhile is found out about when the page is opened again
let place = null

const push = async (token, records) => {
  place ??= await findStatsFile(token)
  // read and merge before every write: other tabs and devices write to the same file
  const file = place.fileId ? parseStatsFile(await readFile(token, place.fileId)) : emptyStatsFile()
  const sent = mergeIntoFile(file, records)
  if (sent.length > 0 || !place.fileId) {
    file.updatedAt = new Date().toISOString()
    const text = serializeStatsFile(file)
    if (place.fileId) {
      await writeFile(token, place.fileId, text)
    } else {
      place.fileId = await createStatsFile(token, place.folderId, text)
    }
  }
  const sentIds = new Set(sent)
  return {sent, confirmed: records.map(record => record.id).filter(id => !sentIds.has(id)), total: file.solves.length}
}

const pushRecords = async (token, records) => {
  try {
    return await push(token, records)
  } catch (e) {
    if (e.kind !== "missing") {
      throw e
    }
    place = null // the file or the folder is gone: look again, make them again
    return await push(token, records)
  }
}

self.onmessage = async ({data: {id, token, records}}) => {
  try {
    self.postMessage({id, result: await pushRecords(token, records)})
  } catch (e) {
    // not a DriveError: the file in Drive could not be read as a stats file
    self.postMessage({id, error: {kind: e.kind ?? "file", message: `${e?.message ?? e}`, status: e.status ?? 0}})
  }
}
