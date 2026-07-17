/**
 * Plain-text (monospace) guitar tab rendering with chord names above the
 * staff — the classic format that pastes anywhere.
 */

import type { TabLayout } from "./layout";

const STRING_LABELS = ["E", "A", "D", "G", "B", "e"]; // low to high
const MAX_WIDTH = 76;

export function renderAsciiTab(layout: TabLayout, title?: string): string {
  const lines: string[] = [];
  if (title) {
    lines.push(title);
    lines.push("=".repeat(Math.min(title.length, MAX_WIDTH)));
  }
  lines.push(
    `Tempo ~${Math.round(layout.tempoBpm)} BPM · ${layout.beatsPerMeasure}/4 · standard tuning`
  );
  lines.push("");

  // Build per-measure cells, then wrap systems at MAX_WIDTH.
  interface MeasureCell {
    chordRow: string;
    stringRows: string[]; // index 0 = high e ... 5 = low E (display order)
  }

  const cells: MeasureCell[] = layout.measures.map((measure) => {
    const colWidths = measure.columns.map((col) =>
      Math.max(...col.notes.map((n) => String(n.fret).length), 1)
    );

    let chordRow = "";
    const rows = Array.from({ length: 6 }, () => "");
    let lastChord = "";

    measure.columns.forEach((col, i) => {
      const width = colWidths[i];
      const chord = col.chordName !== lastChord ? col.chordName : "";
      if (col.chordName) lastChord = col.chordName;

      chordRow += (chord || "").padEnd(width + 2, " ");
      for (let display = 0; display < 6; display++) {
        const stringIndex = 5 - display; // display row 0 = high e
        const note = col.notes.find((n) => n.string === stringIndex);
        const text = note ? String(note.fret) : "";
        rows[display] += text.padEnd(width, "-") + "--";
      }
    });

    if (measure.columns.length === 0) {
      chordRow = "    ";
      for (let display = 0; display < 6; display++) rows[display] = "----";
    }

    return { chordRow, stringRows: rows };
  });

  // Wrap measures into systems.
  let systemCells: MeasureCell[] = [];
  let systemWidth = 3; // label + '|'

  const flush = () => {
    if (systemCells.length === 0) return;
    const chordLine =
      "   " + systemCells.map((c) => " " + c.chordRow).join(" ");
    lines.push(chordLine.trimEnd());
    for (let display = 0; display < 6; display++) {
      const label = STRING_LABELS[5 - display];
      lines.push(
        `${label}|` +
          systemCells.map((c) => "-" + c.stringRows[display]).join("|") +
          "|"
      );
    }
    lines.push("");
    systemCells = [];
    systemWidth = 3;
  };

  for (const cell of cells) {
    const width = cell.stringRows[0].length + 2;
    if (systemWidth + width > MAX_WIDTH && systemCells.length > 0) flush();
    systemCells.push(cell);
    systemWidth += width;
  }
  flush();

  return lines.join("\n");
}
