/**
 * Similarity scoring — how accurately did the user recreate the reference?
 *
 * Pure functions over two equal-sized grids. No canvas, no DOM, so the whole
 * module is testable in plain Node.
 *
 * ── Why two separate scores ──
 *
 * "Percent correct" hides which of two very different mistakes you made:
 *
 *   placement — is the right cell painted at all? Getting the SHAPE right.
 *   colour    — of the cells you did paint, is the colour right?
 *
 * Someone who traces the silhouette perfectly in one flat colour scores high
 * on placement and low on colour. Someone who picks colours beautifully but
 * draws the shape badly scores the opposite. A single blended number would
 * report both as "about 70%" and tell the artist nothing about what to fix.
 *
 * ── Why exact RGB matching is not enough ──
 *
 * Requiring an exact hex match is unfairly strict. The reference palette
 * comes from median cut over a photo, so it contains colours like #b4413a
 * that no human picks off a swatch grid. Choosing a visually identical red
 * would score zero. So colour comparison uses perceptual distance with a
 * tolerance, sharing the same redmean metric the pixelation pipeline uses.
 */

import { colorDistance, hexToRgb } from '../image/palette.js';

/**
 * Largest possible redmean distance (black vs white), used to normalise
 * raw distances into 0-1 so a tolerance can be expressed as a percentage.
 */
const MAX_DISTANCE = Math.sqrt(colorDistance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }));

/** Default tolerance: colours within 12% of the full range count as a match. */
export const DEFAULT_TOLERANCE = 0.12;

/** How much each sub-score contributes to the headline number. */
export const WEIGHTS = { placement: 0.6, color: 0.4 };

/**
 * Perceptual distance between two hex colours, normalised to 0-1.
 * 0 is identical, 1 is black against white.
 */
export function normalizedDistance(hexA, hexB) {
  if (hexA === hexB) return 0;
  const d = Math.sqrt(colorDistance(hexToRgb(hexA), hexToRgb(hexB)));
  return Math.min(1, d / MAX_DISTANCE);
}

/**
 * Classify one cell.
 *
 *   empty   — both blank. Correct, but says nothing about skill.
 *   exact   — identical colour.
 *   close   — painted, colour within tolerance.
 *   wrong   — painted, colour outside tolerance.
 *   missing — reference has paint here, the user left it blank.
 *   extra   — the user painted where the reference is blank.
 */
export function classifyCell(userCell, refCell, tolerance) {
  if (userCell === null && refCell === null) return 'empty';
  if (userCell === null) return 'missing';
  if (refCell === null) return 'extra';
  if (userCell === refCell) return 'exact';
  return normalizedDistance(userCell, refCell) <= tolerance ? 'close' : 'wrong';
}

/**
 * Compare a drawing against a reference.
 *
 * @param {string[][]} user
 * @param {string[][]} reference
 * @param {object} opts  { tolerance }
 * @returns {object|null} null when the grids cannot be compared
 */
export function compareGrids(user, reference, { tolerance = DEFAULT_TOLERANCE } = {}) {
  // Different sizes means cell (3,4) in one grid is not cell (3,4) in the
  // other, so every comparison would be meaningless. Refuse rather than
  // report a confident wrong number.
  if (!user || !reference) return null;
  if (user.length !== reference.length) return null;

  const size = user.length;
  if (size === 0) return null;

  // Grids are square by construction, but verify rather than trust it. A
  // ragged grid would otherwise be scanned as a square sub-region and score
  // confidently against cells that were never examined — a wrong answer is
  // worse than no answer.
  const square = grid => grid.every(row => row.length === size);
  if (!square(user) || !square(reference)) return null;

  const total = size * size;

  const counts = { empty: 0, exact: 0, close: 0, wrong: 0, missing: 0, extra: 0 };
  const errors = [];
  let closenessSum = 0;      // for the mean-closeness statistic
  let compared = 0;          // cells painted in BOTH grids

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const type = classifyCell(user[y][x], reference[y][x], tolerance);
      counts[type]++;

      if (type === 'exact' || type === 'close' || type === 'wrong') {
        compared++;
        closenessSum += 1 - normalizedDistance(user[y][x], reference[y][x]);
      }

      if (type === 'wrong' || type === 'missing' || type === 'extra') {
        errors.push({ x, y, type });
      }
    }
  }

  // ── placement: did paint go where paint belongs? ──
  // Colour is irrelevant here. A cell counts as correct if both grids agree
  // on whether it is painted at all.
  const placementCorrect = counts.empty + counts.exact + counts.close + counts.wrong;
  const placement = placementCorrect / total;

  // ── colour: among cells painted in both, how many are close enough? ──
  // Cells the user never painted cannot count against colour accuracy —
  // that failure is already recorded in the placement score. Counting it
  // twice would punish one mistake in two places.
  const color = compared === 0 ? null : (counts.exact + counts.close) / compared;
  const meanCloseness = compared === 0 ? null : closenessSum / compared;

  // With nothing painted in common there is no colour signal, so the
  // headline is placement alone rather than a colour score invented from
  // no data.
  const overall = color === null
    ? placement
    : placement * WEIGHTS.placement + color * WEIGHTS.color;

  return {
    size,
    total,
    counts,
    errors,
    compared,
    placement,
    color,
    meanCloseness,
    overall,
    tolerance,
  };
}

/** Format a 0-1 score as a percentage string. Null becomes a dash. */
export function formatScore(score) {
  return score === null || score === undefined ? '—' : `${Math.round(score * 100)}%`;
}

/**
 * A short, honest read on the result — what to fix, not just a number.
 * Ordered by which failure is costing the most.
 */
export function describeResult(result) {
  if (!result) return 'Nothing to compare';
  if (result.total === 0) return 'Empty grid';

  const { counts, placement, color } = result;

  if (counts.empty === result.total) return 'Nothing drawn yet';
  if (result.errors.length === 0) return 'Pixel perfect';

  if (counts.missing > counts.extra * 2 && counts.missing > 0) {
    return `${counts.missing} cells still unpainted`;
  }
  if (counts.extra > counts.missing * 2 && counts.extra > 0) {
    return `${counts.extra} cells painted outside the reference`;
  }
  if (color !== null && color < placement - 0.15) {
    return 'Shape is close — the colours are drifting';
  }
  if (placement < 0.7) return 'Shape needs work';
  return `${result.errors.length} cells to fix`;
}

/** Per-frame scores across a whole animation, plus the mean. */
export function compareAllFrames(frames, reference, opts = {}) {
  if (!reference) return null;
  const perFrame = frames.map(f => compareGrids(f.grid, reference, opts));
  const valid = perFrame.filter(Boolean);
  if (valid.length === 0) return null;

  return {
    perFrame,
    average: valid.reduce((sum, r) => sum + r.overall, 0) / valid.length,
  };
}