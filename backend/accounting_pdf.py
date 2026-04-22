"""Pure, stateless PDF rendering helpers for the SA Accounting reports.

Used by the Trial Balance / Income Statement / Balance Sheet / VAT201 PDF
endpoints. No FastAPI, no database — just ReportLab.
"""
from __future__ import annotations

import io
from decimal import Decimal


def fmt_zar(v) -> str:
    """South African Rand formatting: 'R 12 345.67' (space as thousands sep)."""
    try:
        return f"R {float(v or 0):,.2f}".replace(",", " ")
    except Exception:
        return f"R {v}"


# Backwards-compat alias — existing server.py code uses _fmt_zar
_fmt_zar = fmt_zar


def pdf_buf_from_story(title: str, story_builder, branding: dict) -> io.BytesIO:
    """Shared ReportLab Platypus renderer with a branded accent-coloured header."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

    accent = HexColor("#" + branding["accent_hex"])
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="BrandTitle",  parent=styles["Title"],    textColor=accent, fontSize=22, spaceAfter=6))
    styles.add(ParagraphStyle(name="SubMuted",    parent=styles["Normal"],   textColor=HexColor("#64748b"), fontSize=9))
    styles.add(ParagraphStyle(name="SectionHead", parent=styles["Heading3"], textColor=accent, spaceBefore=12, spaceAfter=6))
    styles.add(ParagraphStyle(name="Disclaimer",  parent=styles["Italic"],   fontSize=8, textColor=HexColor("#64748b"), spaceBefore=14))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=1.6 * cm, bottomMargin=1.6 * cm,
        title=title, author=branding.get("company_name", ""),
    )
    story = [
        Paragraph(title, styles["BrandTitle"]),
        Paragraph(f"{branding.get('company_name','')} · {branding.get('email','')}", styles["SubMuted"]),
        Spacer(1, 10),
    ]
    story.extend(story_builder(styles, accent))
    doc.build(story)
    buf.seek(0)
    return buf


def report_table(data, styles, accent, col_widths=None, right_align_cols=None):
    """Build a ReportLab Table with the shared Ascent CRM accounting style."""
    from reportlab.platypus import Table, TableStyle
    from reportlab.lib.colors import HexColor, white
    right_align_cols = right_align_cols or []
    t = Table(data, colWidths=col_widths, repeatRows=1)
    ts = TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),  accent),
        ("TEXTCOLOR",      (0, 0), (-1, 0),  white),
        ("FONTNAME",       (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",       (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [white, HexColor("#f8fafc")]),
        ("GRID",           (0, 0), (-1, -1), 0.25, HexColor("#cbd5e1")),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",    (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 5),
        ("TOPPADDING",     (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 4),
    ])
    for c in right_align_cols:
        ts.add("ALIGN", (c, 0), (c, -1), "RIGHT")
    t.setStyle(ts)
    return t


# Backwards-compat aliases
_pdf_buf_from_story = pdf_buf_from_story
_report_table = report_table
