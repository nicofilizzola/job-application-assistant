"use client";

import type { ComponentProps, RefObject } from "react";
import { useRef } from "react";

import { toSegments, type Range } from "@/lib/profile-changes";

/** A real textarea with a mirror of its own text painted behind it, one mark per range. The
 *  textarea keeps every native editing behaviour - caret, selection, undo, IME, form submission -
 *  and the mirror is inert. The shadcn Textarea is deliberately not used here: it sets
 *  `field-sizing-content`, which resizes the box as you type and leaves the mirror behind. */
export function HighlightedTextarea({
  boxRef,
  value,
  onChange,
  ranges,
  readOnly,
  ...rest
}: {
  boxRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  ranges: Range[];
  readOnly?: boolean;
} & Pick<ComponentProps<"textarea">, "id" | "name" | "aria-label" | "placeholder">) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Overflow belongs in the shared string, not on either layer: a scrollbar changes the content
  // width, and a content width that differs between the layers makes them wrap differently, which
  // paints every highlight below the first differing line a row out. `overflow-y-scroll` rather
  // than `auto` so the gutter is reserved whether or not the text overflows.
  const shared =
    "h-[32rem] w-full overflow-y-scroll rounded-lg border px-2.5 py-2 text-base leading-6 break-words whitespace-pre-wrap md:text-sm";

  return (
    <div className="relative">
      <div
        ref={mirrorRef}
        aria-hidden
        className={`${shared} pointer-events-none absolute inset-0 border-transparent text-transparent`}
      >
        {toSegments(value, ranges).map((segment, index) =>
          segment.highlighted ? (
            <mark key={index} className="rounded bg-emerald-500/25 text-transparent">
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
        {/* A value ending in a newline has a last line with no glyph in it. Without this the mirror
            is one line shorter than the textarea and scrolls out of step at the bottom. */}
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea
        {...rest}
        ref={boxRef}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          const mirror = mirrorRef.current;
          if (mirror) mirror.scrollTop = event.currentTarget.scrollTop;
        }}
        className={`${shared} relative resize-none bg-transparent outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
          readOnly ? "text-muted-foreground" : ""
        }`}
      />
    </div>
  );
}
