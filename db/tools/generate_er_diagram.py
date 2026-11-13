#!/usr/bin/env python3
"""
Generate the CONCEPTUAL ER diagram for Scholarly in Chen notation.

This is deliberately a different artifact from the relational schema diagram
produced by generate_schema_docs.py:

  ER diagram (this file)     conceptual. Entity types, relationship types,
                             attributes, cardinality ratios and participation.
                             Link tables disappear into M:N relationships.

  Relational schema          logical. One box per table, every column, foreign
                             key arrows. This is what the database actually is.

The conceptual model below is derived from the physical schema by the usual
reverse-mapping rules, and each non-obvious decision is justified inline:

  * a table whose primary key is also a foreign key and nothing else, with no
    attributes of its own beyond the link, is an M:N RELATIONSHIP
    (person_affiliations, conference_memberships, paper_authors, paper_topics,
    reviewer_topics)
  * a table whose primary key IS its foreign key is a WEAK ENTITY or a
    SPECIALIZATION (author_profiles, reviewer_profiles, paper_embeddings,
    reviewer_embeddings)
  * a table with its own surrogate key that other tables reference must be an
    ENTITY, because Chen notation does not allow a relationship to participate
    in another relationship (review_assignments)
  * a NOT NULL foreign key means TOTAL participation, drawn as a double line

Usage:
    python3 db/tools/generate_er_diagram.py
    dot -Tpng -Gdpi=130 docs/er_diagram.dot -o docs/er_diagram.png
"""

# ---------------------------------------------------------------------------
# Conceptual model
# ---------------------------------------------------------------------------
# key:        underlined in the diagram
# partial:    dashed underline, the discriminator of a weak entity
ENTITIES = {
    "PERSON": {
        "attrs": ["person_id*", "full_name", "email", "created_at"],
    },
    "USER_ACCOUNT": {
        "attrs": ["account_id*", "password_hash", "system_role",
                  "account_status", "created_at", "last_login_at"],
    },
    "AFFILIATION": {
        "attrs": ["affiliation_id*", "institution_name", "institution_domain",
                  "country_code"],
    },
    "CONFERENCE": {
        "attrs": ["conference_id*", "name", "acronym", "year", "description",
                  "submission_open_at", "submission_close_at",
                  "review_deadline", "status"],
    },
    "PAPER": {
        "attrs": ["paper_id*", "title", "abstract", "submission_status",
                  "submitted_at"],
    },
    "TOPIC": {
        "attrs": ["topic_id*", "topic_name", "description"],
    },
    "ASSIGNMENT": {
        "attrs": ["assignment_id*", "assignment_status", "assigned_at", "due_at"],
        "note": "associative entity",
    },
    "REVIEW": {
        "attrs": ["review_id*", "overall_score", "confidence", "recommendation",
                  "comments_to_authors", "comments_to_chair", "review_status",
                  "submitted_at"],
    },
    "DECISION": {
        "attrs": ["decision_id*", "outcome", "rationale", "decided_at"],
    },
    "AUDIT_ENTRY": {
        "attrs": ["audit_id*", "table_name", "operation", "record_pk",
                  "old_data", "new_data", "occurred_at"],
    },
    # Subclasses of PERSON: their tables use person_id as both PK and FK.
    "AUTHOR": {"attrs": ["profile_status"], "sub": True},
    "REVIEWER": {"attrs": ["bio", "research_keywords", "reviewer_status"],
                 "sub": True},
    # Weak entities: primary key is entirely the owner's key.
    "PAPER_EMBEDDING": {
        "attrs": ["embedding", "model_name", "content_hash", "embedded_at"],
        "weak": True,
    },
    "REVIEWER_EMBEDDING": {
        "attrs": ["embedding", "model_name", "content_hash", "embedded_at"],
        "weak": True,
    },
}

# (name, left entity, left cardinality, left participation,
#         right entity, right cardinality, right participation, attributes)
# participation: "total" draws a double line, "partial" a single line.
RELATIONSHIPS = [
    ("HAS_LOGIN", "PERSON", "1", "partial", "USER_ACCOUNT", "1", "total", []),
    ("WORKS_AT", "PERSON", "M", "partial", "AFFILIATION", "N", "partial",
     ["start_date", "end_date"]),
    ("SERVES_ON", "PERSON", "M", "partial", "CONFERENCE", "N", "partial",
     ["role", "membership_status", "joined_at", "max_active_assignments"]),
    ("RECEIVES", "CONFERENCE", "1", "partial", "PAPER", "N", "total", []),
    ("SUBMITS", "PERSON", "1", "partial", "PAPER", "N", "total", []),
    ("WRITES", "AUTHOR", "M", "partial", "PAPER", "N", "total",
     ["author_order", "is_corresponding"]),
    ("CLASSIFIED_UNDER", "PAPER", "M", "partial", "TOPIC", "N", "partial", []),
    ("EXPERT_IN", "REVIEWER", "M", "partial", "TOPIC", "N", "partial",
     ["expertise_level", "declared_at"]),
    ("CONFLICTS_WITH", "PAPER", "M", "partial", "PERSON", "N", "partial",
     ["coi_type", "detection_method", "detail", "detected_at"]),
    ("ASSIGNED_FOR", "PAPER", "1", "partial", "ASSIGNMENT", "N", "total", []),
    ("CARRIED_BY", "REVIEWER", "1", "partial", "ASSIGNMENT", "N", "total", []),
    ("ALLOCATED_BY", "PERSON", "1", "partial", "ASSIGNMENT", "N", "partial", []),
    ("PRODUCES", "ASSIGNMENT", "1", "partial", "REVIEW", "1", "total", []),
    ("VERDICT_ON", "PAPER", "1", "partial", "DECISION", "1", "total", []),
    ("DECIDED_BY", "PERSON", "1", "partial", "DECISION", "N", "total", []),
    ("ACTED_IN", "PERSON", "1", "partial", "AUDIT_ENTRY", "N", "partial", []),
]

# Identifying relationships for weak entities: double diamond, double lines.
IDENTIFYING = [
    ("EMBEDS", "PAPER", "1", "PAPER_EMBEDDING", "1"),
    ("EMBEDS_REVIEWER", "REVIEWER", "1", "REVIEWER_EMBEDDING", "1"),
]

# Specialization: PERSON ISA {AUTHOR, REVIEWER}, overlapping and partial,
# because a person may be both and may be neither.
SPECIALIZATION = ("PERSON", ["AUTHOR", "REVIEWER"], "o")  # o = overlapping

LINE = "#000000"


def attr_node(gid, owner, raw, rel_attr=False):
    """Attribute ellipse. A trailing * marks a key attribute (underlined)."""
    key = raw.endswith("*")
    name = raw.rstrip("*")
    label = f"<<U>{name}</U>>" if key else f'"{name}"'
    style = "filled" if rel_attr else "filled"
    fill = "#f2f2f2" if rel_attr else "#ffffff"
    return (f'  "{gid}" [shape=ellipse, label={label}, fontsize=9, '
            f'style={style}, fillcolor="{fill}", color="{LINE}", '
            f'width=0.1, height=0.28, margin="0.04,0.02"];\n'
            f'  "{owner}" -- "{gid}" [len=0.9, color="{LINE}"];\n')


def build():
    out = ['graph scholarly_er {',
           '  layout=neato; overlap=prism; overlap_scaling=-9; sep="+13";',
           '  splines=true; esep="+6"; mode=major; maxiter=4000;',
           '  graph [fontname="Helvetica", labelloc="t", fontsize=26,'
           '         label="Scholarly  -  Entity Relationship Diagram'
           ' (Chen notation)\\n "];',
           f'  node [fontname="Helvetica", color="{LINE}", penwidth=1.1];',
           f'  edge [fontname="Helvetica", fontsize=9, color="{LINE}",'
           '        penwidth=1.0];']

    # Entities
    for name, spec in ENTITIES.items():
        peripheries = 2 if spec.get("weak") else 1
        out.append(f'  "{name}" [shape=box, peripheries={peripheries}, '
                   f'label="{name}", fontsize=13, style=filled, '
                   f'fillcolor="#e6e6e6", width=1.5, height=0.5];')

    # Entity attributes
    for name, spec in ENTITIES.items():
        for i, raw in enumerate(spec["attrs"]):
            out.append(attr_node(f"{name}__a{i}", name, raw))

    # Relationships
    for (rname, left, lcard, lpart, right, rcard, rpart, rattrs) in RELATIONSHIPS:
        out.append(f'  "{rname}" [shape=diamond, label="{rname}", fontsize=10, '
                   f'style=filled, fillcolor="#ffffff", '
                   f'width=1.9, height=1.0];')
        for side, ent, card, part in ((0, left, lcard, lpart),
                                      (1, right, rcard, rpart)):
            # Total participation is drawn as a double line.
            colour = f'"{LINE}:{LINE}"' if part == "total" else f'"{LINE}"'
            out.append(f'  "{ent}" -- "{rname}" [label=" {card} ", '
                       f'color={colour}, len=1.7];')
        for i, raw in enumerate(rattrs):
            out.append(attr_node(f"{rname}__r{i}", rname, raw, rel_attr=True))

    # Identifying relationships for weak entities
    for (rname, owner, ocard, weak, wcard) in IDENTIFYING:
        out.append(f'  "{rname}" [shape=diamond, peripheries=2, label="{rname}",'
                   f' fontsize=10, style=filled, fillcolor="#ffffff",'
                   f' width=2.0, height=1.05];')
        out.append(f'  "{owner}" -- "{rname}" [label=" {ocard} ", '
                   f'color="{LINE}:{LINE}", len=1.6];')
        out.append(f'  "{rname}" -- "{weak}" [label=" {wcard} ", '
                   f'color="{LINE}:{LINE}", len=1.6];')

    # Specialization
    parent, children, kind = SPECIALIZATION
    out.append(f'  "ISA" [shape=triangle, label="{kind}", fontsize=11, '
               f'style=filled, fillcolor="#ffffff", width=1.0, height=0.8];')
    out.append(f'  "{parent}" -- "ISA" [len=1.4, color="{LINE}"];')
    for c in children:
        out.append(f'  "ISA" -- "{c}" [len=1.4, color="{LINE}"];')

    out.append("}")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    with open("docs/er_diagram.dot", "w") as f:
        f.write(build())
    n_attr = (sum(len(s["attrs"]) for s in ENTITIES.values())
              + sum(len(r[7]) for r in RELATIONSHIPS))
    print(f"entities={len(ENTITIES)} relationships="
          f"{len(RELATIONSHIPS) + len(IDENTIFYING)} attributes={n_attr}")
