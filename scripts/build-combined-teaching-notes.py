#!/usr/bin/env python3
"""Build a private print guide from a public deck and private instructor notes.

The public HTML deck remains the source for slide titles and speaker cues. The
private Instructor Notes Guide remains the source for slide-by-slide instructor
guidance. The generated PDF is written only to the private instructor repo.

Example:
  python3 scripts/build-combined-teaching-notes.py \
    --public-root /path/to/BUS123-Solving-Business-Problems-with-Technology \
    --instructor-root /path/to/BUS123-instructor
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


DEFAULT_DECK = Path("MATH/M01/bus123-math-m01-l01-slides.html")
DEFAULT_INSTRUCTOR_NOTES = Path(
    "MATH/M01/bus123-math-m01-l01-instructor-notes.md"
)
DEFAULT_OUTPUT = Path(
    "MATH/M01/bus123-math-m01-l01-teaching-guide-print.pdf"
)

INK = colors.HexColor("#1A1F2C")
TEXT_SOFT = colors.HexColor("#465269")
MUTED = colors.HexColor("#747E8E")
SAGE = colors.HexColor("#4A7C5E")
GOLD = colors.HexColor("#B8843D")
PAPER = colors.HexColor("#FAF8F3")
GUIDE_BG = colors.HexColor("#F4EEE4")
BORDER = colors.HexColor("#DED9CD")


@dataclass
class CombinedNote:
    number: int
    title: str
    speaker_note: str
    instructor_note: str


def normalize(text: str) -> str:
    replacements = {
        "\u2014": "-",
        "\u2013": "-",
        "\u2212": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00d7": "x",
        "\u2192": "->",
        "\u2260": "!=",
        "\u00a0": " ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"[`*_]", "", text)
    return " ".join(text.split())


def parse_deck(path: Path) -> tuple[list[str], list[str]]:
    source = path.read_text(encoding="utf-8")
    notes_match = re.search(
        r'<script\b(?=[^>]*\bid=["\']speaker-notes["\'])[^>]*>(.*?)</script>',
        source,
        re.DOTALL | re.IGNORECASE,
    )
    if not notes_match:
        raise ValueError(f"Speaker-note JSON was not found in {path}")

    speaker_notes = [normalize(value) for value in json.loads(notes_match.group(1))]
    labels: dict[int, str] = {}
    for tag in re.findall(r"<section\b[^>]*>", source, re.IGNORECASE):
        slide_match = re.search(r'\bdata-slide=["\'](\d+)["\']', tag)
        label_match = re.search(r'\bdata-label=["\']([^"\']+)["\']', tag)
        if not slide_match or not label_match:
            continue
        number = int(slide_match.group(1))
        label = normalize(html.unescape(label_match.group(1)))
        labels[number] = re.sub(r"^\d+\s+", "", label)

    titles = [labels.get(number, f"Slide {number}") for number in range(1, len(speaker_notes) + 1)]
    if len(labels) < len(speaker_notes):
        missing = [number for number in range(1, len(speaker_notes) + 1) if number not in labels]
        raise ValueError(f"Missing slide labels for: {missing}")
    return titles, speaker_notes


def parse_instructor_notes(path: Path) -> dict[int, tuple[str, str]]:
    source = path.read_text(encoding="utf-8")
    section_match = re.search(
        r"^## Slide-by-slide instructor notes\s*$\n(.*?)(?=^##\s|\Z)",
        source,
        re.MULTILINE | re.DOTALL,
    )
    if not section_match:
        raise ValueError(
            f"Slide-by-slide instructor notes section was not found in {path}"
        )

    pattern = re.compile(
        r"^### Slide (\d+) - (.+?)\s*$\n\n(.*?)(?=^### Slide \d+ - |\Z)",
        re.MULTILINE | re.DOTALL,
    )
    return {
        int(number): (normalize(title), normalize(note))
        for number, title, note in pattern.findall(section_match.group(1))
    }


def combine(deck_path: Path, instructor_path: Path) -> list[CombinedNote]:
    titles, speaker_notes = parse_deck(deck_path)
    instructor_notes = parse_instructor_notes(instructor_path)
    expected_numbers = list(range(1, len(speaker_notes) + 1))
    actual_numbers = sorted(instructor_notes)
    if actual_numbers != expected_numbers:
        raise ValueError(
            f"Instructor notes must cover slides {expected_numbers}; found {actual_numbers}"
        )

    combined = []
    for index, (title, speaker_note) in enumerate(zip(titles, speaker_notes), start=1):
        private_title, instructor_note = instructor_notes[index]
        if normalize(private_title).lower() != normalize(title).lower():
            raise ValueError(
                f"Slide {index} title mismatch: deck '{title}' vs instructor notes '{private_title}'"
            )
        combined.append(CombinedNote(index, title, speaker_note, instructor_note))
    return combined


def build_pdf(notes: list[CombinedNote], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    page_width, page_height = letter
    left_margin = 0.48 * inch
    right_margin = 0.48 * inch
    top_margin = 0.62 * inch
    bottom_margin = 0.46 * inch
    usable_width = page_width - left_margin - right_margin

    compact_body = ParagraphStyle(
        "CompactBody",
        fontName="Helvetica",
        fontSize=7.25,
        leading=8.65,
        textColor=TEXT_SOFT,
        alignment=TA_LEFT,
        spaceAfter=0,
    )
    roomy_body = ParagraphStyle(
        "RoomyBody",
        parent=compact_body,
        fontSize=8.0,
        leading=9.55,
    )
    compact_title = ParagraphStyle(
        "CompactTitle",
        fontName="Helvetica-Bold",
        fontSize=9.8,
        leading=11.0,
        textColor=INK,
        spaceAfter=3,
    )
    roomy_title = ParagraphStyle(
        "RoomyTitle",
        parent=compact_title,
        fontSize=10.5,
        leading=11.8,
    )
    slide_label = ParagraphStyle(
        "SlideLabel",
        fontName="Courier-Bold",
        fontSize=6.6,
        leading=7.4,
        textColor=SAGE,
        spaceAfter=2,
    )
    speaker_label = ParagraphStyle(
        "SpeakerLabel",
        fontName="Helvetica-Bold",
        fontSize=6.3,
        leading=7.2,
        textColor=SAGE,
        spaceBefore=0,
        spaceAfter=1,
    )
    instructor_label = ParagraphStyle(
        "InstructorLabel",
        parent=speaker_label,
        textColor=GOLD,
        spaceBefore=3,
    )

    def draw_page(canvas, doc) -> None:
        canvas.saveState()
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.6)
        canvas.line(left_margin, page_height - 0.40 * inch, page_width - right_margin, page_height - 0.40 * inch)
        canvas.setFillColor(INK)
        canvas.setFont("Helvetica-Bold", 8.5)
        canvas.drawString(left_margin, page_height - 0.29 * inch, "BUS123 MATH-M01 L01 Combined Teaching Notes")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawRightString(page_width - right_margin, page_height - 0.29 * inch, "Whole Numbers, Fractions, and Percents")
        canvas.line(left_margin, 0.34 * inch, page_width - right_margin, 0.34 * inch)
        canvas.drawString(left_margin, 0.20 * inch, "PRIVATE - Instructor use only")
        canvas.drawRightString(page_width - right_margin, 0.20 * inch, f"Page {doc.page}")
        canvas.restoreState()

    document = SimpleDocTemplate(
        str(destination),
        pagesize=letter,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
        title="BUS123 MATH-M01 L01 Combined Teaching Notes",
        author="BUS 123 - Gerrish School of Business",
        subject="Private combined speaker and instructor notes",
    )

    page_count = math.ceil(len(notes) / 5)
    base_cards = len(notes) // page_count
    extra_cards = len(notes) % page_count
    cards_per_page = [
        base_cards + (1 if page_index < extra_cards else 0)
        for page_index in range(page_count)
    ]

    story = []
    note_index = 0
    for page_index, card_count in enumerate(cards_per_page):
        page_notes = notes[note_index : note_index + card_count]
        note_index += card_count
        body_style = compact_body if card_count == 5 else roomy_body
        title_style = compact_title if card_count == 5 else roomy_title

        for card_index, note in enumerate(page_notes):
            speaker_content = [
                Paragraph(f"SLIDE {note.number:02d}", slide_label),
                Paragraph(escape(note.title), title_style),
                Paragraph("SPEAKER CUE", speaker_label),
                Paragraph(escape(note.speaker_note), body_style),
            ]
            instructor_content = [
                Paragraph("INSTRUCTOR GUIDE", instructor_label),
                Paragraph(escape(note.instructor_note), body_style),
            ]
            inner = Table(
                [[speaker_content], [instructor_content]],
                colWidths=[usable_width - 0.07 * inch],
            )
            inner.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (0, 0), PAPER),
                        ("BACKGROUND", (0, 1), (0, 1), GUIDE_BG),
                        ("LEFTPADDING", (0, 0), (-1, -1), 9),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                        ("TOPPADDING", (0, 0), (-1, -1), 5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ("LINEABOVE", (0, 1), (0, 1), 0.45, BORDER),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ]
                )
            )
            card = Table(
                [["", inner]],
                colWidths=[0.07 * inch, usable_width - 0.07 * inch],
                hAlign="LEFT",
            )
            card.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (0, 0), SAGE),
                        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ]
                )
            )
            story.append(KeepTogether([card]))
            if card_index != card_count - 1:
                story.append(Spacer(1, 0.045 * inch))

        if page_index != len(cards_per_page) - 1:
            story.append(PageBreak())

    document.build(story, onFirstPage=draw_page, onLaterPages=draw_page)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-root", type=Path, required=True)
    parser.add_argument("--instructor-root", type=Path, required=True)
    parser.add_argument("--deck", type=Path, default=DEFAULT_DECK)
    parser.add_argument(
        "--instructor-notes", type=Path, default=DEFAULT_INSTRUCTOR_NOTES
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    public_root = args.public_root.resolve()
    instructor_root = args.instructor_root.resolve()
    deck_path = (public_root / args.deck).resolve()
    instructor_path = (instructor_root / args.instructor_notes).resolve()
    destination = (instructor_root / args.output).resolve()

    if public_root not in deck_path.parents:
        raise SystemExit("Deck path must remain inside the public repository")
    if instructor_root not in instructor_path.parents:
        raise SystemExit("Instructor-note path must remain inside the private repository")
    if instructor_root not in destination.parents:
        raise SystemExit("Output must remain inside the private instructor repository")

    notes = combine(deck_path, instructor_path)
    build_pdf(notes, destination)
    print(
        json.dumps(
            {
                "status": "success",
                "slides": len(notes),
                "pages": math.ceil(len(notes) / 5),
                "output": str(destination),
            }
        )
    )


if __name__ == "__main__":
    main()
