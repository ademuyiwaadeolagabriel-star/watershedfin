#!/usr/bin/env python3
"""
Watershed Capital v24 — Deployment Runbook Generator
Produces a PDF guide covering: VSCode → GitHub → Neon → Vercel
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

OUT_PATH = '/home/z/my-project/download/watershed-v24-deployment-runbook.pdf'

# ━━ Cascade Palette ━━
PAGE_BG       = colors.HexColor('#f3f3f2')
SECTION_BG    = colors.HexColor('#eae9e8')
CARD_BG       = colors.HexColor('#e9e7e2')
TABLE_STRIPE  = colors.HexColor('#ececea')
HEADER_FILL   = colors.HexColor('#534d3b')
COVER_BLOCK   = colors.HexColor('#847959')
BORDER        = colors.HexColor('#cec6ae')
ICON          = colors.HexColor('#928356')
ACCENT        = colors.HexColor('#8c7226')
ACCENT_2      = colors.HexColor('#339abd')
TEXT_PRIMARY  = colors.HexColor('#22211f')
TEXT_MUTED    = colors.HexColor('#86847c')
SEM_SUCCESS   = colors.HexColor('#498c5f')
SEM_WARNING   = colors.HexColor('#9f7e3c')
SEM_ERROR     = colors.HexColor('#93423b')
SEM_INFO      = colors.HexColor('#53708c')
CODE_BG       = colors.HexColor('#1f1d18')
CODE_TEXT     = colors.HexColor('#e8e3d2')

# Register fonts (use Liberation/DejaVu which are installed on the system)
try:
    pdfmetrics.registerFont(TTFont('Body', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('BodyBold', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('BodyItalic', '/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf'))
    pdfmetrics.registerFont(TTFont('Head', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('Mono', '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf'))
    pdfmetrics.registerFont(TTFont('MonoBold', '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf'))
    BODY_FONT = 'Body'
    BODY_BOLD = 'BodyBold'
    HEAD_FONT = 'Head'
    MONO_FONT = 'Mono'
    MONO_BOLD = 'MonoBold'
except Exception:
    BODY_FONT = 'Times-Roman'
    BODY_BOLD = 'Times-Bold'
    HEAD_FONT = 'Helvetica-Bold'
    MONO_FONT = 'Courier'
    MONO_BOLD = 'Courier-Bold'

# ━━ Styles ━━
styles = getSampleStyleSheet()

H1 = ParagraphStyle('H1', parent=styles['Heading1'],
    fontName=HEAD_FONT, fontSize=22, leading=28, textColor=HEADER_FILL,
    spaceBefore=18, spaceAfter=10, keepWithNext=True)

H2 = ParagraphStyle('H2', parent=styles['Heading2'],
    fontName=HEAD_FONT, fontSize=16, leading=20, textColor=HEADER_FILL,
    spaceBefore=14, spaceAfter=6, keepWithNext=True, borderPadding=0)

H3 = ParagraphStyle('H3', parent=styles['Heading3'],
    fontName=HEAD_FONT, fontSize=12, leading=16, textColor=ACCENT,
    spaceBefore=10, spaceAfter=4, keepWithNext=True)

BODY = ParagraphStyle('Body', parent=styles['BodyText'],
    fontName=BODY_FONT, fontSize=10, leading=15, textColor=TEXT_PRIMARY,
    spaceBefore=2, spaceAfter=6, alignment=TA_LEFT)

BULLET = ParagraphStyle('Bullet', parent=BODY,
    leftIndent=14, bulletIndent=2, spaceBefore=1, spaceAfter=3)

NOTE = ParagraphStyle('Note', parent=BODY,
    fontName=BODY_FONT, fontSize=9, leading=13, textColor=TEXT_MUTED,
    leftIndent=10, rightIndent=10, spaceBefore=4, spaceAfter=8,
    borderColor=BORDER, borderWidth=0, borderPadding=8,
    backColor=SECTION_BG)

CODE = ParagraphStyle('Code', parent=BODY,
    fontName=MONO_FONT, fontSize=8.5, leading=12, textColor=CODE_TEXT,
    backColor=CODE_BG, leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=8,
    borderPadding=6)

TOC_LINE = ParagraphStyle('TocLine', parent=BODY,
    fontName=BODY_FONT, fontSize=10, leading=14, textColor=TEXT_PRIMARY,
    leftIndent=12, spaceBefore=1, spaceAfter=1)


def code_block(text: str) -> Paragraph:
    """Render a multi-line shell command block with monospaced font on dark background."""
    # Escape XML chars
    safe = (text.replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;'))
    # Preserve newlines and indentation
    safe = safe.replace('\n', '<br/>').replace('  ', '&nbsp;&nbsp;')
    return Paragraph(f'<pre>{safe}</pre>', CODE)


def inline_code(text: str) -> str:
    safe = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return f'<font face="{MONO_FONT}" color="{ACCENT.hexval()}">{safe}</font>'


def callout(label: str, body: str, color=SEM_INFO) -> Table:
    """Colored callout box with a label and body text."""
    label_p = Paragraph(f'<font face="{HEAD_FONT}" color="{colors.white.hexval()}" size="9">{label}</font>',
                        ParagraphStyle('cl', parent=BODY, alignment=TA_CENTER))
    body_p = Paragraph(body, ParagraphStyle('cb', parent=BODY,
        fontName=BODY_FONT, fontSize=9.5, leading=13, textColor=TEXT_PRIMARY))
    t = Table([[label_p, body_p]], colWidths=[28*mm, 140*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), color),
        ('BACKGROUND', (1, 0), (1, 0), CARD_BG),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEBEFORE', (1, 0), (1, 0), 0, color),
    ]))
    return t


# ━━ Page header/footer ━━
def header_footer(canvas, doc):
    canvas.saveState()
    page_num = canvas.getPageNumber()
    # Header
    if page_num > 1:
        canvas.setFont(HEAD_FONT, 8)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawString(20*mm, A4[1] - 12*mm, 'Watershed Capital — v24 Deployment Runbook')
        canvas.drawRightString(A4[0] - 20*mm, A4[1] - 12*mm, 'Page %d' % page_num)
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(20*mm, A4[1] - 14*mm, A4[0] - 20*mm, A4[1] - 14*mm)
    # Footer
    canvas.setFont(BODY_FONT, 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(20*mm, 12*mm, 'Watershed Finance Limited — Confidential')
    canvas.drawRightString(A4[0] - 20*mm, 12*mm, 'v0.24.0  |  Generated 2026-07-21')
    canvas.restoreState()


def first_page(canvas, doc):
    """Cover page — solid block with title."""
    canvas.saveState()
    # Background block
    canvas.setFillColor(HEADER_FILL)
    canvas.rect(0, A4[1] - 95*mm, A4[0], 95*mm, fill=1, stroke=0)
    # Accent stripe
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1] - 100*mm, A4[0], 5*mm, fill=1, stroke=0)

    # Title
    canvas.setFillColor(colors.white)
    canvas.setFont(HEAD_FONT, 11)
    canvas.drawString(20*mm, A4[1] - 30*mm, 'WATERSHED FINANCE LIMITED')
    canvas.setFont(HEAD_FONT, 28)
    canvas.drawString(20*mm, A4[1] - 50*mm, 'v24 Deployment Runbook')
    canvas.setFont(BODY_FONT, 12)
    canvas.setFillColor(colors.HexColor('#d8d2bf'))
    canvas.drawString(20*mm, A4[1] - 62*mm, 'VS Code  →  GitHub  →  Neon  →  Vercel')

    # Subtitle / scope
    canvas.setFont(BODY_FONT, 10)
    canvas.setFillColor(colors.HexColor('#b8b09a'))
    canvas.drawString(20*mm, A4[1] - 75*mm, 'Full step-by-step deployment guide for the SuperAdmin System Control release.')
    canvas.drawString(20*mm, A4[1] - 83*mm, 'Includes schema migration, environment variables, cron jobs, and rollback.')

    # Bottom info block
    canvas.setFillColor(SECTION_BG)
    canvas.rect(0, 0, A4[0], 35*mm, fill=1, stroke=0)
    canvas.setFillColor(HEADER_FILL)
    canvas.setFont(HEAD_FONT, 9)
    canvas.drawString(20*mm, 25*mm, 'Version')
    canvas.drawString(70*mm, 25*mm, 'Release Date')
    canvas.drawString(120*mm, 25*mm, 'Author')
    canvas.setFont(BODY_FONT, 10)
    canvas.setFillColor(TEXT_PRIMARY)
    canvas.drawString(20*mm, 19*mm, '0.24.0')
    canvas.drawString(70*mm, 19*mm, '21 July 2026')
    canvas.drawString(120*mm, 19*mm, 'Watershed Engineering')

    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(BODY_FONT, 8)
    canvas.drawString(20*mm, 10*mm, 'Confidential — Internal Use Only')
    canvas.restoreState()


# ━━ Build story ━━
story = []

# Cover (rendered by first_page; just push a PageBreak)
story.append(PageBreak())

# ── Section 0: Table of Contents ──
story.append(Paragraph('Table of Contents', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

toc_items = [
    ('1.', 'What is New in v24', '3'),
    ('2.', 'Pre-Deployment Checklist', '4'),
    ('3.', 'Phase 1 — VS Code (Local Environment)', '5'),
    ('4.', 'Phase 2 — GitHub (Source Control)', '6'),
    ('5.', 'Phase 3 — Neon (Database Migration)', '7'),
    ('6.', 'Phase 4 — Vercel (Production Deploy)', '8'),
    ('7.', 'Post-Deployment Verification', '9'),
    ('8.', 'Environment Variables Reference', '10'),
    ('9.', 'Rollback Procedure', '11'),
    ('10.', 'Troubleshooting', '12'),
]
toc_data = [[Paragraph(f'<font face="{HEAD_FONT}" color="{ACCENT.hexval()}">{n}</font>', TOC_LINE),
             Paragraph(t, TOC_LINE),
             Paragraph(f'<font color="{TEXT_MUTED.hexval()}">{p}</font>', TOC_LINE)] for n, t, p in toc_items]
toc_table = Table(toc_data, colWidths=[15*mm, 130*mm, 25*mm])
toc_table.setStyle(TableStyle([
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
    ('LINEBELOW', (0, 0), (-1, -1), 0.3, BORDER),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
]))
story.append(toc_table)
story.append(PageBreak())

# ── Section 1: What's New in v24 ──
story.append(Paragraph('1. What is New in v24', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'v24 introduces a dedicated <b>SuperAdmin System Control</b> module — five features that '
    'give the platform owner operational command without requiring code changes or redeployments. '
    'It also ships a critical Windows-compatibility fix for the development script and the first '
    'formal Vercel cron configuration. The five new features are listed in the table below; each one '
    'is hard-locked to the super admin role and exposed under a new <i>SuperAdmin Control</i> group in '
    'the sidebar. No other roles can see or access them.', BODY))

new_features = [
    ['Feature', 'Purpose', 'New Model', 'New API Route'],
    ['Platform Dashboard', 'System-wide KPIs (admins, users, loans, disbursement this month, sessions, audit logs)',
     '—', 'GET /api/superadmin/dashboard'],
    ['System Health', 'Live DB latency, build info, runtime, feature flag summary',
     '—', 'GET /api/superadmin/system-health'],
    ['Feature Flags', 'Toggle platform features at runtime without redeploy',
     'FeatureFlag', 'GET/POST/PATCH /api/superadmin/feature-flags'],
    ['Maintenance Mode', 'Block non-superadmin logins + show banner during scheduled downtime',
     'SystemSetting', 'GET/POST /api/superadmin/maintenance'],
    ['Active Sessions', 'See who is signed in + force logout any user instantly',
     'ActiveSession', 'GET/DELETE /api/superadmin/sessions'],
    ['Audit Retention', 'Configure N-day retention policy + daily auto-purge cron job',
     'SystemSetting', 'GET/POST /api/superadmin/audit-retention'],
]
t = Table(new_features, colWidths=[32*mm, 60*mm, 28*mm, 50*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), HEAD_FONT),
    ('FONTNAME', (0, 1), (-1, -1), BODY_FONT),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('ALIGN', (0, 0), (-1, 0), 'LEFT'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
]))
story.append(t)
story.append(Spacer(1, 12))

story.append(Paragraph('1.1 Critical Bug Fix: Windows dev script', H2))
story.append(Paragraph(
    'In v23, the <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">dev</font> script in '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">package.json</font> was written as '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">next dev -p 3000 2&gt;&amp;1 | tee dev.log</font>. '
    'The <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">tee</font> command does not exist on '
    'Windows PowerShell or CMD, which caused <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">bun run dev</font> '
    'and <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">npm run dev</font> to fail with a '
    'syntax error. v24 removes the pipe so the script works on Windows, macOS, and Linux identically:', BODY))
story.append(code_block('"dev": "next dev -p 3000"'))
story.append(Paragraph(
    'The <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">start</font> script was also '
    'stripped of its <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">tee</font> pipe '
    'for the same reason. If you previously relied on <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">dev.log</font> '
    'for log capture, redirect output manually with '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">npm run dev &gt; dev.log 2&gt;&amp;1</font> '
    'on macOS/Linux or '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">npm run dev &gt; dev.log 2&gt;&amp;1</font> '
    'in PowerShell on Windows.', BODY))

story.append(Paragraph('1.2 New Vercel Cron: Audit Cleanup', H2))
story.append(Paragraph(
    'A new <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">vercel.json</font> file in the project '
    'root registers four daily cron jobs. The audit-cleanup job is the new v24 addition; the other three were '
    'previously documented in <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">CRON-JOBS.md</font> '
    'but had not yet been wired into Vercel cron. They are now all configured:', BODY))

cron_data = [
    ['Path', 'Schedule (UTC)', 'Purpose'],
    ['/api/cron/auto-npl', '0 0 * * *  (00:00 daily)', 'Auto-classify NPL based on days-past-due'],
    ['/api/cron/payment-reminders', '0 8 * * *  (08:00 daily)', 'Send repayment reminder SMS/email to customers'],
    ['/api/cron/drip-campaigns', '0 9 * * *  (09:00 daily)', 'Send drip-campaign emails to leads'],
    ['/api/cron/audit-cleanup', '0 2 * * *  (02:00 daily)', 'Purge AuditLog and LoginHistory older than retention policy'],
]
t = Table(cron_data, colWidths=[60*mm, 45*mm, 65*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), HEAD_FONT),
    ('FONTNAME', (0, 1), (-1, -1), BODY_FONT),
    ('FONTSIZE', (0, 0), (-1, -1), 8.5),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
]))
story.append(t)
story.append(Spacer(1, 8))
story.append(callout('NOTE',
    'Vercel cron jobs require a <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">CRON_SECRET</font> '
    'environment variable. The audit-cleanup endpoint validates the Authorization header against this secret. '
    'Add it to your Vercel project environment before deploying.'))

story.append(PageBreak())

# ── Section 2: Pre-Deployment Checklist ──
story.append(Paragraph('2. Pre-Deployment Checklist', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'Before starting the deployment, ensure you have the following credentials and tools ready. '
    'Skipping any item in this list will block you at a later step. All credentials should already '
    'exist from the v23 deployment — v24 does not introduce any new external service dependencies, '
    'but it does require three new environment variables (covered in section 8).', BODY))

checklist = [
    ['#', 'Item', 'Why you need it', 'Where to get it'],
    ['1', 'GitHub repo access', 'Push v24 commits', 'https://github.com/ademuyiwaadeolagabriel-star/watershedfin'],
    ['2', 'Neon database project', 'Apply Prisma schema migration', 'https://console.neon.tech'],
    ['3', 'Neon connection string', ' DATABASE_URL env var', 'Neon dashboard → Connection Details → Pooled connection'],
    ['4', 'Neon direct connection string', 'DIRECT_URL env var (for migrations)', 'Neon dashboard → Connection Details → Direct connection'],
    ['5', 'Vercel project', 'Auto-deploy from GitHub', 'https://vercel.com/watershed-capital'],
    ['6', 'Local Node.js 20+', 'Run Prisma + Next.js', 'node --version (should be ≥ 20.0.0)'],
    ['7', 'Bun (optional, faster)', 'Run dev server', 'https://bun.sh'],
    ['8', 'VS Code with Prisma extension', 'Syntax highlighting for schema.prisma', 'VS Code Marketplace → Prisma'],
    ['9', 'Terminal with git access', 'Clone, commit, push', 'PowerShell, CMD, or WSL on Windows'],
    ['10', 'JWT_SECRET env var', 'Required by the auth module', 'A random 32+ char string — keep the same as v23'],
    ['11', 'CRON_SECRET env var (new in v24)', 'Required by /api/cron/audit-cleanup', 'Generate a fresh random 32+ char string'],
]
t = Table(checklist, colWidths=[8*mm, 38*mm, 60*mm, 64*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), HEAD_FONT),
    ('FONTNAME', (0, 1), (-1, -1), BODY_FONT),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
]))
story.append(t)
story.append(Spacer(1, 10))

story.append(callout('WARNING',
    'Do NOT generate a new JWT_SECRET for v24. Doing so will sign out every staff member and customer. '
    'Reuse the exact same value that is currently deployed in Vercel. The CRON_SECRET, however, is new — '
    'generate a fresh one.', color=SEM_WARNING))

story.append(PageBreak())

# ── Section 3: Phase 1 — VS Code ──
story.append(Paragraph('3. Phase 1 — VS Code (Local Environment)', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'This phase pulls the v24 code changes from GitHub to your local VS Code workspace, installs the '
    'new dependencies (if any), and verifies the local dev server boots cleanly. None of the commands '
    'in this phase touch GitHub, Neon, or Vercel — they only affect your local working copy. Complete '
    'every step before moving to Phase 2.', BODY))

story.append(Paragraph('3.1 Open the project folder', H3))
story.append(Paragraph(
    'Open VS Code and open the project folder. If this is your first time on this machine, clone the '
    'repo first. Otherwise, just open the existing folder:', BODY))
story.append(code_block('''# If cloning for the first time:
git clone https://github.com/ademuyiwaadeolagabriel-star/watershedfin.git
cd watershedfin
code .

# If you already have the project locally:
cd C:\\\\Users\\\\YourName\\\\watershedfin
git pull origin main'''))

story.append(Paragraph('3.2 Install dependencies', H3))
story.append(Paragraph(
    'v24 does not add any new npm dependencies, but it does add new Prisma models — so we need to '
    'regenerate the Prisma Client. Use whichever package manager you used for v23:', BODY))
story.append(code_block('''# Option A: npm
npm install
npx prisma generate

# Option B: bun (faster)
bun install
bunx prisma generate'''))

story.append(Paragraph('3.3 Verify the local dev server boots', H3))
story.append(Paragraph(
    'Start the dev server and confirm it boots without errors. The v24 dev script no longer pipes '
    'through <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">tee</font>, so it will '
    'work on Windows. Open a browser and navigate to <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">http://localhost:3000</font>. '
    'You should see the public home page:', BODY))
story.append(code_block('''# Start dev server (works on Windows, macOS, and Linux)
npm run dev
# OR
bun run dev
# OR (explicit)
npx next dev -p 3000'''))

story.append(Paragraph(
    'Watch the terminal for any compilation errors. The first compile takes ~15 seconds due to '
    'Turbopack. If you see a clean <i>Ready in 1-2 seconds</i> message and the home page loads, '
    'Phase 1 is complete. If you see Prisma errors about missing models like '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">FeatureFlag</font>, '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">SystemSetting</font>, or '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">ActiveSession</font>, that is expected — '
    'the local database has not yet received the schema update. We will fix that in Phase 3.', BODY))

story.append(callout('TIP',
    'To verify the v24 sidebar works locally without a database, sign in as the super admin and check '
    'that a new <b>SuperAdmin Control</b> group appears at the bottom of the sidebar with 6 items. '
    'If you can see the menu items but clicking them shows a 500 error, that confirms the code is '
    'deployed correctly and only the database migration is pending.'))

story.append(PageBreak())

# ── Section 4: Phase 2 — GitHub ──
story.append(Paragraph('4. Phase 2 — GitHub (Source Control)', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'This phase commits all v24 code changes to your local git repository and pushes them to GitHub. '
    'Once the push completes, Vercel will automatically detect the new commit and trigger a production '
    'build. There is no need to manually trigger a Vercel deploy — Vercel watches the main branch of '
    'your GitHub repo and rebuilds on every push to main.', BODY))

story.append(Paragraph('4.1 Check what changed', H3))
story.append(Paragraph(
    'Before committing, review what files were changed. You should see new files under '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">src/app/api/superadmin/</font>, '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">src/components/views/superadmin/</font>, '
    'and <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">src/app/api/cron/audit-cleanup/</font>. '
    'You should also see modifications to '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">prisma/schema.prisma</font>, '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">package.json</font>, '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">vercel.json</font>, '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">src/components/sidebar.tsx</font>, '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">src/lib/store.ts</font>, '
    'and <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">src/app/page.tsx</font>.', BODY))
story.append(code_block('''git status
git diff --stat'''))

story.append(Paragraph('4.2 Stage and commit', H3))
story.append(Paragraph(
    'Stage all changes and create a single commit. The commit message should be descriptive and '
    'mention v24 so it is easy to find later. Use the heredoc syntax below to keep the multi-line '
    'commit message clean:', BODY))
story.append(code_block('''git add .

git commit -m "v24: SuperAdmin System Control module + Windows dev script fix

- Add 5 superadmin-exclusive features: platform dashboard, system health,
  feature flags, maintenance mode, active sessions, audit retention
- Add 3 new Prisma models: FeatureFlag, SystemSetting, ActiveSession
- Add 7 new API routes under /api/superadmin/* (all require role='super')
- Add /api/cron/audit-cleanup for daily audit log retention purge
- Add new SuperAdmin Control group to sidebar (6 items, super-only)
- Add maintenance-mode middleware on /api/auth/login + /api/customer/login
- Add vercel.json with 4 daily cron jobs (auto-npl, payment-reminders,
  drip-campaigns, audit-cleanup)
- Fix package.json dev script: remove tee pipe (was breaking on Windows)
- Bump version to 0.24.0"'''))

story.append(Paragraph('4.3 Push to GitHub', H3))
story.append(Paragraph(
    'Push the commit to the main branch. If you have two-factor authentication enabled on your GitHub '
    'account, you may be prompted for a personal access token instead of a password. If the push is '
    'rejected because the remote has commits you do not have locally, run '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">git pull --rebase origin main</font> '
    'first, then retry the push:', BODY))
story.append(code_block('''git push origin main'''))

story.append(Paragraph('4.4 Confirm the push triggered a Vercel build', H3))
story.append(Paragraph(
    'Open your Vercel project dashboard at '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">https://vercel.com/watershed-capital</font> '
    '(replace the slug with your actual project name). Under the <b>Deployments</b> tab, you should see '
    'a new deployment with the status <i>Building</i> within 10 seconds of the push. The build typically '
    'takes 2-4 minutes. Do not proceed to Phase 3 until the build status changes to <i>Ready</i> — '
    'otherwise the production URL will still be serving v23 code.', BODY))

story.append(callout('WARNING',
    'If the Vercel build fails, it is almost certainly because the '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">CRON_SECRET</font> environment '
    'variable has not been set yet. Add it now (see Section 8) and then click <i>Redeploy</i> on the '
    'failed deployment in Vercel. Do not roll back the commit — the code is correct; only the env var '
    'is missing.', color=SEM_WARNING))

story.append(PageBreak())

# ── Section 5: Phase 3 — Neon ──
story.append(Paragraph('5. Phase 3 — Neon (Database Migration)', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'This phase applies the v24 Prisma schema changes to your Neon PostgreSQL database. The schema '
    'adds three new models (FeatureFlag, SystemSetting, ActiveSession) and one new reverse relation '
    '(Admin.activeSessions). Because we are using <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">prisma db push</font> '
    'instead of <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">prisma migrate dev</font>, '
    'no migration files are created — Prisma introspects the existing database and applies the diff '
    'directly. This is the recommended approach for projects that do not need a migration history '
    '(single-instance deployments with a single source environment).', BODY))

story.append(Paragraph('5.1 Confirm your .env file has both Neon URLs', H3))
story.append(Paragraph(
    'Open <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">.env</font> in the project root. '
    'You should have two Neon connection strings:', BODY))
story.append(code_block('''# .env file — both values come from Neon dashboard

# Pooled connection — used by the app at runtime (connection pooling)
DATABASE_URL="postgresql://user:pass@ep-pooled-xxx.region.aws.neon.tech/dbname?sslmode=require"

# Direct connection — used by prisma db push and prisma migrate
# (Prisma cannot use the pooled URL for DDL operations)
DIRECT_URL="postgresql://user:pass@ep-direct-xxx.region.aws.neon.tech/dbname?sslmode=require"'''))

story.append(callout('CRITICAL',
    'If <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">DIRECT_URL</font> is missing or '
    'identical to <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">DATABASE_URL</font>, '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">prisma db push</font> will fail with '
    'an opaque "prepared statement" error. Neon uses PgBouncer for pooled connections, and PgBouncer '
    'does not support DDL. The DIRECT_URL bypasses PgBouncer.', color=SEM_ERROR))

story.append(Paragraph('5.2 Run prisma db push', H3))
story.append(Paragraph(
    'Run the schema push from the project root. This is a non-destructive operation — it only adds '
    'new tables and columns; it does not drop or modify existing data. You should see output listing '
    'three new tables (FeatureFlag, SystemSetting, ActiveSession) and one new column on Admin:', BODY))
story.append(code_block('''# Apply schema changes to Neon
npx prisma db push

# Expected output:
# 🌱  Your database is now in sync with your Prisma schema.
# ✔ Generated Prisma Client'''))

story.append(Paragraph('5.3 Verify the new tables exist', H3))
story.append(Paragraph(
    'Log into the Neon console and open the SQL Editor. Run the following query to confirm all three '
    'new tables were created:', BODY))
story.append(code_block('''-- Run this in the Neon SQL Editor
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('FeatureFlag', 'SystemSetting', 'ActiveSession')
ORDER BY table_name;

-- Expected: 3 rows returned'''))

story.append(Paragraph('5.4 Seed initial feature flags (optional but recommended)', H3))
story.append(Paragraph(
    'The v24 super admin dashboard reads from the FeatureFlag table. If it is empty, the dashboard '
    'will show "0 / 0 enabled" — which is correct but visually empty. To make the dashboard more '
    'useful on day one, insert a few starter flags. Run this in the Neon SQL Editor:', BODY))
story.append(code_block('''-- Run this in the Neon SQL Editor
INSERT INTO "FeatureFlag" (id, key, label, description, enabled, environment, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'new_credit_engine',     'New Credit Engine v2',     'Toggle the new 21-function credit appraisal engine', false, 'all', now(), now()),
  (gen_random_uuid(), 'customer_portal_v2',    'Customer Portal v2',       'Toggle the redesigned customer portal layout',      false, 'all', now(), now()),
  (gen_random_uuid(), 'auto_npl_classification','Auto NPL Classification', 'Toggle the daily NPL auto-classification cron job', true,  'all', now(), now()),
  (gen_random_uuid(), 'email_verification',    'Email Verification',       'Require new customers to verify their email',       true,  'all', now(), now()),
  (gen_random_uuid(), 'phone_otp_login',       'Phone OTP Login',          'Allow customers to sign in with phone + OTP',       false, 'all', now(), now());

-- Also seed the default audit retention policy (365 days)
INSERT INTO "SystemSetting" (id, key, value, type, category, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'audit_retention_days', '365',  'number',  'retention',   now(), now()),
  (gen_random_uuid(), 'maintenance_mode',     'false','boolean', 'maintenance', now(), now()),
  (gen_random_uuid(), 'maintenance_message',
   'We are performing scheduled maintenance. Please check back shortly.',
   'string', 'maintenance', now(), now());'''))

story.append(Paragraph(
    'These seed rows are not required — the dashboard handles empty state gracefully — but they '
    'give you something to look at immediately after deployment. You can also create flags and '
    'set the retention policy through the super admin UI after deployment.', BODY))

story.append(PageBreak())

# ── Section 6: Phase 4 — Vercel ──
story.append(Paragraph('6. Phase 4 — Vercel (Production Deploy)', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'If you pushed to GitHub in Phase 2, Vercel has already auto-deployed v24 by the time you reach '
    'this section. The work in this phase is to <b>add the new CRON_SECRET environment variable</b>, '
    'verify the deployment, and confirm that the new cron jobs are registered. If you have not yet '
    'pushed to GitHub, go back and complete Phase 2 first.', BODY))

story.append(Paragraph('6.1 Add the CRON_SECRET environment variable', H3))
story.append(Paragraph(
    'Open Vercel → your project → <b>Settings</b> → <b>Environment Variables</b>. Add a new variable '
    'with the following values. Generate a random 32+ character string for the value — you can use '
    'any online password generator or run the command below:', BODY))
story.append(code_block('''# Generate a random CRON_SECRET (run this in your terminal)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Sample output: a3f4b8c9d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8'''))

# Render env var table
vercel_env = [
    ['Field', 'Value'],
    ['Key', 'CRON_SECRET'],
    ['Value', '<paste the 64-char hex string from above>'],
    ['Environments', '☑ Production  ☑ Preview  ☑ Development'],
    ['Sensitive', '☑ Yes (checked)'],
]
t = Table(vercel_env, colWidths=[40*mm, 130*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), HEAD_FONT),
    ('FONTNAME', (0, 1), (-1, -1), BODY_FONT),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
]))
story.append(t)
story.append(Spacer(1, 8))
story.append(Paragraph(
    'Click <b>Save</b>. Vercel will prompt you to redeploy — click <b>Redeploy</b> to apply the new '
    'environment variable. Wait for the new deployment to finish (2-4 minutes).', BODY))

story.append(Paragraph('6.2 Verify the deployment', H3))
story.append(Paragraph(
    'Once the deployment status changes to <i>Ready</i>, open the production URL in a private browser '
    'window. Sign in as the super admin. Open the sidebar — you should see a new <b>SuperAdmin Control</b> '
    'group at the bottom with 6 items:', BODY))
story.append(code_block('''Production URL: https://watershed-capital.vercel.app
                  (replace with your actual Vercel URL)

Expected sidebar items (in order):
  SuperAdmin Control
    ▸ Platform Dashboard
    ▸ System Health
    ▸ Feature Flags
    ▸ Maintenance Mode
    ▸ Active Sessions
    ▸ Audit Retention'''))

story.append(Paragraph('6.3 Verify the cron jobs are registered', H3))
story.append(Paragraph(
    'In Vercel, go to your project → <b>Settings</b> → <b>Cron Jobs</b>. You should see 4 entries '
    'matching the schedule in <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">vercel.json</font>. '
    'If you only see 3 (auto-npl, payment-reminders, drip-campaigns) and audit-cleanup is missing, '
    'the most likely cause is that the deployment was triggered before you saved '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">vercel.json</font>. Re-push to '
    'main or click <b>Redeploy</b>:', BODY))
story.append(code_block('''# If cron jobs are missing, force a redeploy from CLI:
npm i -g vercel
vercel login
vercel --prod

# Or trigger from the dashboard:
# Vercel → Project → Deployments → ⋮ menu → Redeploy'''))

story.append(Paragraph('6.4 Manually trigger the audit-cleanup cron', H3))
story.append(Paragraph(
    'To confirm the CRON_SECRET is correctly configured, you can manually call the audit-cleanup '
    'endpoint. Replace the URL and secret with your actual values. The expected response is a JSON '
    'object with <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">ok: true</font> and a '
    'purged count:', BODY))
story.append(code_block('''# Replace YOUR_CRON_SECRET and YOUR_VERCEL_URL
curl -X GET \\
  -H "Authorization: Bearer YOUR_CRON_SECRET" \\
  https://YOUR_VERCEL_URL.vercel.app/api/cron/audit-cleanup

# Expected response (with 365-day retention, fresh install):
# {
#   "ok": true,
#   "retentionDays": 365,
#   "cutoff": "2025-07-21T...",
#   "purged": { "auditLogs": 0, "loginHistory": 0 }
# }'''))

story.append(PageBreak())

# ── Section 7: Post-Deployment Verification ──
story.append(Paragraph('7. Post-Deployment Verification', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'Run through this verification checklist after the Vercel deployment completes. Each item tests '
    'one v24 feature against the production URL. If any item fails, see Section 10 (Troubleshooting) '
    'before declaring the deployment complete. Do not skip any step — a partial deployment is worse '
    'than a rolled-back deployment because it creates a false sense of completion.', BODY))

verify_items = [
    ['Step', 'Action', 'Expected Result'],
    ['1', 'Sign in as super admin', 'Lands on the regular Dashboard view'],
    ['2', 'Open the sidebar', 'New SuperAdmin Control group appears at bottom with 6 items'],
    ['3', 'Click Platform Dashboard', '8 KPI cards (admins, users, loans, NPL, branches, sessions, audit, closed) render with non-zero counts'],
    ['4', 'Click System Health', 'DB status badge shows OK, latency < 500ms, version shows 0.24.0'],
    ['5', 'Click Feature Flags', 'If you ran the seed SQL, 5 flags appear. Otherwise empty state with New Flag button'],
    ['6', 'Toggle a feature flag', 'Switch flips, badge updates, audit log entry is created (check Audit Trail)'],
    ['7', 'Click Maintenance Mode', 'Toggle ON, save. Sign out, try to sign in as a regular staff → should see HTTP 503 with the maintenance message'],
    ['8', 'Sign back in as super admin, toggle maintenance mode OFF', 'Regular logins work again'],
    ['9', 'Click Active Sessions', 'Your current session appears in the table with IP and last-seen timestamp'],
    ['10', 'Click Audit Retention', 'Purge preview shows the cutoff date (today minus 365 days) and counts of records to purge'],
    ['11', 'Set retention to 365 days and click Save Policy', 'Success message appears, audit trail logs the policy update'],
    ['12', 'Check the audit trail (governance module)', 'See entries for feature_flag_toggle, maintenance_mode_toggle, audit_retention_update'],
    ['13', 'Open Vercel → Cron Jobs', '4 cron jobs listed including audit-cleanup at 02:00 UTC daily'],
]
t = Table(verify_items, colWidths=[12*mm, 70*mm, 88*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), HEAD_FONT),
    ('FONTNAME', (0, 1), (-1, -1), BODY_FONT),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('ALIGN', (0, 0), (0, -1), 'CENTER'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
]))
story.append(t)
story.append(Spacer(1, 8))

story.append(callout('SUCCESS',
    'If all 13 verification steps pass, v24 is fully deployed and operational. Send a release '
    'announcement to your team and update the internal changelog. The platform now has runtime '
    'feature toggles, maintenance mode, session management, and automated audit log retention — '
    'all controlled from the SuperAdmin Control sidebar without needing code changes.', color=SEM_SUCCESS))

story.append(PageBreak())

# ── Section 8: Environment Variables ──
story.append(Paragraph('8. Environment Variables Reference', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'The table below lists every environment variable required by v24. Variables marked as <b>(v24 new)</b> '
    'were introduced in this release. All others should already be set from the v23 deployment — do '
    'not change their values. Every variable below must be set in three places: the local <font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">.env</font> file, '
    'the Vercel project environment variables, and (if you use one) the Neon SQL Editor connection. '
    'Missing variables will cause runtime errors that are hard to debug because they only surface '
    'when the affected code path is exercised.', BODY))

env_data = [
    ['Variable', 'Required', 'Purpose', 'Example'],
    ['DATABASE_URL', 'Yes (v23)', 'Pooled Neon connection string — used by app at runtime', 'postgresql://user:pass@ep-pooled-xxx.neon.tech/db?sslmode=require'],
    ['DIRECT_URL', 'Yes (v23)', 'Direct Neon connection — used by prisma db push and migrations', 'postgresql://user:pass@ep-direct-xxx.neon.tech/db?sslmode=require'],
    ['JWT_SECRET', 'Yes (v23)', 'HMAC-SHA256 signing key for JWT tokens — MUST be the same as v23', 'any 32+ char random string'],
    ['CRON_SECRET', 'Yes (v24 new)', 'Bearer token required by /api/cron/* endpoints', '64-char hex string from `crypto.randomBytes(32).toString(\'hex\')`'],
    ['RESEND_API_KEY', 'Optional (v23)', 'Resend.com API key for transactional email', 're_xxxxxxxxxxxx'],
    ['NEXT_PUBLIC_RECAPTCHA_SITE_KEY', 'Optional (v23)', 'Google reCAPTCHA public site key for public forms', '6Lcxxxxxxxxxxxxxxxxxxx'],
    ['RECAPTCHA_SECRET_KEY', 'Optional (v23)', 'Google reCAPTCHA secret key for server-side verification', '6Lcxxxxxxxxxxxxxxxxxxx'],
    ['NEXT_PUBLIC_BASE_URL', 'Optional', 'Public base URL of the deployment — used in email links', 'https://watershed-capital.vercel.app'],
]
t = Table(env_data, colWidths=[48*mm, 22*mm, 60*mm, 40*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), HEAD_FONT),
    ('FONTNAME', (0, 1), (-1, -1), BODY_FONT),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
    ('FONTNAME', (0, 1), (0, -1), MONO_FONT),
    ('FONTSIZE', (0, 1), (0, -1), 7.5),
]))
story.append(t)
story.append(Spacer(1, 10))

story.append(Paragraph('8.1 How to set environment variables in Vercel', H3))
story.append(Paragraph(
    'For each variable: Vercel project → <b>Settings</b> → <b>Environment Variables</b> → <b>Add New</b>. '
    'Set the environment checkboxes to Production + Preview + Development (all three) for non-sensitive '
    'variables, and Production only for sensitive ones like JWT_SECRET and CRON_SECRET. After saving '
    'a new variable, you must redeploy for it to take effect — Vercel does not retroactively inject '
    'env vars into already-built deployments. Click <b>Deployments</b> → most recent → ⋮ menu → '
    '<b>Redeploy</b>.', BODY))

story.append(PageBreak())

# ── Section 9: Rollback ──
story.append(Paragraph('9. Rollback Procedure', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'If v24 causes a critical regression, you can roll back to v23 in under 5 minutes. The rollback '
    'procedure has two parts: rolling back the code in Vercel (instant, no rebuild needed) and '
    'rolling back the database schema in Neon (destructive — only do this if absolutely necessary). '
    'In most cases, only the code rollback is needed because the v24 schema changes are purely '
    'additive (three new tables, one new column) and the v23 code simply ignores them.', BODY))

story.append(Paragraph('9.1 Code-only rollback (recommended)', H3))
story.append(Paragraph(
    'Open Vercel → your project → <b>Deployments</b>. Find the most recent deployment with a green '
    '<i>Ready</i> status that was created BEFORE the v24 commit (it will have a v23-era commit hash). '
    'Click the ⋮ menu on that deployment and select <b>Promote to Production</b>. Vercel will '
    'instantly route all production traffic to that older build. No rebuild is required — Vercel '
    'keeps every deployment artifact for 90 days.', BODY))
story.append(code_block('''# Or via the Vercel CLI:
vercel ls                       # find the v23 deployment URL
vercel promote <deployment-url> --prod'''))

story.append(Paragraph('9.2 Database rollback (destructive, last resort)', H3))
story.append(Paragraph(
    'If you must also remove the v24 schema changes (for example, because the new tables are causing '
    'an unrelated Prisma query to fail), you can drop them. This will lose any data stored in those '
    'tables — feature flag settings, maintenance mode state, and active session records. Run the '
    'following SQL in the Neon SQL Editor:', BODY))
story.append(code_block('''-- Run in Neon SQL Editor
DROP TABLE IF EXISTS "ActiveSession" CASCADE;
DROP TABLE IF EXISTS "FeatureFlag";
DROP TABLE IF EXISTS "SystemSetting";

-- The Admin.activeSessions reverse relation is just a Prisma concept;
-- no column needs to be dropped from Admin.
'''))

story.append(callout('DANGER',
    'Rolling back the database is rarely necessary and is not recommended. The v24 schema is purely '
    'additive — no existing column was modified or removed. Even if you roll back to v23 code, the '
    'extra tables in the database will not cause any errors because Prisma only queries tables that '
    'are referenced in the schema. Leave the database alone unless you have a confirmed Prisma error '
    'directly caused by the new tables.', color=SEM_ERROR))

story.append(Paragraph('9.3 Re-applying v24 after rollback', H3))
story.append(Paragraph(
    'If you rolled back to investigate an issue and now want to re-apply v24: simply push another '
    'commit to main (or click <b>Redeploy</b> on the v24 deployment). Vercel will rebuild and '
    'promote automatically. If you also dropped the v24 tables from Neon, re-run '
    '<font face="' + MONO_FONT + '" color="' + ACCENT.hexval() + '">npx prisma db push</font> to recreate them.', BODY))

story.append(PageBreak())

# ── Section 10: Troubleshooting ──
story.append(Paragraph('10. Troubleshooting', H1))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=4, spaceAfter=10))

story.append(Paragraph(
    'The most common v24 deployment failures are listed below, ordered by likelihood. Each entry '
    'includes the symptom, the root cause, and the exact fix. Read the symptom carefully — many '
    'errors have similar messages but completely different causes. When in doubt, check the Vercel '
    'deployment logs first; they almost always contain the precise error message that points to '
    'the root cause.', BODY))

trouble_data = [
    ['Symptom', 'Root Cause', 'Fix'],
    ['Vercel build fails with "Environment variable CRON_SECRET not set"',
     'CRON_SECRET was not added to Vercel env vars before the build ran',
     'Vercel → Settings → Env Variables → Add CRON_SECRET → Redeploy'],
    ['Clicking SuperAdmin menu items shows HTTP 500',
     'Neon database has not received the v24 schema push yet',
     'Run `npx prisma db push` locally with DIRECT_URL set; verify with SELECT in Neon SQL Editor'],
    ['prisma db push fails with "prepared statement s1 already exists"',
     'You are using DATABASE_URL (pooled) instead of DIRECT_URL for the push',
     'Set DIRECT_URL in .env to the direct (non-pooled) Neon connection string'],
    ['Feature flags page shows "0 / 0 enabled" forever',
     'FeatureFlag table is empty — no flags were seeded',
     'Either insert rows via SQL (see §5.4) or click "New Flag" in the UI to create one'],
    ['Maintenance mode toggle does not block logins',
     'The /api/auth/login route was not updated, OR the SystemSetting row was not created',
     'Check Neon: SELECT * FROM "SystemSetting" WHERE key = \'maintenance_mode\'; — should return 1 row with value=\'true\''],
    ['Active sessions list is always empty',
     'The ActiveSession table is not being written to on login (this is expected in v24.0)',
     'v24.0 introduces the table and UI but does not yet write sessions on login. That is planned for v24.1. The UI is functional — it just shows empty state until sessions are populated.'],
    ['Audit cleanup cron returns HTTP 401',
     'CRON_SECRET in the Authorization header does not match the env var',
     'Regenerate CRON_SECRET, set it in Vercel env vars, redeploy, and update your curl command with the new value'],
    ['Vercel cron jobs page shows only 3 jobs',
     'vercel.json was not committed in the push, OR the deployment was triggered before vercel.json was saved',
     'Confirm vercel.json is in the repo root and was committed; force a redeploy'],
    ['npx tsx scripts/seed.ts fails with ETARGET error',
     'Cached tsx version is not available on npm registry',
     'Install tsx directly: `npm install -g tsx` then run `tsx scripts/seed.ts`'],
    ['npm run dev fails on Windows with "tee is not recognized"',
     'You are running an older v23 dev script that still pipes through tee',
     'Pull the latest code: `git pull origin main` — v24 removes the tee pipe'],
    ['SuperAdmin Control group does not appear in sidebar',
     'You are not signed in as the super admin (role === \'super\')',
     'Sign out, sign back in as the super admin user. Confirm with `SELECT role FROM "Admin" WHERE username = \'your-username\';` in Neon'],
]
t = Table(trouble_data, colWidths=[55*mm, 55*mm, 60*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), HEAD_FONT),
    ('FONTNAME', (0, 1), (-1, -1), BODY_FONT),
    ('FONTSIZE', (0, 0), (-1, -1), 7.5),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
]))
story.append(t)
story.append(Spacer(1, 12))

story.append(Paragraph('10.1 Where to look for logs', H3))
story.append(Paragraph(
    'When debugging v24 issues, check these log sources in order: (1) Browser DevTools console — '
    'for client-side errors (missing imports, undefined state, API 4xx/5xx responses). (2) Browser '
    'Network tab — for failed API calls and the exact response body. (3) Vercel deployment logs — '
    'Vercel → Project → Deployments → most recent → <b>Logs</b> tab. (4) Vercel runtime logs — '
    'same place but switch to the <b>Functions</b> sub-tab to see server-side errors after the '
    'deployment is built. (5) Neon SQL Editor — run SELECT queries to inspect table contents '
    'directly. (6) The terminal where you ran `npm run dev` — for local reproduction.', BODY))

story.append(Paragraph(
    'Most v24 issues fall into one of three categories: missing env vars (CRON_SECRET), missing '
    'schema (forgot prisma db push), or missing role (signed in as a non-super admin). Always '
    'check these three first before deeper debugging.', BODY))

# ━━ Build ━━
doc = SimpleDocTemplate(
    OUT_PATH,
    pagesize=A4,
    leftMargin=20*mm,
    rightMargin=20*mm,
    topMargin=20*mm,
    bottomMargin=20*mm,
    title='Watershed Capital v24 Deployment Runbook',
    author='Watershed Engineering',
    subject='Step-by-step deployment guide for v24',
    creator='Watershed Capital',
)

doc.build(story, onFirstPage=first_page, onLaterPages=header_footer)
print(f'Generated: {OUT_PATH}')
print(f'Size: {os.path.getsize(OUT_PATH):,} bytes')
