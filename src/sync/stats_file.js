// The stats file in Google Drive: {app, version, updatedAt, solves: [solve record, ...]}, the full history.
// Solves are told apart by their id. Nothing about a solve changes once it is recorded, except that it
// can be deleted: it stays in the file with deleted: true.

export const emptyStatsFile = () => ({app: "zbll-trainer", version: 1, updatedAt: null, solves: []})

// Throws for a text that is not a stats file. An empty one is a file without solves.
export const parseStatsFile = text => {
  if (!text.trim()) {
    return emptyStatsFile()
  }
  const file = JSON.parse(text)
  if (!file || !Array.isArray(file.solves)) {
    throw new Error("no solves in the stats file")
  }
  return file
}

// the solves of the file one on a line: it can be read and compared, and is not much longer for it
export const serializeStatsFile = ({solves, ...head}) => [
  "{",
  ...Object.entries(head).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)},`),
  '  "solves": [',
  solves.map(solve => "    " + JSON.stringify(solve)).join(",\n"),
  "  ]",
  "}",
  "",
].join("\n")

// by time, the ones without a time first
const time = solve => solve?.timestamp ?? ""
const byTime = (a, b) => time(a) < time(b) ? -1 : time(a) > time(b) ? 1 : 0

// Brings the records into the file. Returns the ids of the records that the file did not have as they
// are: new solves, and deletions of solves that it had as not deleted. A deleted solve stays deleted.
export const mergeIntoFile = (file, records) => {
  const places = new Map()
  file.solves.forEach((solve, place) => solve?.id != null && places.set(solve.id, place))
  const added = []
  for (const record of records) {
    const place = places.get(record.id)
    if (place === undefined) {
      places.set(record.id, file.solves.push(record) - 1)
      added.push(record.id)
    } else if (record.deleted && !file.solves[place].deleted) {
      file.solves[place] = {...file.solves[place], deleted: true, deletedAt: record.deletedAt ?? null}
      added.push(record.id)
    }
  }
  if (added.length > 0) {
    file.solves.sort(byTime)
  }
  return added
}
