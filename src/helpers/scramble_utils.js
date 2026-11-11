import {random_element, shuffle} from "@/helpers/helpers";
import zbll_map_next from "@/assets/zbll_map_next.json"

export const makeScramble = (zbllKey, preferredLength) => {
  if (!zbllKey) return ""
  const scramblesMap = zbll_map_next[zbllKey]["scrambles"] // {"13": [scrambles], "14": [scrambles], …}
  const lengthVariations = Object.keys(scramblesMap)
  preferredLength = `${preferredLength}` // to string
  const choosenLength = lengthVariations.includes(preferredLength) ? preferredLength : lengthVariations[0]
  return applyRotationButLessB(random_element(scramblesMap[choosenLength]));
}

export const inverseScramble = s => {
  const arr = s.split(" ");

  return arr.map((it) => {
    if (it.length === 0) {
      return "";
    }

    if (it[it.length - 1] === '2') {
      return it;
    } else if (it[it.length - 1] === '\'') {
      return it.slice(0, -1);
    } else {
      return `${it}'`;
    }
  }).reverse().join(" ");
};


// The alg backwards, without a rotation: a "y" in front of an alg only says from which side it is done, so
// its setup turns other faces instead. null if the cube is turned around within the alg.
// "y R U R' U R U2 R'" -> "B U2 B' U' B U' B'"
const setupWithoutRotation = alg => {
  const [, side, moves] = /^(y[2']? )?(.*)$/.exec(alg)
  if (/[xyz]/.test(moves) || (side && /[MS]/.test(moves))) {
    return null // a slice move does not just get another name from another side
  }
  return applyRotation(inverseScramble(moves), inverseScramble(side?.trim() ?? ""))
}

// The moves that set up the case of these algs on a solved cube: one of the algs backwards. A rotation in
// a setup is easy to get wrong, so it is the first alg that only turns faces, or else the first one that
// leaves the cube as it is held.
export const setupMoves = algs => {
  const setups = algs.map(setupWithoutRotation).filter(setup => setup !== null)
  return setups.find(setup => /^[URFDLB2' ]*$/.test(setup)) ?? setups[0] ?? inverseScramble(algs[0])
}

// applies 2 random y-rotations to the given alg and returns the one with less B moves in it
const applyRotationButLessB = alg => {
  const yArr = shuffle(["", "y", "y2", "y'"]);
  const a1 = applyRotation(alg, yArr[0]);
  const a2 = applyRotation(alg, yArr[2]);

  const numB1 = (a1.match(/B/g) || []).length;
  const numB2 = (a2.match(/B/g) || []).length;

  return numB1 < numB2 ? a1 : a2;
}

// Returns sequence of moves that get the cube to the same position as (alg + rot) does, but without cube rotations.
// Example: applyRotationForAlgorithm("R U R'", "y") = "F U F'"
const applyRotation = (alg, yRotation) => {
  const rotations = {
    "y": {R: "F", F: "L", L: "B", B: "R"},
    "y'": {R: "B", B: "L", L: "F", F: "R"},
    "y2": {R: "L", L: "R", B: "F", F: "B"},
  };

  const mapObj = rotations[yRotation];
  if (!mapObj) {
    return alg;
  }

  const searchStr = Object.keys(mapObj).join("|");
  const re = new RegExp(searchStr, "gi");

  // a wide move (r) gets another name like its face (R)
  return alg.replace(re, matched =>
      matched === matched.toUpperCase() ? mapObj[matched] : mapObj[matched.toUpperCase()].toLowerCase());
};
