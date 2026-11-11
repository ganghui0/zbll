# zbll trainer
## [bestsiteever.net/zbll](https://www.bestsiteever.net/zbll) - web application for speedcubers for practicing ZBLL recognition and execution.

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
- Your hands can stay on the cube: turning the top face all the way around (U four times) starts like space,
  turning the bottom face all the way around the other way (D' four times) stops like Esc. A case you had just
  solved still counts. This can be switched off in the settings.
- Drag the virtual cube with the mouse to look at it from another side. Double click to undo that, and to tell the
  trainer that you hold the cube upright right now.

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
