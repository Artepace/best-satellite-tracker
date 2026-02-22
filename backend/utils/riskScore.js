// kesslerScore is a single number from 0–100 that summarises how close the current situation is to triggering that chain reaction.

const { detectCollisions } = require('../collision');

function kesslerScore(objects) {
  const total = objects.length;
  const collisions = detectCollisions(objects);
  const highRisk = collisions.filter(c => c.risk === "HIGH").length;

  const score = Math.min(100, Math.round((highRisk / total) * 10000));

  return {
    score,
    label: score > 70 ? "CRITICAL" : score > 40 ? "ELEVATED" : "NOMINAL"
  };
}

module.exports = { kesslerScore };