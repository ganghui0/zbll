# zbll trainer
## [bestsiteever.net/zbll](https://www.bestsiteever.net/zbll) - web application for speedcubers for practicing ZBLL recognition and execution.

## Weak cases

The cases you solve slowly or not at all come up more often than the others. The setting "Weak cases come up" says
how much: more often (the default), much more often, or like the others.

- The trainer keeps the last 5 results of every case. They stay when the session is cleared; a result you delete
  is forgotten.
- A result is compared to your typical time: the median, over the cases you selected, of their mean time. A DNF
  counts as twice the typical time, and so does a solve that took even longer.
- The score of a case is the mean of its results, in typical times, together with one made-up result of 1.5: a
  case you have not had yet is taken for a rather weak one, and one lucky solve does not make a case a strong one.
- A case comes up in proportion to its score squared ("more often") or to the power of four ("much more often"),
  but never twice in a row. A case that takes half as long again as the typical one comes up about twice as often
  as it, or four times as often with "much more often"; one you always DNF three times as often, or ten times.
- The result card shows the latest results of its case and how often it comes up compared to the average of the
  selected cases (×2 is twice as often). The stats card lists the weakest cases.
- With "like the others" every case has the same chance, except that one pick in five goes to the cases that
  came up least. Going through each case once ("recap") does not use the weights.

## Smart cube

The Bluetooth button on the timer page connects a smart cube (GAN, MoYu, QiYi, Giiker, GoCube), using
[smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth). It needs a browser with Web Bluetooth:
Chrome or Edge on a computer or on Android, on https or localhost.

With a cube connected there is nothing to scramble. Each case is put on a virtual cube, which follows every turn of
the real one, and its tilt if the cube has a gyro. The timer starts at your first turn (or when the case appears, see
the settings) and stops when the case is solved, then the next case comes up.

- Hold the real cube like the virtual one: with the cross color at the bottom (white by default, see the settings).
  If you have another side in front than the virtual cube, your turns show up on other faces, but the solve still
  counts and the virtual cube is turned to match from then on.
- <kbd>Space</kbd> or a tap starts and pauses.
- During a case, space or a tap gives up: the case is kept as a DNF with its algs on screen and put back on the
  virtual cube, and the trainer pauses so that you can try them.
- <kbd>Esc</kbd> drops the current attempt and pauses.
- Your hands can stay on the cube: a face turned all the way around is a gesture. They can be switched off in the
  settings.
  - U four times (the top face) starts like space.
  - D four times (the bottom face) gives up like space: the case is a DNF. Use it when an alg went wrong, instead
    of solving the cube back for a time that means nothing. It also works right after a solve, until the next case
    appears: that solve becomes a DNF.
  - D' four times (the bottom face, the other way) stops like Esc. A case you had just solved still counts.
- Drag the virtual cube with the mouse to look at it from another side. Double click to undo that, and to tell the
  trainer that you hold the cube upright right now.

The cube tells more about a solve than its time:

- *Execution* is the time from the first turn to the last, as the cube reports them. With the timer set to start
  when the case appears, *recognition* is the time from then to the first turn, and the two add up to the time of
  the solve.
- Turning the top face to look at the case (a pre-AUF) is recognition: turns of the top face that are followed by a
  pause of 0.3 seconds or more, before any other face is turned, do not start the execution. An AUF that goes
  straight into the alg does. With the timer set to start at the first turn, it starts over when the execution does.
- *Moves* counts the turns of the execution in the half turn metric: a double turn is one move, also when the cube
  reports it as two quarter turns, and a slice move is two. *TPS* is moves per second of execution.
- The line under the timer has these for the last solve while you are on the next case. The result card has them
  next to your mean for the same case in the session, with the turns you made, the ones before the execution in
  brackets. The cube only knows face turns: a wide move or a rotation shows up as the faces that turned, and
  renames the faces that follow. The stats card has the mean and the best of the session.

## Sync to Google Drive

Settings → *Sync to Google Drive* → *Sign in* keeps a history of every solve in your own Google Drive: the folder
`ZBLL Trainer` with the one file `zbll-trainer-stats.json`. There is no server: the browser talks to Google itself, and
only asks for the `drive.file` permission, which covers the files the trainer made and nothing else in your Drive.

- Every result, DNFs included, and every deleted result is queued in the browser and sent a few seconds later, in the
  background. Without a connection the results wait and are sent when it is back. The settings show when the last sync
  was and how many results wait.
- The file holds all solves of all sessions, browsers and devices: `{"app", "version", "updatedAt", "solves": [...]}`,
  one solve on a line, with `id`, `timestamp` (ISO), `caseKey`, `set` (T, U, ...), `timeMs`, `dnf`, `scramble`,
  `input` (`keyboard`, `touch` or `smart_cube`), `crossColor` (smart cube only) and `origin` (the page it was done on).
  A smart cube solve also has `executionMs`, `recognitionMs` (when the timer starts with the case), `moveCount`,
  `turns` (all of them as reported, like `R U R' U R U U R'`) and `turnTimesMs` (when each turn was made, from the
  first one). The execution starts `executionMs` before the last turn; the turns before that are not in `moveCount`.
  They are `null` for other solves, for DNFs and for the solves from before they were recorded.
  A deleted result stays in the file with `deleted: true`; clearing the session does not touch the file. The results
  that were in the browser before the first sign in are sent too, without a time.
- Google's access lasts an hour at a time. The trainer renews it by itself, in a hidden frame, where the browser lets
  Google see its cookies there (Chrome and Edge do by default). Where it cannot, a cloud icon in the top bar asks to
  sign in again, and the results wait until then. *Sign out* stops the sync in that browser only.

It needs a Google Cloud project of your own, once:

1. On [console.cloud.google.com](https://console.cloud.google.com) make a project and, under *APIs & Services →
   Library*, enable the *Google Drive API*.
2. Under *Google Auth Platform* (the OAuth consent screen) click *Get started*: an app name, your email, audience
   *External*. Then under *Audience* add your own Google account to the *Test users*.
3. Under *Clients* create a client of the type *Web application*, with
   - Authorized JavaScript origins: the site, like `https://<you>.github.io`, and `http://localhost:5173`
   - Authorized redirect URIs: `https://<you>.github.io/zbll/oauth-silent.html` and
     `http://localhost:5173/oauth-silent.html` (for renewing the access without a click)
4. Put the client ID in [src/config.js](src/config.js). It is not a secret.

While the app is in *Testing*, Google lets the permission run out after about a week and you sign in again;
*Publish app* on the *Audience* page ends that.

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```
