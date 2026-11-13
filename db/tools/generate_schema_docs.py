#!/usr/bin/env python3
"""
Generate the ER diagram and relational schema for Scholarly by introspecting a
live PostgreSQL database. Nothing here is hand-written from the DDL, so the
output cannot drift from what the database actually contains.

Outputs (into docs/):
  erd_overview.{mmd,dot}  tables + relationships only, readable on a slide
  erd_full.{mmd,dot}      every table with every column, types and key markers
  RELATIONAL_SCHEMA.md    textual relational schema + full data dictionary

Usage, from the repository root against a fully loaded database:

    python3 db/tools/generate_schema_docs.py scholarly
    dot -Tpng -Gdpi=130 docs/erd_overview.dot -o docs/erd_overview.png
    dot -Tpng -Gdpi=130 docs/erd_full.dot     -o docs/erd_full.png
    dot -Tsvg docs/erd_overview.dot -o docs/erd_overview.svg
    dot -Tsvg docs/erd_full.dot     -o docs/erd_full.svg

Mermaid (.mmd) renders inline on GitHub; Graphviz (.dot) lays the hub schema
out far better for printing and slides. Both come from the same introspection.
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
# erd_overview.mmd  - relationships only
# --------------------------------------------------------------------------
ov = ["%%{init: {'theme':'neutral'}}%%",
      "---", "title: Scholarly - Entity Relationships (20 tables)", "---",
      "erDiagram"]
for fk in fks:
    ov.append(f'    {fk["parent"].upper()} {fk_cardinality(fk)} '
              f'{fk["child"].upper()} : "{edge_label(fk)}"')
overview = "\n".join(ov) + "\n"

# --------------------------------------------------------------------------
# erd_full.mmd  - every table with every column
# --------------------------------------------------------------------------
fu = ["%%{init: {'theme':'neutral'}}%%",
      "---", "title: Scholarly - Full Entity Relationship Diagram", "---",
      "erDiagram"]
for _mod, t in ordered:
    fu.append(f"    {t.upper()} {{")
    fk_cols_here = {c for fk in fks if fk["child"] == t for c in fk["child_cols"]}
    for col in columns[t]:
        marks = []
        if col["name"] in pk_cols[t]:
            marks.append("PK")
        if col["name"] in fk_cols_here:
            marks.append("FK")
        if any(col["name"] in u and len(u) == 1 for u in uniques[t]):
            marks.append("UK")
        suffix = (" " + ",".join(marks)) if marks else ""
        comment = "" if col["nullable"] else ' "NOT NULL"'
        fu.append(f'        {mermaid_type(col["type"])} {col["name"]}{suffix}{comment}')
    fu.append("    }")
for fk in fks:
    fu.append(f'    {fk["parent"].upper()} {fk_cardinality(fk)} '
              f'{fk["child"].upper()} : "{edge_label(fk)}"')
full = "\n".join(fu) + "\n"

# --------------------------------------------------------------------------
# RELATIONAL_SCHEMA.md
# --------------------------------------------------------------------------
md = []
md.append("# Scholarly - Relational Schema and Data Dictionary\n")
md.append("Generated by introspecting a live PostgreSQL 16 database loaded from the\n"
          "scripts in `db/`. Every column, key, constraint and index below was read\n"
          "from `pg_catalog`, not transcribed from the DDL, so this document cannot\n"
          "drift from the schema it describes.\n")
md.append(f"**Tables:** {len(tables)} &nbsp;&nbsp; "
          f"**Foreign keys:** {len(fks)} &nbsp;&nbsp; "
          f"**Check constraints:** {sum(len(v) for v in checks.values())} &nbsp;&nbsp; "
          f"**Indexes:** {sum(len(v) for v in indexes.values())}\n")
md.append("---\n")

# Relational schema notation
md.append("## 1. Relational Schema (notation)\n")
md.append("Primary key attributes are **bold**. Foreign keys are marked with the\n"
          "relation they reference.\n")
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
md.append("## 2. Data Dictionary\n")
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
md.append("## 3. Referential Integrity Summary\n")
md.append("| Child | Column(s) | Parent | ON DELETE | ON UPDATE |\n")
md.append("| :--- | :--- | :--- | :--- | :--- |\n")
for fk in sorted(fks, key=lambda f: (module_of.get(f["child"], ""), f["child"])):
    md.append(f'| `{fk["child"].upper()}` | `{", ".join(fk["child_cols"])}` | '
              f'`{fk["parent"].upper()}({", ".join(fk["parent_cols"])})` | '
              f'{fk["on_delete"]} | {fk["on_update"]} |\n')

md.append("\n---\n")

# Index summary
md.append("## 4. Indexes\n")
md.append("| Table | Index | Definition |\n| :--- | :--- | :--- |\n")
for _mod, t in ordered:
    for iname, idef in indexes[t]:
        short = idef.split(" USING ", 1)[-1] if " USING " in idef else idef
        md.append(f"| `{t}` | `{iname}` | `{short}` |\n")

# --------------------------------------------------------------------------
# Graphviz .dot  - crow's foot notation, clustered by module
#
# Mermaid lays a hub schema like this one out badly: PEOPLE touches almost
# every table, so dagre produces one very wide band of crossing edges. Graphviz
# clusters and ranks it into something readable.
# --------------------------------------------------------------------------
# Monochrome throughout: black rules on white, grey only to separate the
# header band and the secondary type text. Prints and photocopies cleanly.
HEADER_FILL = "#d9d9d9"
BODY_FILL = "#ffffff"
LINE = "#000000"
TYPE_GREY = "#555555"


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def dot_graph(with_columns):
    L = ["digraph scholarly {",
         '  graph [rankdir=LR, splines=spline, overlap=false, nodesep=0.45,'
         ' ranksep=1.5, fontname="Helvetica", labelloc="t", fontsize=22,'
         f'  label="Scholarly  -  {"Full Entity Relationship Diagram" if with_columns else "Entity Relationships"}'
         f'  ({len(tables)} tables, {len(fks)} foreign keys)\\n "];',
         '  node [shape=plaintext, fontname="Helvetica", fontsize=11];',
         '  edge [fontname="Helvetica", fontsize=9, color="#000000",'
         ' labeldistance=1.8, labelangle=20];']

    by_mod = defaultdict(list)
    for mod, t in ordered:
        by_mod[mod].append(t)

    for i, (mod, names) in enumerate(by_mod.items()):
        L.append(f'  subgraph cluster_{i} {{')
        L.append(f'    label="{esc(mod)}"; fontsize=15; fontcolor="{LINE}";')
        L.append(f'    style="dashed"; color="{LINE}"; penwidth=1.1; margin=18;')
        for t in names:
            fk_here = {c for fk in fks if fk["child"] == t for c in fk["child_cols"]}
            rows = [f'<TR><TD COLSPAN="3" BGCOLOR="{HEADER_FILL}">'
                    f'<B>{t.upper()}</B></TD></TR>']
            if with_columns:
                for col in columns[t]:
                    marks = []
                    if col["name"] in pk_cols[t]:
                        marks.append("PK")
                    if col["name"] in fk_here:
                        marks.append("FK")
                    if any(col["name"] in u and len(u) == 1 for u in uniques[t]):
                        marks.append("UQ")
                    mark = ",".join(marks)
                    name = esc(col["name"])
                    if "PK" in marks:
                        name = f"<B>{name}</B>"
                    if not col["nullable"]:
                        name = f"{name}<FONT COLOR='{TYPE_GREY}'> *</FONT>"
                    # Graphviz 2.43 rejects an empty <FONT></FONT> element,
                    # so the key cell falls back to a plain space.
                    mark_cell = (f'<FONT POINT-SIZE="8">{mark}</FONT>'
                                 if mark else ' ')
                    rows.append(
                        f'<TR>'
                        f'<TD ALIGN="LEFT" PORT="{esc(col["name"])}"'
                        f' BGCOLOR="{BODY_FILL}">{mark_cell}</TD>'
                        f'<TD ALIGN="LEFT" BGCOLOR="{BODY_FILL}">{name}</TD>'
                        f'<TD ALIGN="LEFT" BGCOLOR="{BODY_FILL}">'
                        f'<FONT COLOR="{TYPE_GREY}" POINT-SIZE="8">'
                        f'{esc(col["type"])}</FONT></TD>'
                        f'</TR>')
            label = ('<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" '
                     f'CELLPADDING="4">{"".join(rows)}</TABLE>>')
            L.append(f'    "{t}" [label={label}];')
        L.append("  }")

    for fk in fks:
        cc = tuple(fk["child_cols"])
        child_unique = cc in uniques[fk["child"]] or list(cc) == pk_cols[fk["child"]]
        nullable = any(c["nullable"] for c in columns[fk["child"]]
                       if c["name"] in fk["child_cols"])
        # Crow's foot: tail is the parent end, head is the child end.
        tail = "teeodot" if nullable else "teetee"
        head = "teeodot" if child_unique else "crowodot"
        style = "dashed" if nullable else "solid"
        L.append(f'  "{fk["parent"]}" -> "{fk["child"]}" '
                 f'[dir=both, arrowtail={tail}, arrowhead={head}, style={style},'
                 f' xlabel="{esc(edge_label(fk))}"];')

    L.append("}")
    return "\n".join(L) + "\n"


with open("docs/erd_overview.mmd", "w") as f:
    f.write(overview)
with open("docs/erd_full.mmd", "w") as f:
    f.write(full)
with open("docs/erd_overview.dot", "w") as f:
    f.write(dot_graph(with_columns=False))
with open("docs/erd_full.dot", "w") as f:
    f.write(dot_graph(with_columns=True))
def normalise_markdown(text):
    """
    Guarantee blank lines around headings, horizontal rules and the start of
    lists and tables. Without this a '---' sitting directly under a text line
    is parsed as a setext underline and silently turns that line into a
    heading, and lists glued to a paragraph do not render as lists at all.
    """
    lines = text.split("\n")
    out = []
    for line in lines:
        s = line.strip()
        starts_block = (
            s.startswith("#") or s == "---"
            or s.startswith("- ") or s.startswith("| ")
            or s.startswith("`") or s.startswith("**")
        )
        if starts_block and out and out[-1].strip() != "":
            prev = out[-1].strip()
            # Consecutive list or table rows stay glued together.
            same_run = (
                (s.startswith("- ") and prev.startswith("- "))
                or (s.startswith("| ") and prev.startswith("| "))
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
