"use client";

/**
 * SVG guitar tab renderer: six-line staff systems with fret numbers,
 * barlines, and chord names above the staff. Clicking a column seeks
 * playback to that moment.
 */

import { useMemo } from "react";
import type { TabLayout, TabMeasure } from "../lib/tabs/layout";
import { chordColor } from "../lib/ui/colors";
import { CHORDS, chordName } from "../lib/theory/chords";

interface TabSheetProps {
  layout: TabLayout;
  currentTime?: number;
  onSeek?: (time: number) => void;
}

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"]; // top to bottom
const LINE_GAP = 15;
const STAFF_HEIGHT = LINE_GAP * 5;
const CHORD_ROW = 26;
const SYSTEM_PAD = 26;
const SYSTEM_HEIGHT = CHORD_ROW + STAFF_HEIGHT + SYSTEM_PAD;
const MEASURE_MIN_WIDTH = 90;
const MEASURE_COLUMN_WIDTH = 34;
const LABEL_WIDTH = 26;
const SHEET_WIDTH = 940;

/** Color for a chord name string (falls back to slate). */
function chordNameColor(name: string): string {
  if (!name) return "#94a3b8";
  const chord = CHORDS.find((c) => {
    if (c.root < 0) return false;
    return chordName(c) === name || chordName(c, true) === name;
  });
  return chord ? chordColor(chord.id) : "#94a3b8";
}

export function TabSheet({ layout, currentTime = -1, onSeek }: TabSheetProps) {
  const systems = useMemo(() => {
    const rows: { measures: TabMeasure[]; widths: number[] }[] = [];
    let row: TabMeasure[] = [];
    let widths: number[] = [];
    let used = LABEL_WIDTH;

    for (const measure of layout.measures) {
      const width = Math.max(
        MEASURE_MIN_WIDTH,
        measure.columns.length * MEASURE_COLUMN_WIDTH + 24
      );
      if (used + width > SHEET_WIDTH && row.length > 0) {
        rows.push({ measures: row, widths });
        row = [];
        widths = [];
        used = LABEL_WIDTH;
      }
      row.push(measure);
      widths.push(width);
      used += width;
    }
    if (row.length > 0) rows.push({ measures: row, widths });
    return rows;
  }, [layout]);

  const totalHeight = systems.length * SYSTEM_HEIGHT + 10;

  return (
    <div className="w-full overflow-x-auto rounded-xl bg-slate-950/60 p-4">
      <svg
        viewBox={`0 0 ${SHEET_WIDTH} ${totalHeight}`}
        width="100%"
        style={{ minWidth: 640 }}
        role="img"
        aria-label="Guitar tablature"
      >
        {systems.map((system, sysIndex) => {
          const top = sysIndex * SYSTEM_HEIGHT + CHORD_ROW;
          let x = LABEL_WIDTH;

          return (
            <g key={sysIndex}>
              {/* String labels */}
              {STRING_LABELS.map((label, i) => (
                <text
                  key={label + i}
                  x={8}
                  y={top + i * LINE_GAP + 4}
                  fontSize={11}
                  fontFamily="ui-monospace, monospace"
                  fill="#64748b"
                >
                  {label}
                </text>
              ))}

              {/* Staff lines across the whole system */}
              {STRING_LABELS.map((_, i) => (
                <line
                  key={i}
                  x1={LABEL_WIDTH}
                  x2={
                    LABEL_WIDTH +
                    system.widths.reduce((a, b) => a + b, 0)
                  }
                  y1={top + i * LINE_GAP}
                  y2={top + i * LINE_GAP}
                  stroke="#334155"
                  strokeWidth={1}
                />
              ))}

              {system.measures.map((measure, mIndex) => {
                const width = system.widths[mIndex];
                const measureX = x;
                x += width;

                const isCurrent =
                  currentTime >= measure.startTime &&
                  currentTime < measure.endTime;

                let lastChord = "";
                return (
                  <g key={measure.index}>
                    {isCurrent && (
                      <rect
                        x={measureX}
                        y={top - 8}
                        width={width}
                        height={STAFF_HEIGHT + 16}
                        fill="rgba(99,102,241,0.08)"
                        rx={4}
                      />
                    )}
                    {/* Barline at measure end */}
                    <line
                      x1={measureX + width}
                      x2={measureX + width}
                      y1={top}
                      y2={top + STAFF_HEIGHT}
                      stroke="#475569"
                      strokeWidth={mIndex === system.measures.length - 1 ? 2.5 : 1.2}
                    />
                    {mIndex === 0 && (
                      <line
                        x1={measureX}
                        x2={measureX}
                        y1={top}
                        y2={top + STAFF_HEIGHT}
                        stroke="#475569"
                        strokeWidth={1.2}
                      />
                    )}

                    {/* Measure-start chord if no columns restate it */}
                    {measure.columns.map((column, cIndex) => {
                      const colX =
                        measureX +
                        14 +
                        column.measureFraction * (width - 28);
                      const showChord =
                        column.chordName && column.chordName !== lastChord;
                      if (column.chordName) lastChord = column.chordName;

                      const isActive =
                        currentTime >= column.time &&
                        currentTime < column.endTime;

                      return (
                        <g
                          key={cIndex}
                          onClick={() => onSeek?.(column.time + 0.01)}
                          style={{ cursor: onSeek ? "pointer" : "default" }}
                        >
                          {showChord && (
                            <text
                              x={colX}
                              y={top - 14}
                              fontSize={13}
                              fontWeight={700}
                              textAnchor="middle"
                              fill={chordNameColor(column.chordName)}
                            >
                              {column.chordName}
                            </text>
                          )}
                          {column.notes.map((note) => {
                            const y = top + (5 - note.string) * LINE_GAP;
                            const text = String(note.fret);
                            return (
                              <g key={note.string}>
                                <rect
                                  x={colX - text.length * 4.5 - 2}
                                  y={y - 7}
                                  width={text.length * 9 + 4}
                                  height={14}
                                  fill="#0f172a"
                                  rx={3}
                                />
                                <text
                                  x={colX}
                                  y={y + 4.5}
                                  fontSize={12.5}
                                  fontWeight={600}
                                  fontFamily="ui-monospace, monospace"
                                  textAnchor="middle"
                                  fill={isActive ? "#a5b4fc" : "#e2e8f0"}
                                >
                                  {text}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
