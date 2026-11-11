// The solve records that are on their way to Google Drive, in localStorage: they survive a closed tab,
// and all tabs see the same ones. Each record has its own key, so that tabs never overwrite each other.
//
// An item is {record, order, sentAt}. Without sentAt the record is waiting to be written to the stats file.
// With sentAt it was written, and stays until a later read of the file shows that it is still in there:
// should another device have written an older copy of the file over ours, it is written again.
// order: the items are read in the order they were put in.

const PREFIX = "zbll_drive_queue:"
let lastOrder = 0

export const isQueueKey = key => typeof key === "string" && key.startsWith(PREFIX)

// A record with the id of one that is in the queue replaces it: a deletion replaces the solve.
export const putRecord = record => {
  lastOrder = Math.max(lastOrder + 1, Date.now() * 1000)
  localStorage.setItem(PREFIX + record.id, JSON.stringify({record, order: lastOrder}))
}

// returns [{key, raw, record, order, sentAt}]
export const readQueue = () => {
  const items = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!isQueueKey(key)) {
      continue
    }
    const raw = localStorage.getItem(key)
    try {
      const {record, order, sentAt} = JSON.parse(raw)
      if (record?.id != null) {
        items.push({key, raw, record, order: order ?? 0, sentAt: sentAt ?? null})
      }
    } catch (e) {
      // not ours
    }
  }
  return items.sort((a, b) => a.order - b.order)
}

export const countWaiting = () => readQueue().filter(item => item.sentAt === null).length

// The item may have been replaced since it was read, by a deletion: then it stays as it is now.
const unchanged = item => localStorage.getItem(item.key) === item.raw

export const removeItem = item => {
  if (unchanged(item)) {
    localStorage.removeItem(item.key)
  }
}

export const markSent = (item, sentAt) => {
  if (unchanged(item)) {
    localStorage.setItem(item.key, JSON.stringify({record: item.record, order: item.order, sentAt}))
  }
}
