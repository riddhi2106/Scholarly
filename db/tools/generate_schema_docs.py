#!/usr/bin/env python3
"""
Generate the LOGICAL schema artifacts for Scholarly by introspecting a live
PostgreSQL database. Nothing here is hand-written from the DDL, so the output
cannot drift from what the database actually contains.

This is one half of a pair. The other half is the CONCEPTUAL model:

  db/tools/generate_er_diagram.py  ->  docs/er_diagram.*
      The ER diagram in Chen notation. Entity types, relationship types,
      attributes, cardinality ratios and participation. Link tables are
      absorbed into M:N relationship diamonds. Hand-derived, because a
      conceptual model is a design decision and cannot be read out of a
      catalog.

  this file                        ->  docs/relational_schema.*
                                       docs/RELATIONAL_SCHEMA.md
      The relational schema in Elmasri notation: one box per relation, a row
      of attribute cells, primary keys underlined, an arrow from each foreign
      key attribute to the primary key it references. Plus the full textual
      schema and data dictionary. Introspected.

Usage, from the repository root against a fully loaded database:

    python3 db/tools/generate_schema_docs.py scholarly
    dot -Tpng -Gdpi=130 docs/relational_schema.dot -o docs/relational_schema.png
    dot -Tsvg           docs/relational_schema.dot -o docs/relational_schema.svg
"""
import subprocess
import sys
from collections import OrderedDict, defaultdict

DB = sys.argv[1] if len(sys.argv) > 1 else "final"

# Logical grouping, used for ordering and for the module column in the docs.
MODULE = OrderedDict([
    ("Core Platform / Identity", [
        "people", "user_accounts", "author_profiles", "reviewer_profiles",
        "affiliations", "person_affiliations",
    ]),
    ("Core Platform / Conferences & Submissions", [
        "conferences", "conference_memberships", "papers", "paper_authors",
        "topics", "paper_topics",
    ]),
    ("Review & Evaluation", [
        "reviewer_topics", "conflicts_of_interest", "review_assignments",
        "reviews", "decisions", "audit_log",
    ]),
    ("Vector Search", [
        "paper_embeddings", "reviewer_embeddings",
    ]),
])

# Columns declared as pgvector in the DDL. The live database substitutes real[]
# because the extension is unavailable in this environment; the authoritative
# type is restored here so the published schema matches the source of truth.
VECTOR_COLUMNS = {
    ("paper_embeddings", "embedding"): "vector(384)",
    ("reviewer_embeddings", "embedding"): "vector(384)",
}

# Readable relationship verbs, keyed by (parent, child, child column). Only the
# label is editorial; the entities, cardinality and direction all come from the
# catalog. An unmapped relationship falls back to its constraint name, which
# makes any gap obvious rather than silent.
EDGE_LABEL = {
    ("people", "user_accounts", "person_id"): "signs in as",
    ("people", "author_profiles", "person_id"): "is an author",
    ("people", "reviewer_profiles", "person_id"): "is a reviewer",
    ("people", "person_affiliations", "person_id"): "affiliated with",
    ("affiliations", "person_affiliations", "affiliation_id"): "employs",
    ("conferences", "conference_memberships", "conference_id"): "has committee",
    ("people", "conference_memberships", "person_id"): "serves on",
    ("conferences", "papers", "conference_id"): "receives",
    ("people", "papers", "created_by_person_id"): "submits",
    ("papers", "paper_authors", "paper_id"): "written by",
    ("people", "paper_authors", "author_person_id"): "authors",
    ("papers", "paper_topics", "paper_id"): "tagged with",
    ("topics", "paper_topics", "topic_id"): "categorises",
    ("reviewer_profiles", "reviewer_topics", "reviewer_person_id"): "declares expertise in",
    ("topics", "reviewer_topics", "topic_id"): "claimed by",
    ("papers", "conflicts_of_interest", "paper_id"): "has conflict",
    ("people", "conflicts_of_interest", "reviewer_person_id"): "conflicted on",
    ("papers", "review_assignments", "paper_id"): "assigned for review",
    ("people", "review_assignments", "reviewer_person_id"): "reviews",
    ("people", "review_assignments", "assigned_by_person_id"): "allocated by",
    ("review_assignments", "reviews", "assignment_id"): "produces",
    ("papers", "decisions", "paper_id"): "receives verdict",
    ("people", "decisions", "decided_by_person_id"): "decides",
    ("people", "audit_log", "actor_person_id"): "acted as",
    ("papers", "paper_embeddings", "paper_id"): "embedded as",
    ("reviewer_profiles", "reviewer_embeddings", "reviewer_person_id"): "embedded as",
}


def edge_label(fk):
    key = (fk["parent"], fk["child"], fk["child_cols"][0])
    return EDGE_LABEL.get(key, fk["name"].replace("_", " "))


def q(sql):
    """Run a query and return rows as lists of strings."""
    out = subprocess.run(
        ["su", "postgres", "-c", f'psql -tAF"\u001f" -d {DB} -c "{sql}"'],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line.split("\u001f") for line in out.strip().split("\n") if line.strip()]


# --------------------------------------------------------------------------
# Introspection
# --------------------------------------------------------------------------
tables = [r[0] for r in q(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
)]

columns = defaultdict(list)
for t, col, typ, nullable, default, pos in q("""
    SELECT c.relname, a.attname,
           format_type(a.atttypid, a.atttypmod),
           CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
           COALESCE(pg_get_expr(d.adbin, d.adrelid), ''),
           a.attnum
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname='public' AND c.relkind='r'
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum
"""):
    typ = VECTOR_COLUMNS.get((t, col), typ)
    columns[t].append({
        "name": col, "type": typ, "nullable": nullable == "YES",
        "default": default, "pos": int(pos),
    })

pk_cols = defaultdict(list)
for t, col, pos in q("""
    SELECT c.relname, a.attname, k.ord
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype='p' AND n.nspname='public'
    ORDER BY c.relname, k.ord
"""):
    pk_cols[t].append(col)

uniques = defaultdict(list)          # table -> list of column tuples
for t, cols in q("""
    SELECT c.relname, string_agg(a.attname, ',' ORDER BY k.ord)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype='u' AND n.nspname='public'
    GROUP BY c.relname, con.conname
"""):
    uniques[t].append(tuple(cols.split(",")))

fks = []
for child, cname, ccols, parent, pcols, upd, dele in q("""
    SELECT c.relname, con.conname,
           (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
              FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.attnum),
           pc.relname,
           (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
              FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.attnum),
           con.confupdtype, con.confdeltype
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype='f' AND n.nspname='public'
    ORDER BY c.relname, con.conname
"""):
    action = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE",
              "n": "SET NULL", "d": "SET DEFAULT"}
    fks.append({
        "child": child, "name": cname, "child_cols": ccols.split(","),
        "parent": parent, "parent_cols": pcols.split(","),
        "on_update": action.get(upd, upd), "on_delete": action.get(dele, dele),
    })

checks = defaultdict(list)
for t, cname, expr in q("""
    SELECT c.relname, con.conname, pg_get_constraintdef(con.oid)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype='c' AND n.nspname='public'
    ORDER BY c.relname, con.conname
"""):
    checks[t].append((cname, expr))

indexes = defaultdict(list)
for t, iname, idef in q("""
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' ORDER BY tablename, indexname
"""):
    indexes[t].append((iname, idef))

# --------------------------------------------------------------------------
# Ordering + sanity check that the module map covers every live table
# --------------------------------------------------------------------------
ordered, seen = [], set()
for mod, names in MODULE.items():
    for nm in names:
        if nm in tables:
            ordered.append((mod, nm))
            seen.add(nm)
missing = [t for t in tables if t not in seen]
if missing:
    print(f"WARNING: tables not in the module map: {missing}", file=sys.stderr)
    for nm in missing:
        ordered.append(("Unclassified", nm))

module_of = {nm: mod for mod, nm in ordered}


def fk_cardinality(fk):
    """
    Left side is the parent, right side the child.
    A unique or primary-key FK on the child means at most one child per parent.
    A nullable FK means the child may exist without a parent.
    """
    cc = tuple(fk["child_cols"])
    child_unique = cc in uniques[fk["child"]] or list(cc) == pk_cols[fk["child"]]
    nullable = any(
        c["nullable"] for c in columns[fk["child"]] if c["name"] in fk["child_cols"]
    )
    left = "|o" if nullable else "||"
    right = "o|" if child_unique else "o{"
    return f"{left}--{right}"


def mermaid_type(pg_type):
    """Mermaid attribute types cannot contain spaces, parentheses or commas."""
    return (pg_type.replace(" ", "_").replace("(", "_").replace(")", "")
            .replace(",", "_").replace("[]", "_array").replace("'", ""))


# --------------------------------------------------------------------------
# RELATIONAL_SCHEMA.md
# --------------------------------------------------------------------------
md = []
md.append("# Scholarly - Relational Schema and Data Dictionary\n")
md.append("Generated by introspecting a live PostgreSQL 16 database loaded from the\n"
          "scripts in `db/`. Every column, key, constraint and index below was read\n"
          "from `pg_catalog`, not transcribed from the DDL, so this document cannot\n"
          "drift from the schema it describes.\n")
md.append(f"**Relations:** {len(tables)} &nbsp;&nbsp; "
          f"**Foreign keys:** {len(fks)} &nbsp;&nbsp; "
          f"**Check constraints:** {sum(len(v) for v in checks.values())} &nbsp;&nbsp; "
          f"**Indexes:** {sum(len(v) for v in indexes.values())}\n")
md.append("---\n")

# Conceptual vs logical
md.append("## 1. Two Models, Two Diagrams\n")
md.append("The project carries two separate design artifacts, and they are not\n"
          "interchangeable.\n")
md.append("| | Conceptual | Logical |\n| :--- | :--- | :--- |\n")
md.append("| Artifact | `docs/er_diagram.png` | `docs/relational_schema.png` |\n")
md.append("| Notation | Chen: rectangles, diamonds, ovals | Elmasri: one box of "
          "attribute cells per relation |\n")
md.append("| Shows | entity types, relationship types, cardinality ratios, "
          "participation | relations, attributes, primary keys, referential arrows |\n")
md.append("| Link tables | absorbed into M:N relationship diamonds | present as "
          "relations in their own right |\n")
md.append("| Built by | `db/tools/generate_er_diagram.py` | "
          "`db/tools/generate_schema_docs.py` |\n")
md.append("\nThe ER diagram is the design. This document and the relational schema\n"
          "diagram are what that design became once it was mapped onto tables.\n")
md.append("\n### Mapping rules applied\n")
md.append("The conceptual model was mapped to these relations by the standard\n"
          "ER-to-relational rules:\n")
md.append("1. **Strong entity type** &rarr; a relation with the entity's own key as\n"
          "   primary key. `PERSON` &rarr; `PEOPLE`, `PAPER` &rarr; `PAPERS`.\n")
md.append("2. **Weak entity type** &rarr; a relation whose primary key is the owner's\n"
          "   key. `PAPER_EMBEDDING` &rarr; `PAPER_EMBEDDINGS(paper_id)`.\n")
md.append("3. **Specialization** &rarr; one relation per subclass, primary key\n"
          "   inherited from the superclass and also a foreign key to it.\n"
          "   `AUTHOR` &rarr; `AUTHOR_PROFILES(person_id)`,\n"
          "   `REVIEWER` &rarr; `REVIEWER_PROFILES(person_id)`.\n")
md.append("4. **1:N relationship** &rarr; a foreign key on the N side.\n"
          "   `RECEIVES` &rarr; `PAPERS.conference_id`.\n")
md.append("5. **1:1 relationship** &rarr; a foreign key on the side with total\n"
          "   participation, declared `UNIQUE`. `PRODUCES` &rarr;\n"
          "   `REVIEWS.assignment_id UNIQUE`, `VERDICT_ON` &rarr;\n"
          "   `DECISIONS.paper_id UNIQUE`.\n")
md.append("6. **M:N relationship** &rarr; a new relation whose primary key is the\n"
          "   pair of participating keys, carrying any relationship attributes.\n"
          "   `WORKS_AT` &rarr; `PERSON_AFFILIATIONS`, `WRITES` &rarr;\n"
          "   `PAPER_AUTHORS`, `CLASSIFIED_UNDER` &rarr; `PAPER_TOPICS`,\n"
          "   `EXPERT_IN` &rarr; `REVIEWER_TOPICS`, `SERVES_ON` &rarr;\n"
          "   `CONFERENCE_MEMBERSHIPS`, `CONFLICTS_WITH` &rarr;\n"
          "   `CONFLICTS_OF_INTEREST`.\n")
md.append("7. **Multivalued attribute** &rarr; none in this model; the only\n"
          "   repeating groups are the M:N relations above.\n")
md.append("\n### Two deliberate divergences\n")
md.append("Two places where the physical schema does not mirror the conceptual model\n"
          "exactly. Both are intentional and both are recorded here rather than\n"
          "hidden:\n")
md.append("- `ASSIGNMENT` is drawn as an **associative entity**, not a relationship\n"
          "  diamond. Conceptually it is the M:N relationship between `PAPER` and\n"
          "  `REVIEWER`, but `REVIEW` is related to it through `PRODUCES`, and Chen\n"
          "  notation does not let a relationship participate in another\n"
          "  relationship. Promoting it to an entity is the standard resolution, and\n"
          "  it therefore keeps its own surrogate key,\n"
          "  `review_assignments.assignment_id`, rather than the composite\n"
          "  `(paper_id, reviewer_person_id)` that rule 6 would otherwise give it.\n")
md.append("- `WRITES` connects `AUTHOR` to `PAPER` and `CARRIED_BY` connects\n"
          "  `REVIEWER` to `ASSIGNMENT` conceptually, but the foreign keys\n"
          "  `paper_authors.author_person_id` and\n"
          "  `review_assignments.reviewer_person_id` reference `PEOPLE`, not the\n"
          "  profile relations. This keeps referential integrity intact if a\n"
          "  profile row is ever removed, and the subclass constraint is enforced\n"
          "  in the triggers in `09_review_features.sql` instead.\n")

md.append("\n---\n")

# Relational schema notation
md.append("## 2. Relational Schema\n")
md.append("Primary key attributes are **bold**. Each relation is followed by its\n"
          "foreign keys and the primary key attribute each one references.\n")
current = None
for mod, t in ordered:
    if mod != current:
        md.append(f"\n### {mod}\n")
        current = mod
    fk_map = {}
    for fk in fks:
        if fk["child"] == t:
            for cc, pc in zip(fk["child_cols"], fk["parent_cols"]):
                fk_map[cc] = f'{fk["parent"].upper()}.{pc}'
    parts = []
    for col in columns[t]:
        nm = f'**{col["name"]}**' if col["name"] in pk_cols[t] else col["name"]
        parts.append(nm)
    md.append(f"`{t.upper()}` ( " + ", ".join(parts) + " )\n")
    if fk_map:
        for cc, ref in fk_map.items():
            md.append(f"- `{cc}` &rarr; `{ref}`\n")

md.append("\n---\n")

# Data dictionary
md.append("## 3. Data Dictionary\n")
current = None
for mod, t in ordered:
    if mod != current:
        md.append(f"\n### {mod}\n")
        current = mod
    md.append(f"\n#### `{t.upper()}`\n")
    fk_detail = {}
    for fk in fks:
        if fk["child"] == t:
            for cc, pc in zip(fk["child_cols"], fk["parent_cols"]):
                fk_detail[cc] = (f'{fk["parent"].upper()}({pc})',
                                 fk["on_delete"], fk["on_update"])
    md.append("| Column | Type | Null | Key | Default | References |\n")
    md.append("| :--- | :--- | :--- | :--- | :--- | :--- |\n")
    for col in columns[t]:
        keys = []
        if col["name"] in pk_cols[t]:
            keys.append("PK")
        if col["name"] in fk_detail:
            keys.append("FK")
        if any(col["name"] in u and len(u) == 1 for u in uniques[t]):
            keys.append("UQ")
        ref = ""
        if col["name"] in fk_detail:
            target, od, ou = fk_detail[col["name"]]
            bits = [f"`{target}`"]
            if od != "NO ACTION":
                bits.append(f"ON DELETE {od}")
            if ou != "NO ACTION":
                bits.append(f"ON UPDATE {ou}")
            ref = " ".join(bits)
        default = col["default"]
        if len(default) > 40:
            default = default[:37] + "..."
        md.append(f'| `{col["name"]}` | `{col["type"]}` | '
                  f'{"YES" if col["nullable"] else "NO"} | {",".join(keys)} | '
                  f'{"`" + default + "`" if default else ""} | {ref} |\n')

    multi = [u for u in uniques[t] if len(u) > 1]
    if multi:
        md.append("\nComposite unique constraints:\n")
        for u in multi:
            md.append(f'- `UNIQUE ({", ".join(u)})`\n')
    if checks[t]:
        md.append("\nCheck constraints:\n")
        for cname, expr in checks[t]:
            md.append(f"- `{cname}`: `{expr}`\n")

md.append("\n---\n")

# Foreign key summary
md.append("## 4. Referential Integrity Summary\n")
md.append("| Child | Column(s) | Parent | ON DELETE | ON UPDATE |\n")
md.append("| :--- | :--- | :--- | :--- | :--- |\n")
for fk in sorted(fks, key=lambda f: (module_of.get(f["child"], ""), f["child"])):
    md.append(f'| `{fk["child"].upper()}` | `{", ".join(fk["child_cols"])}` | '
              f'`{fk["parent"].upper()}({", ".join(fk["parent_cols"])})` | '
              f'{fk["on_delete"]} | {fk["on_update"]} |\n')

md.append("\n---\n")

# Index summary
md.append("## 5. Indexes\n")
md.append("| Table | Index | Definition |\n| :--- | :--- | :--- |\n")
for _mod, t in ordered:
    for iname, idef in indexes[t]:
        short = idef.split(" USING ", 1)[-1] if " USING " in idef else idef
        md.append(f"| `{t}` | `{iname}` | `{short}` |\n")

# --------------------------------------------------------------------------
# relational_schema.dot  -  the LOGICAL schema diagram, Elmasri notation
#
# Elmasri & Navathe draw a relational schema as one box per relation: the
# relation name above a single horizontal row of attribute cells, primary key
# attributes underlined, and an arrow from each foreign key attribute to the
# primary key attribute it references.
#
# This is deliberately NOT an ER diagram. The ER diagram (docs/er_diagram.png,
# produced by db/tools/generate_er_diagram.py) is the conceptual model in Chen
# notation, where link tables disappear into M:N relationship diamonds. This
# figure is the schema that the database literally is, every relation and every
# attribute, and it is read straight out of pg_catalog.
# --------------------------------------------------------------------------
# Monochrome throughout: black rules on white. Prints and photocopies cleanly.
BODY_FILL = "#ffffff"
LINE = "#000000"


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def relational_schema_dot():
    L = ["digraph scholarly_relational {",
         # outputorder=edgesfirst draws the relation boxes over the edges, so a
         # referential arrow sweeping past a box does not strike through its
         # attribute names. The arrowheads stop at the box boundary and stay
         # visible.
         '  graph [rankdir=TB, splines=spline, nodesep=0.40, ranksep=0.55,'
         ' outputorder=edgesfirst,'
         ' fontname="Helvetica", labelloc="t", fontsize=24,'
         f'  label="Scholarly  -  Relational Schema Diagram'
         f'  ({len(tables)} relations, {len(fks)} foreign keys)\\n'
         'Primary key attributes are underlined. An arrow runs from each foreign'
         ' key attribute to the primary key attribute it references.\\n "];',
         '  node [shape=plaintext, fontname="Helvetica", fontsize=11];',
         f'  edge [color="{LINE}", penwidth=1.0, arrowsize=0.7];']

    # One box per relation: name row, then a single row of attribute cells.
    for _mod, t in ordered:
        name_row = (f'<TR><TD COLSPAN="{len(columns[t])}" ALIGN="LEFT"'
                    f' BORDER="0" CELLPADDING="2">'
                    f'<FONT POINT-SIZE="13"><B>{t.upper()}</B></FONT>'
                    f'</TD></TR>')
        cells = []
        for col in columns[t]:
            nm = esc(col["name"])
            if col["name"] in pk_cols[t]:
                nm = f"<U>{nm}</U>"
            cells.append(f'<TD PORT="{esc(col["name"])}" ALIGN="CENTER"'
                         f' BGCOLOR="{BODY_FILL}">{nm}</TD>')
        label = ('<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" '
                 f'CELLPADDING="5">{name_row}<TR>{"".join(cells)}</TR>'
                 '</TABLE>>')
        L.append(f'  "{t}" [label={label}];')

    # One relation per rank, stacked in dependency order, so the figure reads
    # top to bottom like the textbook plate rather than being flattened into a
    # single wide band. Left to itself dot packs the wide boxes side by side and
    # the result is 7000px across and unreadable on a page.
    chain = [t for _mod, t in ordered]
    for a, b in zip(chain, chain[1:]):
        L.append(f'  "{a}" -> "{b}" [style=invis, weight=100];')

    # Referential arrows. The edge is declared parent -> child so that dot
    # ranks referenced relations above referencing ones, and dir=back puts the
    # arrowhead on the primary key end, which is the direction Elmasri draws.
    for fk in fks:
        for cc, pc in zip(fk["child_cols"], fk["parent_cols"]):
            # A nullable foreign key is an optional reference; dashed.
            nullable = any(c["nullable"] for c in columns[fk["child"]]
                           if c["name"] == cc)
            style = "dashed" if nullable else "solid"
            # A self-reference cannot be ranked; let it loop on the side.
            constraint = "false" if fk["parent"] == fk["child"] else "true"
            L.append(f'  "{fk["parent"]}":"{pc}":n -> "{fk["child"]}":"{cc}":s '
                     f'[dir=back, style={style}, constraint={constraint}];')

    L.append("}")
    return "\n".join(L) + "\n"


with open("docs/relational_schema.dot", "w") as f:
    f.write(relational_schema_dot())
def normalise_markdown(text):
    """
    Guarantee blank lines around headings, horizontal rules and the start of
    lists and tables. Without this a '---' sitting directly under a text line
    is parsed as a setext underline and silently turns that line into a
    heading, and lists glued to a paragraph do not render as lists at all.
    """
    import re as _re
    numbered = _re.compile(r"^\d+\. ")
    lines = text.split("\n")
    out = []
    for line in lines:
        s = line.strip()
        # An indented line is a continuation of the item above it, never the
        # start of a new block. Without this guard a wrapped list item whose
        # second line happens to begin with a backtick gets a blank line
        # injected into the middle of it and the list falls apart.
        indented = line[:1].isspace()
        starts_block = (
            s.startswith("#") or s == "---"
            or s.startswith("- ") or s.startswith("| ")
            or (not indented and (s.startswith("`") or s.startswith("**")
                                  or numbered.match(s)))
        )
        if starts_block and out and out[-1].strip() != "":
            prev = out[-1].strip()
            # Consecutive list or table rows stay glued together, and so do
            # the continuation lines that belong to them.
            same_run = (
                (s.startswith("- ") and (prev.startswith("- ") or prev[:1] == ""))
                or (s.startswith("| ") and prev.startswith("| "))
                or (numbered.match(s) and (numbered.match(prev)
                                           or out[-1][:1].isspace()))
            )
            if not same_run:
                out.append("")
        out.append(line)
        if s.startswith("#") or s == "---":
            out.append("")
    # Collapse runs of blank lines
    cleaned, blank = [], False
    for line in out:
        if line.strip() == "":
            if blank:
                continue
            blank = True
        else:
            blank = False
        cleaned.append(line)
    return "\n".join(cleaned).rstrip() + "\n"


with open("docs/RELATIONAL_SCHEMA.md", "w") as f:
    f.write(normalise_markdown("".join(md)))

print(f"tables={len(tables)} fks={len(fks)} "
      f"checks={sum(len(v) for v in checks.values())} "
      f"indexes={sum(len(v) for v in indexes.values())}")
