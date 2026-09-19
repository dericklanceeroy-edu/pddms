from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "supplier-invoice-upload-sample.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_WIDTH, PAGE_HEIGHT = A4
NAVY = colors.HexColor("#241D3B")
PURPLE = colors.HexColor("#7E22CE")
PALE_PURPLE = colors.HexColor("#F6F0FF")
INK = colors.HexColor("#29252F")
MUTED = colors.HexColor("#6B6572")
LINE = colors.HexColor("#E5E1EA")

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="SmallMuted",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyCompact",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=PURPLE,
        spaceAfter=4,
    )
)


def money(value: float) -> str:
    return f"PHP {value:,.2f}"


def page_decor(canvas, document):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_HEIGHT - 17 * mm, PAGE_WIDTH, 17 * mm, fill=1, stroke=0)
    canvas.setFillColor(PURPLE)
    canvas.rect(0, PAGE_HEIGHT - 19 * mm, PAGE_WIDTH, 2 * mm, fill=1, stroke=0)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 12 * mm, "Test document generated for PDDMS invoice-upload verification")
    canvas.drawRightString(PAGE_WIDTH - 18 * mm, 12 * mm, f"Page {document.page}")
    canvas.restoreState()


document = SimpleDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=25 * mm,
    bottomMargin=21 * mm,
    title="Supplier Invoice Upload Sample",
    author="MedSupply Distribution",
    subject="Test supplier invoice for PDDMS",
)

story = []

header = Table(
    [
        [
            Paragraph(
                '<font name="Helvetica-Bold" size="18" color="#241D3B">MEDSUPPLY</font><br/>'
                '<font name="Helvetica-Bold" size="10" color="#7E22CE">DISTRIBUTION</font>',
                styles["Normal"],
            ),
            Paragraph(
                '<para align="right"><font name="Helvetica-Bold" size="23" color="#241D3B">SUPPLIER INVOICE</font><br/>'
                '<font name="Helvetica-Bold" size="8" color="#7E22CE">UPLOAD TEST COPY</font></para>',
                styles["Normal"],
            ),
        ]
    ],
    colWidths=[78 * mm, 96 * mm],
)
header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.extend([header, Spacer(1, 7 * mm)])

supplier_info = Paragraph(
    "<b>MedSupply Distribution</b><br/>"
    "48 Pioneer Avenue, General Santos City<br/>"
    "South Cotabato 9500, Philippines<br/>"
    "0917 555 0184 | billing@medsupply.example",
    styles["BodyCompact"],
)
invoice_meta = Table(
    [
        ["Invoice number", "MSD-2026-0920-001"],
        ["Invoice date", "September 20, 2026"],
        ["Payment due", "October 20, 2026"],
        ["Purchase order", "PO-DEMO-001"],
        ["Payment terms", "Net 30"],
    ],
    colWidths=[35 * mm, 58 * mm],
)
invoice_meta.setStyle(
    TableStyle(
        [
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
            ("TEXTCOLOR", (1, 0), (1, -1), INK),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("LINEBELOW", (0, 0), (-1, -2), 0.35, LINE),
        ]
    )
)
overview = Table([[supplier_info, invoice_meta]], colWidths=[79 * mm, 95 * mm])
overview.setStyle(
    TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (1, 0), (1, 0), PALE_PURPLE),
            ("BOX", (1, 0), (1, 0), 0.5, colors.HexColor("#DCC8F4")),
            ("LEFTPADDING", (1, 0), (1, 0), 8),
            ("RIGHTPADDING", (1, 0), (1, 0), 8),
            ("TOPPADDING", (1, 0), (1, 0), 7),
            ("BOTTOMPADDING", (1, 0), (1, 0), 7),
        ]
    )
)
story.extend([overview, Spacer(1, 7 * mm)])

bill_to = Table(
    [
        [Paragraph("BILL TO", styles["SectionLabel"]), Paragraph("DELIVER TO", styles["SectionLabel"])],
        [
            Paragraph(
                "<b>Med Prix Drug Distributor and Pharmacy</b><br/>"
                "G Mesa Street, General Santos City<br/>"
                "South Cotabato, Philippines",
                styles["BodyCompact"],
            ),
            Paragraph(
                "<b>Receiving Department</b><br/>"
                "G Mesa Street, General Santos City<br/>"
                "Attention: Inventory Administrator",
                styles["BodyCompact"],
            ),
        ],
    ],
    colWidths=[87 * mm, 87 * mm],
)
bill_to.setStyle(
    TableStyle(
        [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FAF9FC")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
)
story.extend([bill_to, Spacer(1, 7 * mm)])

items = [
    ("Paracetamol 500 mg tablet", "box", 200, 4.25),
    ("Amoxicillin 500 mg capsule", "box", 100, 8.50),
    ("Cetirizine 10 mg tablet", "box", 150, 3.75),
    ("Omeprazole 20 mg capsule", "box", 80, 7.25),
    ("Multivitamins tablet", "box", 120, 5.00),
]

table_data = [["DESCRIPTION", "UNIT", "QTY", "UNIT COST", "LINE TOTAL"]]
subtotal = 0.0
for description, unit, quantity, unit_cost in items:
    line_total = quantity * unit_cost
    subtotal += line_total
    table_data.append([description, unit, str(quantity), money(unit_cost), money(line_total)])

item_table = Table(table_data, colWidths=[74 * mm, 20 * mm, 17 * mm, 29 * mm, 34 * mm], repeatRows=1)
item_table.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 8.5),
            ("TEXTCOLOR", (0, 1), (-1, -1), INK),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF9FC")]),
            ("LINEBELOW", (0, 1), (-1, -1), 0.35, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]
    )
)
story.extend([item_table, Spacer(1, 6 * mm)])

vat = subtotal * 0.12
total = subtotal + vat
notes = Paragraph(
    "<b>Notes</b><br/>"
    "Please reference the invoice number when recording payment. "
    "Report quantity or batch discrepancies within three business days of delivery.",
    styles["SmallMuted"],
)
totals = Table(
    [
        ["Subtotal", money(subtotal)],
        ["VAT (12%)", money(vat)],
        ["AMOUNT DUE", money(total)],
    ],
    colWidths=[35 * mm, 42 * mm],
)
totals.setStyle(
    TableStyle(
        [
            ("FONTNAME", (0, 0), (-1, 1), "Helvetica"),
            ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 1), 9),
            ("FONTSIZE", (0, 2), (-1, 2), 11),
            ("TEXTCOLOR", (0, 0), (0, 1), MUTED),
            ("TEXTCOLOR", (0, 2), (-1, 2), colors.white),
            ("BACKGROUND", (0, 2), (-1, 2), PURPLE),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("LINEBELOW", (0, 0), (-1, 1), 0.35, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]
    )
)
summary = Table([[notes, totals]], colWidths=[97 * mm, 77 * mm])
summary.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.extend([summary, Spacer(1, 9 * mm)])

payment = Table(
    [
        [Paragraph("PAYMENT DETAILS", styles["SectionLabel"])],
        [
            Paragraph(
                "Bank transfer: MedSupply Distribution - Test Account<br/>"
                "Reference: MSD-2026-0920-001<br/>"
                "This document is a test fixture and is not a demand for payment.",
                styles["BodyCompact"],
            )
        ],
    ],
    colWidths=[174 * mm],
)
payment.setStyle(
    TableStyle(
        [
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("BACKGROUND", (0, 0), (-1, 0), PALE_PURPLE),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
)
story.append(payment)

document.build(story, onFirstPage=page_decor, onLaterPages=page_decor)
print(OUTPUT)
