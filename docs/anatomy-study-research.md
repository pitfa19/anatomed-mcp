# Studying Anatomy "The Right Way" — Synthesis for a 3D Context-Aware Study Tool

Research synthesis (Firecrawl, 2026-06-01) to inform the **verbosity / context levels** of an
interactive 3D viewer that isolates structures inline in Claude chat. Raw search JSON and scraped
sources are saved alongside this file in `.firecrawl/research/`.

Core question driving this: **when a student looks at a structure (e.g. a nerve), how much
surrounding context should the 3D view show?** The pedagogy answer is clear: *context is the whole
point of anatomy* — but it must be **delivered in controllable, bounded amounts** so it teaches
relationships without overwhelming working memory.

---

## Part 1 — Cited principles of effective anatomy study

1. **Anatomy is fundamentally about spatial relationships, not isolated facts.** "The human body is
   a three-dimensional structure, and understanding spatial relationships between individual
   components that comprise it serve as the foundation on which to build more detailed knowledge"
   — e.g. knowing a posterior cerebral artery aneurysm can cause oculomotor nerve palsy *is* anatomy
   in action. A structure's meaning largely lives in what it sits next to.
   — Smith, Finn & Border, *Learning Clinical Anatomy* (Eur J Anat): https://eurjanat.com/v1/data/pdf/eja.170160cs.pdf

2. **The regional approach (learn everything in a region together) is the dominant clinical method.**
   Regional anatomy "explains how different body structures work together in a particular region…
   provides a better understanding of how a region functions as a unit by allowing us to explore the
   relationships of the various systems found there." You learn the bones of a region, where the
   muscles attach to those bones, what nerves innervate those muscles, and what vessels supply them —
   simultaneously. It is "easier to apply in a clinical setting" and is "used more commonly" in med
   schools than the systemic approach.
   — anatomy.app, *Systemic vs regional anatomy*: https://anatomy.app/blog/Gross-anatomy-systemic-anatomy-vs-regional-anatomy

3. **The systemic approach (one whole system at a time) is good for the "big picture" but hides
   inter-system relationships.** Following one system "makes it harder for you to see the connections
   and relationships between multiple organ systems… one system is worthless without the other"
   (skeleton needs muscle to move). Implication: a system-only view under-teaches; a region view
   over-teaches if uncontrolled. The sweet spot is in between.
   — anatomy.app: https://anatomy.app/blog/Gross-anatomy-systemic-anatomy-vs-regional-anatomy

4. **Structures should be learned through a consistent, multi-slot framework — and most slots are
   relational.** TeachMeAnatomy's per-structure frameworks describe "site, shape, attachments,
   actions, innervation, blood supply, and relations." The slots that aren't the structure itself
   (attachments, innervation, blood supply, relations) are *exactly the context to surface in 3D*.
   — TeachMeAnatomy, *How to Learn Anatomy*: https://teachmeanatomy.info/the-basics/learning-anatomy/

5. **For a nerve specifically, the five things to know are Site → Type → Roots → Course →
   Innervation.** "Site" = the region giving context for what it supplies; "Course" = "the route the
   nerve takes… its relationships with surrounding structures and any notable anatomical landmarks it
   passes" (e.g. ulnar nerve passes posterior to the medial epicondyle, lies deep to flexor carpi
   ulnaris, enters via Guyon's canal); "Innervation" = the muscles/skin/organs it **supplies**. This
   is a direct spec for "show a nerve with the structures it passes through/around/supplies."
   — TeachMeAnatomy, *How to Learn Nerve Anatomy*: https://teachmeanatomy.info/the-basics/learning-anatomy/nerves/

6. **Clinical correlation makes anatomy stick.** "For anatomical study to be successful, links to
   future clinical practice need to be forged early." Memory is "strongly reinforced when linked to
   an emotive [clinical] experience"; context-dependent episodic anchors "facilitate learning and
   lead to longer-lasting and more stable semantic memories." A view should be able to spotlight the
   clinically relevant relationship (the nerve at the spot it's commonly injured).
   — Smith, Finn & Border: https://eurjanat.com/v1/data/pdf/eja.170160cs.pdf

7. **Surface landmarks and palpable bony points are a recognized scaffold** for locating deeper
   structures (the basis of body-painting/clinical-skills teaching: "palpation of bony landmarks").
   Bones are the stable reference frame learners orient everything else against.
   — Smith, Finn & Border: https://eurjanat.com/v1/data/pdf/eja.170160cs.pdf

8. **Active recall + spaced repetition is the highest-yield study behavior.** Active recall "instantly
   switches on your brain and forces you to really use it"; the loop is *test yourself → check → review
   regularly / space it out* — e.g. "start explaining the anatomy of the [sciatic] nerve purely from
   memory" rather than re-reading. A 3D tool should support recall (hide labels, quiz "what does this
   supply?"), not just passive display.
   — Kenhub, *Learn anatomy using active recall*: https://www.kenhub.com/en/library/anatomy/how-to-learn-anatomy-using-active-recall

9. **Multiple linked representations aid retrieval; redundant context is a feature, not noise — up to
   a point.** "The more representations of the learning/memory that exist the greater likelihood of
   successful retrieval." Showing a structure *plus* its neighbours creates extra retrieval cues
   (you remember the nerve by recalling the artery it runs with). This is the cognitive justification
   for context-on views.
   — Smith, Finn & Border: https://eurjanat.com/v1/data/pdf/eja.170160cs.pdf

10. **But working memory is finite — Cognitive Load Theory caps how much you should show at once.**
    CLT distinguishes *intrinsic* load (inherent complexity), *extraneous* load (poor presentation),
    and *germane* load (useful schema-building). Anatomy's value from 3D comes largely from cutting
    the *extraneous* load of mentally rotating 2D into 3D — but a cluttered scene re-introduces
    extraneous load. The regional approach itself "requires you to have some understanding of at least
    four different anatomical systems at the same time… That is *a lot* to digest, so good learning
    materials that help you orient yourself… are essential." Design takeaway: bound the part count and
    let the learner add context incrementally.
    — Frontiers in Psychology, *Cognitive load in anatomy education (3D VR vs 2D, fNIRS)*: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1767614/full
    — anatomy.app: https://anatomy.app/blog/Gross-anatomy-systemic-anatomy-vs-regional-anatomy

11. **3D helps spatial encoding and motivation, but is NOT automatically superior — interactivity and
    control are what matter.** A review found 12/21 studies showed 3D significantly more effective and
    9/21 found no significant difference, but students consistently prefer and are more motivated by
    3D. The fNIRS study found comparable knowledge gains for 2D vs 3D yet different neural effort
    patterns. A separate quality review concluded "no solid evidence that 3D models are superior to
    traditional teaching." Confidence: *3D is a strong engagement/spatial aid, not a magic bullet* —
    so the feature must earn its keep through good context control, not 3D-ness alone.
    — Bogomolova et al., *Does 3D anatomy improve student understanding?* (Clin Anat): https://pmc.ncbi.nlm.nih.gov/articles/PMC6916638/
    — Azer & Azer, *3D Anatomy Models and Impact on Learning* (MERSQI review): https://www.sciencedirect.com/science/article/pii/S2452301116300281

12. **Mature anatomy apps already expose graded "how much to show" controls — copy this UX.**
    Complete Anatomy lets you toggle whole **systems/organs on or off**, and "for more granular
    control… add and remove **layers within that system**," with **fade** (semi-transparent) distinct
    from **hide**, plus a one-tap **Reset**. Once a structure is **isolated**, "further features and
    information become available… for that specific structure" and it can be viewed from preset angles.
    This validates a layered model: system-level toggles, per-part toggles, fade-vs-hide, isolate-for-detail.
    — Complete Anatomy, *Layers and Systems*: https://3d4medical.com/support/complete-heart/layers-and-systems
    — Complete Anatomy, *Isolating Structures*: https://3d4medical.com/support/essential-anatomy-5/isolating-structures

---

## Part 2 — Context vs isolation: when each helps

- **Isolated view helps** at the *identification / first-encounter / active-recall* stage: learn the
  shape, name, orientation, and which-is-which without distraction (principles 4, 8, 12). It's also
  the right default when the part count would otherwise blow past working-memory limits (principle 10).
- **Context view helps** at the *relationship / clinical / consolidation* stage: it teaches what the
  structure does, passes, and connects to, and creates extra retrieval cues (principles 1, 2, 5, 6, 9).
  This is the part students *can't* get from a flashcard and is the highest-value thing a 3D tool adds.

The contextual structures that matter most are predictable per structure type — derived directly
from the per-type frameworks (principles 4–5):

| Focus structure | Highest-value context to surface | Source basis |
|---|---|---|
| **Nerve** | the **muscles/skin/organs it innervates (supplies)**; **vessels it runs with** (neurovascular bundle); **bones/foramina/landmarks it passes through or around** (its course) | TMA nerve framework (5) |
| **Muscle** | its **origin & insertion bones (attachments)**; the **nerve that innervates it**; its **blood supply**; **antagonist/synergist** muscles acting on the same joint | TMA frameworks (4) |
| **Artery/vessel** | its **branches** and the **territory it supplies**; the **accompanying nerve & vein** (the bundle); the **bones/regions** it courses past | TMA frameworks (4), neurovascular relationships (1,5) |
| **Bone** | the **muscles that attach** to it; **joints** it forms; nerves/vessels passing through its **foramina/grooves**; **surface landmarks** | regional approach (2), landmarks (7) |
| **Organ** | neighbouring organs (relations), its **neurovascular pedicle** (artery, vein, nerve), and the **region/cavity** it sits in | relations slot (4), regional unit (2) |

Across types the recurring contextual primitives are: **(a) the bony reference frame**, **(b) the
neurovascular bundle that travels together**, **(c) what-supplies/innervates-what**, and **(d) the
landmarks/passages the structure runs through**. These four map cleanly onto graph edges you could
precompute per part (`attaches_to`, `runs_with`, `supplies`/`innervates`, `passes_through`).

---

## Part 3 — Recommended verbosity / context levels for the 3D tool

Four levels, each a superset of the previous, always bounded by `MAX_REGION_PARTS`. Default to L1 for
a single named structure; let Claude/the user step up. Render added context **faded/dimmed** (per
Complete Anatomy's fade-vs-hide), keeping the focus structure fully opaque and tinted.

**L0 — Isolated.** *Shows:* only the focus structure, neutral background. *Why:* identification,
shape/orientation, and active-recall quizzing without distraction (P4, P8). *Use when:* "what is
this," flashcard/recall mode, or when context would exceed working-memory limits (P10).

**L1 — Bundle / direct attachments (DEFAULT).** *Shows:* the focus structure **plus the 1–3
structures it is physically/functionally fused to** — for a nerve, the artery+vein it runs with; for
a muscle, its origin & insertion bones + innervating nerve; for an artery, its accompanying vein &
nerve. *Why:* this is the smallest set that teaches a *relationship* rather than a fact, exploits the
neurovascular-bundle reality, and adds retrieval cues at minimal cognitive cost (P1, P5, P9, P12).

**L2 — Local relations / "what it passes through & supplies."** *Shows:* L1 **plus the landmarks the
structure courses past/through** (bones, foramina, canals) **and the targets it supplies/innervates**
— e.g. ulnar nerve faded against humerus + medial epicondyle + flexor carpi ulnaris + Guyon's canal +
the intrinsic hand muscles it supplies. *Why:* this is the literal answer to "show a nerve with the
structures it passes through/around/supplies" and matches the TMA *Course + Innervation* slots and
clinical reasoning (P5, P6). The bony landmarks double as the surface/orientation scaffold (P7).

**L3 — Regional unit.** *Shows:* the focus structure highlighted within **all four systems of its
region** (bones, muscles, nerves, vessels of e.g. the gluteal region or cubital fossa), heavily faded
except the focus chain. *Why:* delivers the full regional-approach "how a region functions as a unit"
experience for consolidation/exam prep (P2, P3). *Caution:* most load-heavy; cap part count, ship
with a one-tap reset back to L0/L1, and never auto-jump straight to L3 (P10).

**Cross-cutting UX (from P12):** every level should support per-part legend toggles (already built),
**fade vs hide** as distinct states, an **isolate-this** action that drops any part to L0 and reveals
its detail/notes, and a **reset**. A label-hide / "what does this supply?" quiz mode operationalizes
active recall (P8) on top of any level.

---

## Disagreements & confidence

- **Does 3D actually beat 2D?** Sources disagree. The systematic review (PMC6916638) leans yes on test
  scores and strongly yes on preference/motivation; the MERSQI quality review (ScienceDirect) and the
  fNIRS study (Frontiers) find **no reliable knowledge-gain advantage** for 3D, only different
  effort/engagement profiles. **Confidence: high** that 3D's value is spatial encoding + engagement +
  *control over what's shown*, **not** raw 3D-ness — which makes the verbosity-levels feature the
  actual lever, and argues against showing everything by default.
- **Regional vs systemic** is not really a disagreement: sources agree regional is the clinically
  dominant, relationship-teaching approach, and that's what the L1–L3 progression emulates.
  **Confidence: high.**
- **How many context parts is "too many"** is not given a hard number by any source — CLT only says
  "bounded, incremental, with orientation aids." **Confidence: medium**; treat the L1→L3 part caps as
  tunable, validate empirically, and keep the existing `MAX_REGION_PARTS` guard.
- The per-type context table is **synthesized** from the TMA frameworks (well-grounded) plus
  neurovascular-bundle reasoning; the specific edge taxonomy (`runs_with`, `passes_through`, etc.) is
  my recommendation, not a quoted source. **Confidence: medium-high** on the categories, lower on exact
  per-structure counts.

### Sources
- Smith, Finn & Border — *Learning Clinical Anatomy*, Eur J Anat (open-access PDF of the PMC7379743 article): https://eurjanat.com/v1/data/pdf/eja.170160cs.pdf
- TeachMeAnatomy — *How to Learn Anatomy*: https://teachmeanatomy.info/the-basics/learning-anatomy/
- TeachMeAnatomy — *How to Learn Nerve Anatomy*: https://teachmeanatomy.info/the-basics/learning-anatomy/nerves/
- anatomy.app — *Gross anatomy: systemic vs regional anatomy*: https://anatomy.app/blog/Gross-anatomy-systemic-anatomy-vs-regional-anatomy
- Kenhub — *How to learn anatomy using active recall*: https://www.kenhub.com/en/library/anatomy/how-to-learn-anatomy-using-active-recall
- Bogomolova et al. — *Does 3D anatomy improve student understanding?*, Clin Anat: https://pmc.ncbi.nlm.nih.gov/articles/PMC6916638/
- Azer & Azer — *3D Anatomy Models and Impact on Learning: A Review of the Quality of the Literature*: https://www.sciencedirect.com/science/article/pii/S2452301116300281
- *Exploring cognitive load in anatomy education: 3D VR vs 2D using fNIRS*, Front Psychol: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1767614/full
- Complete Anatomy — *Layers and Systems*: https://3d4medical.com/support/complete-heart/layers-and-systems
- Complete Anatomy — *Isolating Structures*: https://3d4medical.com/support/essential-anatomy-5/isolating-structures
