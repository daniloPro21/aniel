# Génère le modèle Excel d'import des invités (sans dépendance : XML SpreadsheetML zippé)
import sys, zipfile
from xml.sax.saxutils import escape

OUT = sys.argv[1]
ROWS = 500  # = IMPORT_MAX côté API
HEAD = ['Nom', 'Prénom', 'Téléphone', 'Nombre de personnes', 'Statut', 'Billet physique']
WIDTHS = [22, 22, 20, 22, 18, 18]

def cell(ref, text, style=0):
    return f'<c r="{ref}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{escape(text)}</t></is></c>'

cols = 'ABCDEF'
head = ''.join(cell(f'{cols[i]}1', h, 1) for i, h in enumerate(HEAD))
widths = ''.join(f'<col min="{i+1}" max="{i+1}" width="{w}" customWidth="1"{" style=\"2\"" if i == 2 else ""}/>' for i, w in enumerate(WIDTHS))
def dv(rng, items, title, msg):
    return (f'<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" '
            f'errorTitle="Valeur non reconnue" error="Choisissez une valeur dans la liste." '
            f'promptTitle="{escape(title)}" prompt="{escape(msg)}" sqref="{rng}"><formula1>"{escape(",".join(items))}"</formula1></dataValidation>')
validations = (dv(f'D2:D{ROWS+1}', ['1', '2'], 'Nombre de personnes', '1 = seul(e), 2 = en couple (vide = 1)')
             + dv(f'E2:E{ROWS+1}', ['À confirmer', 'Confirmé', 'Absent'], 'Statut', 'Vide = À confirmer : l’invité confirmera sur le site')
             + dv(f'F2:F{ROWS+1}', ['Oui', 'Non'], 'Billet physique', 'Oui si un billet papier a été remis (vide = Non)'))
sheet1 = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>{widths}</cols>
<sheetData><row r="1" ht="26" customHeight="1">{head}</row></sheetData>
<autoFilter ref="A1:F1"/>
<dataValidations count="3">{validations}</dataValidations>
</worksheet>'''

guide = [
    ('Importer vos invités — mode d’emploi', 3),
    ('', 0),
    ('1. Remplissez l’onglet « Invités » : une ligne par invitation (un couple = une seule ligne).', 4),
    ('2. Dans l’admin du site : « Importer un Excel », puis déposez ce fichier.', 4),
    ('3. Vérifiez l’aperçu : les lignes en rouge sont ignorées, corrigez-les puis réimportez.', 4),
    ('', 0),
    ('Colonnes', 3),
    ('Nom — obligatoire.', 4),
    ('Prénom — obligatoire. Un couple : le prénom de la personne invitée (ex. Jean). Le message WhatsApp dira « Bonjour M. & Mme Nom ».', 4),
    ('Téléphone — facultatif, pour l’envoi WhatsApp : 6XX XX XX XX (Cameroun) ou avec l’indicatif, ex. +33 6 12 34 56 78.', 4),
    ('Nombre de personnes — 1 (seul·e) ou 2 (couple). Vide = 1.', 4),
    ('Statut — À confirmer (conseillé : l’invité confirme lui-même sur le site), Confirmé ou Absent. Vide = À confirmer.', 4),
    ('Billet physique — Oui si un billet papier a été remis en main propre, sinon Non. Vide = Non.', 4),
    ('', 0),
    ('Bon à savoir', 3),
    ('• Ne modifiez pas la première ligne (les titres des colonnes).', 4),
    ('• Un invité déjà présent dans la liste (même prénom et nom) est ignoré : pas de doublon.', 4),
    ('• 500 lignes au maximum par import. Les codes AD-XXXXXX et QR codes sont créés automatiquement.', 4),
    ('• Les tables se choisissent ensuite dans l’admin (onglet « Tables »).', 4),
    ('', 0),
    ('Exemples (ne pas recopier tels quels)', 3),
]
rows2 = ''.join(f'<row r="{i+1}">{cell(f"A{i+1}", t, s) if t else ""}</row>' for i, (t, s) in enumerate(guide))
ex = [HEAD, ['Mfonzie', 'Jean', '699112233', '2', 'À confirmer', 'Non'], ['Ndam', 'Awa', '+33 6 12 34 56 78', '1', 'Confirmé', 'Oui'], ['Manga', 'Paul', '', '1', '', '']]
r0 = len(guide) + 1
for j, line in enumerate(ex):
    rows2 += f'<row r="{r0+j}">' + ''.join(cell(f'{cols[k]}{r0+j}', v, 1 if j == 0 else 5) for k, v in enumerate(line) if v) + '</row>'
sheet2 = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetFormatPr defaultRowHeight="18"/>
<cols>{widths.replace(' style="2"', '')}</cols>
<sheetData>{rows2}</sheetData>
</worksheet>'''

styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFF3DFA8"/><name val="Calibri"/></font><font><b/><sz val="13"/><color rgb="FF0A3024"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A3024"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="49" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''

workbook = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Invités" sheetId="1" r:id="rId1"/><sheet name="Mode d’emploi" sheetId="2" r:id="rId2"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Invités'!$A$1:$F$1</definedName></definedNames>
</workbook>'''
wb_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''
rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''
ctypes = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>'''
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, data in [('[Content_Types].xml', ctypes), ('_rels/.rels', rels), ('xl/workbook.xml', workbook),
                       ('xl/_rels/workbook.xml.rels', wb_rels), ('xl/styles.xml', styles),
                       ('xl/worksheets/sheet1.xml', sheet1), ('xl/worksheets/sheet2.xml', sheet2)]:
        z.writestr(name, data)
print('écrit :', OUT)
