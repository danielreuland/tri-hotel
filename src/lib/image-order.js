// Reihenfolge der Bilder eines Objekts: Liste von IDs, das erste ist das Hauptbild (öffentlich zuerst gezeigt).
// dir: 'up' | 'down' | 'first'. Unbekannte ID oder Richtung: unverändert.
function move(ids, id, dir) {
  const list = [...ids];
  const i = list.indexOf(id);
  if (i < 0) return list;
  if (dir === 'first') {
    list.splice(i, 1);
    list.unshift(id);
  } else if (dir === 'up' && i > 0) {
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
  } else if (dir === 'down' && i < list.length - 1) {
    [list[i + 1], list[i]] = [list[i], list[i + 1]];
  }
  return list;
}

// Neue Bilder ans Ende; mit primary = true wird das erste neue Bild Hauptbild
function append(ids, newIds, primary = false) {
  if (!newIds.length) return [...ids];
  return primary ? [newIds[0], ...ids, ...newIds.slice(1)] : [...ids, ...newIds];
}

module.exports = { move, append };
