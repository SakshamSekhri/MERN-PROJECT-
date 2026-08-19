/**
 * Similarity scoring — how accurately did the user recreate the reference?
 *
 * Pure functions over two equal-sized grids. No canvas, no DOM, so the whole
 * module is testable in plain Node.
 *
 * ── High-Accuracy Cell-by-Cell Scoring Model ──
 *
 * 1. Per-Cell Match Scoring:
 *    Every cell in the N×N grid is evaluated individually against its target:
 *      - Exact match (same color or both empty) -> 100% score for that cell.
 *      - Close match (color within perceptual tolerance) -> Partial score (50%–99%).
 *      - Wrong color / Extra paint / Missing paint -> 0% score for that cell.
 *
 * 2. Overall Accuracy:
 *    Calculated as (Sum of all per-cell match scores) / (Total Grid Cells).
 *    Flooding the entire canvas with a single flat color over a multi-colored image
 *    scores its true ~3%–5% accuracy instead of false high scores.
 *    A completely blank user canvas scores 0%.
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
export const WEIGHTS = { placement: 0.5, color: 0.5 };

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
 *   empty   — both blank.
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
 * Highly accurate comparison of a drawing against a reference.
 *
 * @param {string[][]} user
 * @param {string[][]} reference
 * @param {object} opts  { tolerance }
 * @returns {object|null} null when the grids cannot be compared
 */
export function compareGrids(user, reference, { tolerance = DEFAULT_TOLERANCE } = {}) {
  if (!user || !reference) return null;
  if (user.length !== reference.length) return null;

  const size = user.length;
  if (size === 0) return null;

  const square = grid => grid.every(row => row.length === size);
  if (!square(user) || !square(reference)) return null;

  const total = size * size;
  const counts = { empty: 0, exact: 0, close: 0, wrong: 0, missing: 0, extra: 0 };
  const errors = [];

  let refPaintedCount = 0;
  let userPaintedCount = 0;
  let placementMatchCount = 0;
  let cellScoreSum = 0;
  let colorMatchSum = 0;
  let colorComparedCount = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = user[y][x];
      const r = reference[y][x];

      if (r !== null) refPaintedCount++;
      if (u !== null) userPaintedCount++;

      const type = classifyCell(u, r, tolerance);
      counts[type]++;

      if ((u === null && r === null) || (u !== null && r !== null)) {
        placementMatchCount++;
      }

      if (type === 'exact') {
        cellScoreSum += 1.0;
        colorMatchSum += 1.0;
        colorComparedCount++;
      } else if (type === 'close') {
        const dist = normalizedDistance(u, r);
        const sim = Math.max(0.5, 1 - (dist / tolerance) * 0.5);
        cellScoreSum += sim;
        colorMatchSum += sim;
        colorComparedCount++;
      } else if (type === 'empty') {
        cellScoreSum += 1.0;
      } else if (type === 'wrong') {
        colorComparedCount++;
        errors.push({ x, y, type: 'wrong' });
      } else if (type === 'missing') {
        errors.push({ x, y, type: 'missing' });
      } else if (type === 'extra') {
        errors.push({ x, y, type: 'extra' });
      }
    }
  }

  // A completely unpainted user canvas when artwork exists scores 0%
  if (userPaintedCount === 0 && refPaintedCount > 0) {
    return {
      size,
      total,
      counts,
      errors,
      compared: 0,
      placement: 0,
      color: 0,
      meanCloseness: 0,
      overall: 0,
      tolerance,
    };
  }

  const placement = placementMatchCount / total;
  const color = colorComparedCount > 0 ? colorMatchSum / colorComparedCount : 0;
  const overall = cellScoreSum / total;

  return {
    size,
    total,
    counts,
    errors,
    compared: colorComparedCount,
    placement,
    color,
    meanCloseness: color,
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
 */
export function describeResult(result) {
  if (!result) return 'Nothing to compare';
  if (result.total === 0) return 'Empty grid';

  const { counts, placement, color } = result;

  if (counts.exact === 0 && counts.close === 0 && counts.wrong === 0 && counts.extra === 0) {
    return 'Nothing drawn yet';
  }
  if (result.errors.length === 0) return 'Pixel perfect';

  if (counts.wrong > (counts.exact + counts.close) * 2) {
    return 'Wrong colours across most of the canvas';
  }
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