# pele/ascii gallery

Every diagram type, drawn by `renderAscii(source, { maxWidth: 100 })`. The examples come from Mermaid's documentation. Regenerate this file with `npm run build && node scripts/ascii-gallery.mjs`.

|  |  |  |  |
| --- | --- | --- | --- |
| [Agent flow](#agent-flow) | [Architecture](#architecture) | [Block](#block) | [C4](#c4) |
| [Class](#class) | [Cynefin](#cynefin) | [Entity relationship](#entity-relationship) | [Event modeling](#event-modeling) |
| [Flowchart](#flowchart) | [Gantt](#gantt) | [Git graph](#git-graph) | [Ishikawa](#ishikawa) |
| [User journey](#user-journey) | [Kanban](#kanban) | [Mindmap](#mindmap) | [Packet](#packet) |
| [Pie](#pie) | [Quadrant chart](#quadrant-chart) | [Radar](#radar) | [Railroad](#railroad) |
| [Requirement](#requirement) | [Sankey](#sankey) | [Sequence](#sequence) | [State](#state) |
| [Swimlane](#swimlane) | [Timeline](#timeline) | [Treemap](#treemap) | [Tree view](#tree-view) |
| [Use case](#use-case) | [Venn](#venn) | [Wardley map](#wardley-map) | [XY chart](#xy-chart) |

## Agent flow

```text
                  ╱───────────────╱
                  │ Release brief │
                  ╱───────┬───────╱
                          │
                          ▼
╭─ Drafting Agent ─────────────────────────────────╮
│                                                  │
│                 ╭─────────────────╮              │
│                 │ Draft the notes │              │
│                 ╰┬───────────────┬╯              │
│                  │               ┆               │
│                  ▼               ┆               │
│  ┌┬──────────────────┬┐       ┌──┴────────────/  │
│  ││ changelog_search ││       │ Tone of voice │  │
│  └┴──────────────────┴┘       └~──────────────┘  │
│                                                  │
╰─────────────────────────────┬────────────────────╯
                              │
                              ▼
             ╭─ Review Agent ─────────╮
             │                        │
             │  ╭──────────────────╮  │
             │  │ Check the claims │  │
             │  ╰─────────┬────────╯  │
             │            │           │
             │            ▼           │
             │      ◇───────────╲     │
             │      │ Accurate? │     │
             │      ╲─────┬─────╱     │
             │            │           │
             ╰────────────┼───────────╯
                          │
                          ▼
                     ╱─────────╲
                     │ Publish │
                     ╲─────────╱
```

<details><summary>Source</summary>

```mermaid
agentflow-beta TB
  brief["Release brief"]@{ shape: input }
  flow writer["Drafting Agent"]
    draft["Draft the notes"]@{ shape: task }
    lookup["changelog_search"]@{ shape: tool }
    guide["Tone of voice"]@{ shape: refdoc }
    draft --> lookup
    draft -.- guide
  end
  flow reviewer["Review Agent"]
    check["Check the claims"]@{ shape: task }
    ok["Accurate?"]@{ shape: decision }
    check --> ok
  end
  publish["Publish"]@{ shape: action }
  brief --> writer
  writer --> reviewer
  ok --> publish
```

</details>

## Architecture

```text
┌─ Sources ────────────────────────────────────────────────┐
│                                                          │
│   ┌──────────┐          ┌──────────┐      ┌──────────┐   │
│   │ Source A │          │ Source B │      │ Source C │   │
│   └────┬─────┘          └────┬─────┘      └────┬─────┘   │
│        │                     │                 │         │
└────────┼─────────────────────┼─────────────────┼─────────┘
         │                     │                 │
         │                     │                 │
         │                     │                 │
         │                     │                 │
┌────────┼─ Storage ───────────┼─────────────────┼─────────┐
│        ▼                     ▼                 ▼         │
│    ┌────────┐            ┌────────┐       ┌──────────┐   │
│    │ DB One │            │ DB Two │       │ DB Three │   │
│    └────────┘            └───┬────┘       └──────────┘   │
│                              │                           │
└──────────────────────────────┼───────────────────────────┘
                               │
                               │
                               │
                               │
                      ┌────────┼─ Output ────────────────────────────────────────┐
                      │        ▼                                                 │
                      │    ┌───────┐        ┌─────────┐           ┌──────────┐   │
                      │    │ Brief ├───────▶│ Analyst ├──────────▶│ Delivery │   │
                      │    └───────┘        └─────────┘           └──────────┘   │
                      │                                                          │
                      └──────────────────────────────────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
architecture-beta
    group sources(cloud)[Sources]
        service src_a(server)[Source A] in sources
        service src_b(server)[Source B] in sources
        service src_c(server)[Source C] in sources

    group storage(database)[Storage]
        service db_one(database)[DB One] in storage
        service db_two(database)[DB Two] in storage
        service db_three(database)[DB Three] in storage

    group output(disk)[Output]
        service brief(disk)[Brief] in output
        service analyst(server)[Analyst] in output
        service delivery(cloud)[Delivery] in output

    src_a:B --> T:db_one
    src_b:B --> T:db_two
    src_c:B --> T:db_three
    db_two:B --> T:brief
    brief:R --> L:analyst
    analyst:R --> L:delivery

    align row src_a src_b src_c
    align row db_one db_two db_three
    align row brief analyst delivery

    align column src_a db_one
    align column src_b db_two brief
    align column src_c db_three
```

</details>

## Block

```text
                                               ╭────╮
                                               │ DB │
                                               ╰────╯

                                                 │
                                                 │
                                                 ▼

┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                  │
│   ┌──────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────┐   │
│   │            A             │    │ A wide one in the middle │    │            C             │   │
│   └──────────────────────────┘    └──────────────────────────┘    └────────────┬─────────────┘   │
│                                                                                │                 │
└────────────────────────────────────────────────┬───────────────────────────────┼─────────────────┘
                                                 │                               │
                                                 │                               │
                                                 ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                                  │
│                                                D                                                 │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
block
columns 1
  db(("DB"))
  blockArrowId6<["&nbsp;&nbsp;&nbsp;"]>(down)
  block:ID
    A
    B["A wide one in the middle"]
    C
  end
  space
  D
  ID --> D
  C --> D
  style B fill:#969,stroke:#333,stroke-width:4px
```

</details>

## C4

```text
     Component diagram for Internet Banking System - API Application

    ┌───────────────────────────┐        ┌────────────────────────────┐
    │        «container»        │        │        «container»         │
    ├───────────────────────────┤        ├────────────────────────────┤
    │  Single Page Application  │        │         Mobile App         │
    ├───────────────────────────┤        ├────────────────────────────┤
    │ [javascript and angular]  │        │         [Xamarin]          │
    ├───────────────────────────┤        ├────────────────────────────┤
    │ Provides all the internet │        │ Provides a limited subset  │
    │ banking functionality to  │        │  to the internet banking   │
    │  customers via their web  │        │ functionality to customers │
    │         browser.          │        │  via their mobile device.  │
    └─────────────┬────────┬────┘        └────┬───────────┬───────────┘
                  ▲        │                  │           │
                  │      Uses                 │         Uses
                  │  [JSON/HTTPS]             │     [JSON/HTTPS]
                Uses       │                Uses          │
            [JSON/HTTPS]   │            [JSON/HTTPS]      │
                  │        │                  │           │
                  │        │┌─────────────────┘           │
                  │        └┼─────────────────────┐       │
                  │         │                     │       │
                  │         │                     │       │
┌─────────────────┼─────────┼─ API Application ───┼───────┼─────────────┐
│                 │         │    [CONTAINER]      │       │             │
│                 │         │                     │       │             │
│                 │         │                     │       │             │
│                 │         │                     ▼       ▼             │
│                 │         ▼           ┌───────────────────────────┐   │
│   ┌─────────────┴──────────────┐      │        «component»        │   │
│   │        «component»         │      ├───────────────────────────┤   │
│   ├────────────────────────────┤      │     Accounts Summary      │   │
│   │     Sign In Controller     │      │        Controller         │   │
│   ├────────────────────────────┤      ├───────────────────────────┤   │
│   │   [MVC Rest Controller]    │      │   [MVC Rest Controller]   │   │
│   ├────────────────────────────┤      ├───────────────────────────┤   │
│   │ Allows users to sign in to │      │ Provides customers with a │   │
│   │    the internet banking    │      │   summary of their bank   │   │
│   │           system           │      │         accounts          │   │
│   └──────────────┬─────────────┘      └─────────────┬─────────────┘   │
│                  │                                  │                 │
│                  │                                  │                 │
│                  │                                  │                 │
│                Uses                               Uses                │
│                  │                                  │                 │
│                  │                                  │                 │
│                  ▼                                  ▼                 │
│    ┌──────────────────────────┐       ┌───────────────────────────┐   │
│    │       «component»        │       │        «component»        │   │
│    ├──────────────────────────┤       ├───────────────────────────┤   │
│    │    Security Component    │       │ Mainframe Banking System  │   │
│    ├──────────────────────────┤       │          Facade           │   │
│    │      [Spring Bean]       │       ├───────────────────────────┤   │
│    ├──────────────────────────┤       │       [Spring Bean]       │   │
│    │  Provides functionality  │       ├───────────────────────────┤   │
│    │  related to singing in,  │       │     A facade onto the     │   │
│    │ changing passwords, etc. │       │ mainframe banking system. │   │
│    └─────────────┬────────────┘       └─────────────┬─────────────┘   │
│                  │                                  │                 │
│                  │                                  │                 │
│                  │                                  │                 │
└──────────────────┼──────────────────────────────────┼─────────────────┘
                   │                                  │
                   │                                  │
            Read & write to                         Uses
                [JDBC]                           [XML/HTTPS]
                   │                                  │
                   │                                  │
                   ▼                                  ▼
     ╭───────────────────────────╮      ┌───────────────────────────┐
     ├───────────────────────────┤      │     «external system»     │
     │      «container db»       │      ├───────────────────────────┤
     ├───────────────────────────┤      │ Mainframe Banking System  │
     │         Database          │      ├───────────────────────────┤
     ├───────────────────────────┤      │  Stores all of the core   │
     │   [Relational Database    │      │ banking information about │
     │          Schema]          │      │   customers, accounts,    │
     ├───────────────────────────┤      │    transactions, etc.     │
     │ Stores user registration  │      └───────────────────────────┘
     │    information, hashed    │
     │      authentication       │
     │ credentials, access logs, │
     │           etc.            │
     ╰───────────────────────────╯
```

<details><summary>Source</summary>

```mermaid
C4Component
    title Component diagram for Internet Banking System - API Application

    Container(spa, "Single Page Application", "javascript and angular", "Provides all the internet banking functionality to customers via their web browser.")
    Container(ma, "Mobile App", "Xamarin", "Provides a limited subset to the internet banking functionality to customers via their mobile device.")
    ContainerDb(db, "Database", "Relational Database Schema", "Stores user registration information, hashed authentication credentials, access logs, etc.")
    System_Ext(mbs, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")

    Container_Boundary(api, "API Application") {
        Component(sign, "Sign In Controller", "MVC Rest Controller", "Allows users to sign in to the internet banking system")
        Component(accounts, "Accounts Summary Controller", "MVC Rest Controller", "Provides customers with a summary of their bank accounts")
        Component(security, "Security Component", "Spring Bean", "Provides functionality related to singing in, changing passwords, etc.")
        Component(mbsfacade, "Mainframe Banking System Facade", "Spring Bean", "A facade onto the mainframe banking system.")

        Rel(sign, security, "Uses")
        Rel(accounts, mbsfacade, "Uses")
        Rel(security, db, "Read & write to", "JDBC")
        Rel(mbsfacade, mbs, "Uses", "XML/HTTPS")
    }

    Rel_Back(spa, sign, "Uses", "JSON/HTTPS")
    Rel(spa, accounts, "Uses", "JSON/HTTPS")

    Rel(ma, sign, "Uses", "JSON/HTTPS")
    Rel(ma, accounts, "Uses", "JSON/HTTPS")

    UpdateRelStyle(spa, sign, $offsetY="-40")
    UpdateRelStyle(spa, accounts, $offsetX="40", $offsetY="40")

    UpdateRelStyle(ma, sign, $offsetX="-90", $offsetY="40")
    UpdateRelStyle(ma, accounts, $offsetY="-40")

        UpdateRelStyle(sign, security, $offsetX="-160", $offsetY="10")
        UpdateRelStyle(accounts, mbsfacade, $offsetX="140", $offsetY="10")
        UpdateRelStyle(security, db, $offsetY="-40")
        UpdateRelStyle(mbsfacade, mbs, $offsetY="-40")
```

</details>

## Class

```text
                          ┌─ Company ──────────────┐
                          │                        │
                          │                        │
                          │  ┌──────────────────┐  │
                          │  │       CEO        │  │
                          │  ├──────────────────┤  │
                          │  │                  │  │
                          │  ├──────────────────┤  │
                          │  │ +makeDecisions() │  │
                          │  └───────┬──┬───────┘  │
                          │          │  │          │
                          └──────────┼──┼──────────┘
                                     │  │
                  ┌──────────────────┘  └──────────────────┐
                  │                                        │
                  │                                        │
         oversees │                               oversees │
                  │                                        │
                  │                                        │
                  │                                        │
┌─ Company. ──────┼────────────────┐     ┌─ Company. ──────┼─────────────────┐
│  Engineering.   │                │     │  Engineering.   │                 │
│  Backend        │                │     │  Frontend       │                 │
│                 │                │     │                 │                 │
│                 │                │     │                 │                 │
│                 ▼                │     │                 ▼                 │
│         ┌──────────────┐         │     │        ┌─────────────────┐        │
│         │  Developer   │         │     │        │    Designer     │        │
│         ├──────────────┤         │     │        ├─────────────────┤        │
│         │              │         │     │        │                 │        │
│         ├──────────────┤         │     │        ├─────────────────┤        │
│         │ +writeCode() │         │     │        │ +createMockup() │        │
│         └──────────────┘         │     │        └─────────────────┘        │
│                                  │     │                                   │
└──────────────────────────────────┘     └───────────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
---
config:
  class:
    hierarchicalNamespaces: false
---
classDiagram
    namespace Company.Engineering.Backend {
        class Developer {
            +writeCode()
        }
    }
    namespace Company.Engineering.Frontend {
        class Designer {
            +createMockup()
        }
    }
    namespace Company {
        class CEO {
            +makeDecisions()
        }
    }
    CEO --> Developer : oversees
    CEO --> Designer : oversees
```

</details>

## Cynefin

```text
                               Strategy Categorization

┌─ Complex ────────────────────┐                      ┌─ Complicated ────────────────┐
│                              │  Pattern identified  │                              │
│   Probe → Sense → Respond    ├─────────────────────▶┤  Sense → Analyse → Respond   │
│      Emergent Practices      │                      │        Good Practices        │
│                              │                      │                              │
│       Market research        │                      │     Competitive analysis     │
│                              │                      │                              │
└───────────────┬──────────────┘                      └───────────────┬──────────────┘
                ▲                                                     │
    Stabilized  │                                                     │ Best practice
                │                                                     │ codified
                │                                                     │
                │          ┌─ Confusion ──────────────────┐           │
                │          │                              │           │
                │          │           Disorder           │           │
                │          │                              │           │
                │          └──────────────────────────────┘           │
                │                                                     ▼
┌─ Chaotic ─────┴──────────────┐                      ┌─ Clear ───────┴──────────────┐
│                              │     Complacency      │                              │
│    Act → Sense → Respond     ├◀─────────────────────┤ Sense → Categorise → Respond │
│       Novel Practices        │                      │        Best Practices        │
│                              │                      │                              │
│      Crisis management       │                      │       Standard pricing       │
│                              │                      │                              │
└──────────────────────────────┘                      └──────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
cynefin-beta
  title Strategy Categorization

  complex
    "Market research"

  complicated
    "Competitive analysis"

  clear
    "Standard pricing"

  chaotic
    "Crisis management"

  complex --> complicated : "Pattern identified"
  complicated --> clear : "Best practice codified"
  clear --> chaotic : "Complacency"
  chaotic --> complex : "Stabilized"
```

</details>

## Entity relationship

```text
                                     ┌─ title2 ─────────────────────────────────────────────┐
                                     │                                                      │
                                     │                        ┌─ title3 ─────────────────┐  │
                                     │                        │                          │  │
                                     │                        │                          │  │
                                     │                        │  ┌────────────────────┐  │  │
                                     │                        │  │       PERSON       │  │  │
                                     │                        │  ├────────┬───────────┤  │  │
┌─ title1 ──────────────────┐        │                        │  │ string │ firstName │  │  │
│                           │        │                        │  │ string │ lastName  │  │  │
│  ┌─────────────────────┐  │        │       ┌─────┐          │  │ int    │ age       │  │  │
│  │      CUSTOMER       │  │        │       │ CAR │          │  └────────┴───────────┘  │  │
│  ├────────┬────────────┤  │        │       └──┬──┘          │                          │  │
│  │ string │ name       │  │        │         ─┼─            └──────────────────────────┘  │
│  │ string │ custNumber │  │        │         ─┼─                                          │
│  │ string │ sector     │  │        │          │                                           │
│  └────────┴────────────┘  │        │          │                                           │
│                           │        │       allows                                         │
└───────────────────────────┘        │          │                                           │
                                     │          │                                           │
                                     │          ○                                           │
                                     │         ╱│╲                                          │
                                     │  ┌───────┴──────┐                                    │
                                     │  │ NAMED-DRIVER │                                    │
                                     │  └──────────────┘                                    │
                                     │                                                      │
                                     └──────────────────────────────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
erDiagram
    subgraph title1
        CUSTOMER
        CUSTOMER {
            string name
            string custNumber
            string sector
        }
    end
    subgraph title2
        CAR ||--o{ NAMED-DRIVER : allows
        subgraph title3
            PERSON
            PERSON {
                string firstName
                string lastName
                int age
            }
        end
    end
```

</details>

## Event modeling

```text
    UI/Automation        Command/Read Model      Stream: External         Stream: Cart

                                               ┌─ 03 ─────────────┐
                                               │ InventoryChanged │
                                               └┬─────────────────┘
                                                │
                    ┌───────────────────────────┘
                    ▼
┌─ 02 ───────────────┐
│ InventoryProcessor │
└───────────────────┬┘
                    │
                    └─────────────────────┐
                                          ▼
                         ┌─ 04 ────────────┐
                         │ ChangeInventory │
                         └────────────────┬┘
                                          │
                                          └─────────────────────────────────────────────┐
                                                                                        ▼
                                                                      ┌─ 05 ─────────────┐
                                                                      │ InventoryChanged │
                                                                      └──────────────────┘
```

<details><summary>Source</summary>

```mermaid
eventmodeling

tf 03 evt External.InventoryChanged
tf 02 pcr InventoryProcessor
tf 04 cmd ChangeInventory
tf 05 evt Cart.InventoryChanged
```

</details>

## Flowchart

```text
        ╭─ TOP ──────────────────────╮
        │                            │
        │  ╭─ B1 ─────────────────╮  │
        │  │                      │  │
        │  │                      │  │
        │  │  ┌────┐      ┌────┐  │  │
        │  │  │ f1 │◀─────┤ i1 │  │  │
        │  │  └────┘      └────┘  │  │
        │  │                      │  │
        │  ╰───────────┬──────────╯  │
        │              │             │
        │              │             │
        │              ▼             │
┌───┐   │        ╭─ B2 ─────╮        │     ┌───┐
│ A ├──▶│        │          │        ├────▶│ B │
└───┘   │        │  ┌────┐  │        │     └───┘
        │        │  │ f2 │  │        │
        │        │  └────┘  │        │
        │        │     ▲    │        │
        │        │     │    │        │
        │        │     │    │        │
        │        │     │    │        │
        │        │     │    │        │
        │        │  ┌──┴─┐  │        │
        │        │  │ i2 │  │        │
        │        │  └────┘  │        │
        │        │          │        │
        │        ╰──────────╯        │
        │                            │
        ╰────────────────────────────╯
```

<details><summary>Source</summary>

```mermaid
flowchart LR
  subgraph TOP
    direction TB
    subgraph B1
        direction RL
        i1 -->f1
    end
    subgraph B2
        direction BT
        i2 -->f2
    end
  end
  A --> TOP --> B
  B1 --> B2
```

</details>

## Gantt

```text
                                      Timeline - Gantt Sampler

                 9
                 ▼
                 ┆
00   02   04    06    08   10    12    14   16    18    20   22    24    26   28    30    32   34
└─────┴────┴─────┼─────┴────┴─────┴─────┴────┴─────┴─────┴────┴─────┴─────┴────┴─────┴─────┴────┴───
                 ┆
── Issue19062 ───┼──────────────────────────────────────────────────────────────────────────────────
                 ┆
71               ┆
█████████████████████████████████████████████████████████████████████████████████████
                 ┆
── Issue19401 ───┼──────────────────────────────────────────────────────────────────────────────────
                 ┆
                 ┆                   36
                 ┆                   ██████████████████████████████████████████████████████████████
                 ┆
── Issue1300 ────┼──────────────────────────────────────────────────────────────────────────────────
                 ┆
                 ┆          94                     0     5
                 ┆          ██████████████         ◆     ██████████████
                 ┆
                 ┆                                               64
                 ┆                                               █
                 ┆
┌─────┬────┬─────┼─────┬────┬─────┬─────┬────┬─────┬─────┬────┬─────┬─────┬────┬─────┬─────┬────┬───
00   02   04    06    08   10    12    14   16    18    20   22    24    26   28    30    32   34
```

<details><summary>Source</summary>

```mermaid
---
    # Frontmatter config, YAML comments
    title: Ignored if specified in chart
    displayMode: compact     #gantt specific setting but works at this level too
    config:
#        theme: forest
#        themeCSS: " #item36 { fill: CadetBlue } "
        themeCSS: " // YAML supports multiline strings using a newline markers: \n
            #item36 { fill: CadetBlue }       \n

            // Custom marker workaround CSS from forum (below)    \n
            rect[id^=workaround] { height: calc(100% - 50px) ; transform: translate(9px, 25px); y: 0; width: 1.5px; stroke: none; fill: red; }   \n
            text[id^=workaround] { fill: red; y: 100%; font-size: 15px;}
        "
        gantt:
            useWidth: 400
            rightPadding: 0
            topAxis: true  #false
            numberSectionStyles: 2
---
gantt
    title Timeline - Gantt Sampler
    dateFormat YYYY
    axisFormat %y
    %% this next line doesn't recognise 'decade' or 'year', but will silently ignore
    tickInterval 1decade

    section Issue19062
    71   :            item71, 1900, 1930
    section Issue19401
    36   :            item36, 1913, 1935
    section Issue1300
    94   :            item94, 1910, 1915
    5    :            item5,  1920, 1925
    0    : milestone, item0,  1918, 1s
    9    : vert,              1906, 1s   %% not yet official
    64   : workaround,        1923, 1s   %% custom CSS object https://github.com/mermaid-js/mermaid/issues/3250
```

</details>

## Git graph

```text
main  hotfix  develop  featureB  featureA  release

  ●──────┐
  │      │
  │      ●───────┐
  │      │       │
  │      │       ●─────────┐                         ash
  │      │       │         │                         abc
  │      │       │         │
  │      │       │         ■
  │      │       │         │
  │      ●       │         │
  │      │       │         │
  │      │       ×─────────┼─────────┐
  │      │       │         │         │
  │      │       │         ●         │
  │      │       │         │         │
  ◉──────┤       │         │         │
  │      │       │         │         │
  │      │       │         ●         │
  │      │       │         │         │
  │      │       │         │         ●
  │      │       │         │         │
  │      └───────◉         │         │
  │              │         │         │
  │              │         │         ●
  │              │         │         │
  │              │         ●         │
  │              │                   │
  │              ◉───────────────────┴────────┐
  │              │                            │
  │              │                            ●
  │              │                            │
  ●              │                            │
  │              │                            │
  └──────────────┼────────────────────────────◉
                 │                            │
                 ◉────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
---
config:
  logLevel: 'debug'
  theme: 'base'
---
      gitGraph
        commit
        branch hotfix
        checkout hotfix
        commit
        branch develop
        checkout develop
        commit id:"ash" tag:"abc"
        branch featureB
        checkout featureB
        commit type:HIGHLIGHT
        checkout main
        checkout hotfix
        commit type:NORMAL
        checkout develop
        commit type:REVERSE
        checkout featureB
        commit
        checkout main
        merge hotfix
        checkout featureB
        commit
        checkout develop
        branch featureA
        commit
        checkout develop
        merge hotfix
        checkout featureA
        commit
        checkout featureB
        commit
        checkout develop
        merge featureA
        branch release
        checkout release
        commit
        checkout main
        commit
        checkout release
        merge main
        checkout develop
        merge release
```

</details>

## Ishikawa

```text
                                               ┌──── Inappropriate lens
                                               │
                                               ├──── Damaged lens
                                               │
                                               ├──── Dirty lens
  ┌──── Out of focus                           ▼
  │                                      ┌──── LENS
  ├──── Shutter speed too slow           │
  │                                      │     ┌──── Damaged sensor
  ├──── Protective film not removed      │     │
  │                                      │     ├──── Dirty sensor
  ├──── Beautification                   │     ▼
  │     filter applied                   ├──── SENSOR
  ▼                                      ▼
┌─┴───────┐                            ┌─┴─────────┐
│ Process │                            │ Equipment │
└─┬───────┘                            └─┬─────────┘
  └──┐                                   └──┐
     ▼                                      ▼                                 ┌──────────────┐
─────┼──────────────────────────────────────┼────────────────────────────────▶┤ Blurry Photo │
     ▲                                      ▲                                 └──────────────┘
  ┌──┘                                   ┌──┘
┌─┴────┐                               ┌─┴───────────┐
│ User │                               │ Environment │
└─┬────┘                               └─┬───────────┘
  ▲                                      ▲
  └──── Shaky hands                      ├──── Subject moved too quickly
                                         │
                                         └──── Too dark
```

<details><summary>Source</summary>

```mermaid
ishikawa-beta
    Blurry Photo
    Process
        Out of focus
        Shutter speed too slow
        Protective film not removed
        Beautification filter applied
    User
        Shaky hands
    Equipment
        LENS
            Inappropriate lens
            Damaged lens
            Dirty lens
        SENSOR
            Damaged sensor
            Dirty sensor
    Environment
        Subject moved too quickly
        Too dark
```

</details>

## User journey

```text
                         My working day

┌─ Go to work ──────────────────┐  ┌─ Go home ──────────────────┐
│                               │  │                            │
│  Make tea     ●●●●●  Me       │  │  Go downstairs  ●●●●●  Me  │
│  Go upstairs  ●●●○○  Me       │  │  Sit down       ●●●●●  Me  │
│  Do work      ●○○○○  Me, Cat  │  │                            │
│                               │  └────────────────────────────┘
└───────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me
```

</details>

## Kanban

```text
┌─ Todo ───────────────────────┐
│                              │
│ ┌──────────────────────────┐ │
│ │ Update Database Function │ │
│ ├──────────────────────────┤ │
│ │         MC-2037          │ │
│ ├──────────────────────────┤ │
│ │          @knsv           │ │
│ ├──────────────────────────┤ │
│ │           High           │ │
│ └──────────────────────────┘ │
│                              │
└──────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
kanban
todo[Todo]
  id3[Update Database Function]@{ ticket: MC-2037, assigned: 'knsv', priority: 'High' }
```

</details>

## Mindmap

```text
┌───────────────────────┐
│       Root with       │
│     a second line     │
│ Unicode works too: 🤓 │
└─┬─────────────────────┘
  │
  │   ┌───────────────────────┐
  │   │ The dog in the hog... │
  ├───┤ a very long text that │
  │   │  wraps to a new line  │
  │   └───────────────────────┘
  │
  │   ┌────────────────────────────┐
  └───┤ Regular labels still works │
      └────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
mindmap
    id1["`**Root** with
a second line
Unicode works too: 🤓`"]
      id2["`The dog in **the** hog... a *very long text* that wraps to a new line`"]
      id3[Regular labels still works]
```

</details>

## Packet

```text
                                           UDP Packet

 0                                                                                            15
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          Source Port                                          │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

 16                                                                                           31
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       Destination Port                                        │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

 32                                                                                           47
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                            Length                                             │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

 48                                                                                           63
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           Checksum                                            │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

 64                                                                                           79
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Data (variable length)                                     │
└───────────────────────────────────────────────────────────────────────────────────────────────┘

 80                                                                                           95
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Data (variable length)                                     │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
packet
title UDP Packet
+16: "Source Port"
+16: "Destination Port"
32-47: "Length"
48-63: "Checksum"
64-95: "Data (variable length)"
```

</details>

## Pie

```text
                    Key elements in Product X

Calcium    ███████████████▉                          42.96  39.8%
Potassium  ██████████████████▌                       50.05  46.3%
Magnesium  ███▊                                      10.01   9.3%
Iron       █▉                                            5   4.6%
```

<details><summary>Source</summary>

```mermaid
---
config:
  pie:
    textPosition: 0.5
    donutHole: 0.2
    highlightSlice: Potassium
  themeVariables:
    pieOuterStrokeWidth: "5px"
---
pie showData
    title Key elements in Product X
    "Calcium" : 42.96
    "Potassium" : 50.05
    "Magnesium" : 10.01
    "Iron" :  5
```

</details>

## Quadrant chart

```text
                            Reach and engagement of campaigns

High Engagement  ┌───────────────────────────────────┬───────────────────────────────────┐
                 │          Need to promote          │         We should expand          │
                 │                                   │                                   │
                 │                                   │                                   │
                 │                                   │                                   │
                 │                                   │                                   │
                 │              Campaign F ●         │                                   │
                 │                                   │    ● Campaign C                   │
                 │                     ● Campaign A  │                                   │
                 │                                   │                                   │
                 ├───────────────────────────────────┼───────────────────────────────────┤
                 │            Re-evaluate            │          May be improved          │
                 │                                   │                                   │
                 │                 Campaign E ●      │                  ● Campaign D     │
                 │                     Campaign B ●  │                                   │
                 │                                   │                                   │
                 │                                   │                                   │
                 │                                   │                                   │
                 │                                   │                                   │
                 │                                   │                                   │
Low Engagement   └───────────────────────────────────┴───────────────────────────────────┘
                 Low Reach                                                      High Reach
```

<details><summary>Source</summary>

```mermaid
quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    quadrant-2 Need to promote
    quadrant-3 Re-evaluate
    quadrant-4 May be improved
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]
    Campaign C: [0.57, 0.69]
    Campaign D: [0.78, 0.34]
    Campaign E: [0.40, 0.34]
    Campaign F: [0.35, 0.78]
```

</details>

## Radar

```text
          Restaurant Comparison

Food Quality
  Restaurant A  ███████████████████▎     4
  Restaurant B  ██████████████▍          3
  Restaurant C  █████████▋               2
  Restaurant D  █████████▋               2

Service
  Restaurant A  ██████████████▍          3
  Restaurant B  ███████████████████▎     4
  Restaurant C  ██████████████▍          3
  Restaurant D  █████████▋               2

Price
  Restaurant A  █████████▋               2
  Restaurant B  ██████████████▍          3
  Restaurant C  ███████████████████▎     4
  Restaurant D  ███████████████████▎     4

Ambiance
  Restaurant A  ███████████████████▎     4
  Restaurant B  ██████████████▍          3
  Restaurant C  █████████▋               2
  Restaurant D  ██████████████▍          3
```

<details><summary>Source</summary>

```mermaid
radar-beta
  title Restaurant Comparison
  axis food["Food Quality"], service["Service"], price["Price"]
  axis ambiance["Ambiance"]

  curve a["Restaurant A"]{4, 3, 2, 4}
  curve b["Restaurant B"]{3, 4, 3, 3}
  curve c["Restaurant C"]{2, 3, 4, 2}
  curve d["Restaurant D"]{2, 2, 4, 3}

  graticule polygon
  max 5
```

</details>

## Railroad

```text
                    Phone Number

phone

    ┌────────────▶─────────────┐
    │                          │
    │ ╭───╮   ┌──────────────┐ │    ┌────────────┐
●───┴─┤ + ├───┤ country-code ├─┴────┤ subscriber ├──▶
      ╰───╯   └──────────────┘      └────────────┘

country-code

      ┌───────┐
●───┬─┤ DIGIT ├─┬───▶
    │ └───────┘ │
    │           │
    └─────◀─────┘
       1..* x

subscriber

         ┌───────┐
●───┬──┬─┤ DIGIT ├─┬──┬───▶
    │  │ └───────┘ │  │
    │  │           │  │
    │  │   ╭───╮   │  │
    │  ├───┤ - ├───┤  │
    │  │   ╰───╯   │  │
    │  │           │  │
    │  │   ╭───╮   │  │
    │  └───┤ ␣ ├───┘  │
    │      ╰───╯      │
    │                 │
    └────────◀────────┘
          1..* x
```

<details><summary>Source</summary>

```mermaid
railroad-abnf-beta
title "Phone Number"

phone = [ "+" country-code ] subscriber ;
country-code = 1*DIGIT ;
subscriber = 1*( DIGIT / "-" / " " ) ;
```

</details>

## Requirement

```text
┌──────────────────────┐
│    «Requirement»     │
├──────────────────────┤
│     checkout_req     │
├──────────────────────┤     ┌──────────────────┐
│        ID: 1         │     │    «Element»     │
│ Text: Orders must be │     ├──────────────────┤
│   payable online.    │     │ checkout_service │
│      Risk: High      │     ├──────────────────┤
│  Verification: Test  │     │  Type: service   │
└─────────────────┬────┘     └────┬─────────────┘
                  ⊕               ┆
                  │               ┆
              contains        satisfies
                  │               ┆
                  │               ┆
                  │               ┆
                  │               ▽
            ┌─────┴────────────────────┐
            │ «Functional Requirement» │
            ├──────────────────────────┤
            │       payment_req        │
            ├──────────────────────────┤
            │         ID: 1.1          │
            │ Text: Card payments must │
            │      be authorised.      │
            │        Risk: High        │
            │    Verification: Test    │
            └──────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
requirementDiagram
  requirement checkout_req {
    id: 1
    text: Orders must be payable online.
    risk: high
    verifymethod: test
  }
  functionalRequirement payment_req {
    id: 1.1
    text: Card payments must be authorised.
    risk: high
    verifymethod: test
  }
  element checkout_service {
    type: service
  }
  checkout_req - contains -> payment_req
  checkout_service - satisfies -> payment_req
```

</details>

## Sankey

```text
Pumped heat                                                 263.7
├─▶ Heating and cooling, "homes"       ████████████████████ 193.0
└─▶ Heating and cooling, "commercial"  ███████▍              70.7
```

<details><summary>Source</summary>

```mermaid
sankey

Pumped heat,"Heating and cooling, ""homes""",193.026
Pumped heat,"Heating and cooling, ""commercial""",70.672
```

</details>

## Sequence

```text
      ○
     ─┼─
     ╱ ╲
┌──────────┐                       ┌─────────┐         ┌─────────────┐              ┌──────┐
│ Customer │                       │ Web app │         │ API gateway │              │ Bank │
└─────┬────┘                       └────┬────┘         └──────┬──────┘              └───┬──┘
      │                                 │                     │                         │
      │         1. Place order          │                     │                         │
      ├────────────────────────────────▶│                     │                         │
      │                                 │                     │                         │
      │                                 │  2. POST /orders    │                         │
      │                                 ├────────────────────▶┃                         │
      │                                 │                     ┃                         │
      │                                 │                     ┃  3. Authorise payment   │
      │                                 │                     ┠────────────────────────▶│
      │                                 │                     ┃                         │
      │                                 │                     ┃      4. Approved        │
      │                                 │                     ┃◀┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤
      │                                 │                     ┃                         │
      │                                 │   5. 201 Created    ┃                         │
      │                                 │◀┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┨                         │
      │                                 │                     ┃                         │
      │       6. Order confirmed        │                     │                         │
      │◀┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤                     │                         │
      │                                 │                     │                         │
    ┌─────────────────────────────────────────────────────────────────────────────────────┐
    │                             One order, one transaction                              │
    └─────────────────────────────────────────────────────────────────────────────────────┘
      │                                 │                     │                         │
┌─────┴────┐                       ┌────┴────┐         ┌──────┴──────┐              ┌───┴──┐
│ Customer │                       │ Web app │         │ API gateway │              │ Bank │
└──────────┘                       └─────────┘         └─────────────┘              └──────┘
```

<details><summary>Source</summary>

```mermaid
sequenceDiagram
  autonumber
  actor Customer
  participant Web as Web app
  participant API as API gateway
  participant Bank
  Customer->>Web: Place order
  Web->>API: POST /orders
  activate API
  API->>Bank: Authorise payment
  Bank-->>API: Approved
  API-->>Web: 201 Created
  deactivate API
  Web-->>Customer: Order confirmed
  Note over Customer,Bank: One order, one transaction
```

</details>

## State

```text
             ●
             │
             │
             │
             ▼
         ━┯━━━━━┯━
          │     │
          │     │
        ┌─┘     │
        ▼       ▼
╭────────╮     ╭────────╮
│ State2 │     │ State3 │
╰───────┬╯     ╰┬───────╯
        │       │
        │       │
        └─┐     │
          ▼     ▼
         ━━━━┯━━━━
             │
             │
             │
             ▼
        ╭────────╮
        │ State4 │
        ╰────┬───╯
             │
             │
             │
             ▼
             ◉
```

<details><summary>Source</summary>

```mermaid
stateDiagram-v2
    state fork_state <<fork>>
      [*] --> fork_state
      fork_state --> State2
      fork_state --> State3

      state join_state <<join>>
      State2 --> join_state
      State3 --> join_state
      join_state --> State4
      State4 --> [*]
```

</details>

## Swimlane

```text
┌─ Intake ───────────────┐  ┌─ Review ─────────────┐  ┌─ Delivery ──────────┐
│                        │  │                      │  │                     │
│   ┌─────────────────┐  │  │    No                │  │                     │
│   │ Collect request │◀─┼──┼─────────────────────┐│  │                     │
│   └────────┬────────┘  │  │                     ││  │                     │
│            │           │  │                     ││  │                     │
│            │           │  │                     ││  │                     │
│            │           │  │                     ││  │                     │
│            ▼           │  │                     ││  │                     │
│  ┌──────────────────┐  │  │                     ││  │                     │
│  │ Validate details │  │  │                     ││  │                     │
│  └─────────────────┬┘  │  │                     ││  │                     │
│                    │   │  │                     ││  │                     │
│                    │   │  │  ┌────────────────┐ ││  │                     │
│                    └───┼──┼─▶│ Review request │ ││  │                     │
│                        │  │  └───────┬────────┘ ││  │                     │
│                        │  │          │          ││  │                     │
│                        │  │          │          ││  │                     │
│                        │  │          │          ││  │                     │
│                        │  │          ▼          ││  │                     │
│                        │  │      ╱────────╲     ││  │                     │
│                        │  │      │ Ready? ├─────┘│  │                     │
│                        │  │      ╲───────┬╱      │  │                     │
│                        │  │              │       │  │                     │
│                        │  │              │       │  │                     │
│                        │  │              │       │  │                     │
│                        │  │              │       │  │                     │
│                        │  │              │   Yes │  │  ┌───────────────┐  │
│                        │  │              └───────┼──┼─▶│ Schedule work │  │
│                        │  │                      │  │  └───────┬───────┘  │
│                        │  │                      │  │          │          │
│                        │  │                      │  │          │          │
│                        │  │                      │  │          │          │
│                        │  │                      │  │          ▼          │
│                        │  │                      │  │  ┌───────────────┐  │
│                        │  │                      │  │  │ Complete work │  │
│                        │  │                      │  │  └───────────────┘  │
│                        │  │                      │  │                     │
└────────────────────────┘  └──────────────────────┘  └─────────────────────┘
```

<details><summary>Source</summary>

```mermaid
swimlane-beta TB
  subgraph Intake
    collect[Collect request]
    validate[Validate details]
  end

  subgraph Review
    review[Review request]
    decide{Ready?}
  end

  subgraph Delivery
    schedule[Schedule work]
    complete[Complete work]
  end

  collect --> validate --> review --> decide
  decide -->|Yes| schedule --> complete
  decide -->|No| collect
```

</details>

## Timeline

```text
                             England's History Timeline

┌─ Stone Age ───────────────────────────────────────────────────────────────────────┐
│                                                                                   │
│  7600 BC ─●─ Britain's oldest known house was built in Orkney, Scotland           │
│           │                                                                       │
│  6000 BC ─●─ Sea levels rise and Britain becomes an island.                       │
│           │  The people who live here are hunter-gatherers.                       │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘

┌─ Bronze Age ──────────────────────────────────────────────────────────────────────┐
│                                                                                   │
│  2300 BC ─●─ People arrive from Europe and settle in Britain.                     │
│           │  They bring farming and metalworking.                                 │
│           │  New styles of pottery and ways of burying the dead appear.           │
│           │                                                                       │
│  2200 BC ─●─ The last major building works are completed at Stonehenge.           │
│           │  People now bury their dead in stone circles.                         │
│           │  The first metal objects are made in Britain.Some other nice things   │
│           │  happen. it is a good time to be alive.                               │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
timeline
        title England's History Timeline
        section Stone Age
          7600 BC : Britain's oldest known house was built in Orkney, Scotland
          6000 BC : Sea levels rise and Britain becomes an island.<br> The people who live here are hunter-gatherers.
        section Bronze Age
          2300 BC : People arrive from Europe and settle in Britain. <br>They bring farming and metalworking.
                  : New styles of pottery and ways of burying the dead appear.
          2200 BC : The last major building works are completed at Stonehenge.<br> People now bury their dead in stone circles.
                  : The first metal objects are made in Britain.Some other nice things happen. it is a good time to be alive.
```

</details>

## Treemap

```text
Budget             ████████████████████████████████████████  $1,500,000  100.0%
├─ Operations      ██████████████████████████▋               $1,000,000   66.7%
│  ├─ Salaries     ██████████████████▋                         $700,000   46.7%
│  ├─ Equipment    █████▍                                      $200,000   13.3%
│  └─ Supplies     ██▋                                         $100,000    6.7%
└─ Marketing       █████████████▍                              $500,000   33.3%
   ├─ Advertising  ██████████▋                                 $400,000   26.7%
   └─ Events       ██▋                                         $100,000    6.7%
```

<details><summary>Source</summary>

```mermaid
---
config:
  treemap:
    valueFormat: '$0,0'
---
treemap-beta
"Budget"
    "Operations"
        "Salaries": 700000
        "Equipment": 200000
        "Supplies": 100000
    "Marketing"
        "Advertising": 400000
        "Events": 100000
```

</details>

## Tree view

```text
├──── packages/
│     │
│     ├── mermaid/
│     │   │
│     │   ├── src/
│     │   │   │
│     │   │   ├── parser.ts
│     │   │   │
│     │   │   └── renderer.ts
│     │   │
│     │   └── package.json
│     │
│     └── parser/
│         │
│         └── src/
│
└──── README.md
```

<details><summary>Source</summary>

```mermaid
treeView-beta
├── packages/
│   ├── mermaid/
│   │   ├── src/
│   │   │   ├── parser.ts
│   │   │   └── renderer.ts
│   │   └── package.json
│   └── parser/
│       └── src/
└── README.md
```

</details>

## Use case

```text
                 ┌─ Storefront ────────────────────────────────────────┐
                 │                                                     │
                 │                                                     │
              ┌──┼─────────────────────────────┐                       │
    ○         │  │                             │ ╭──────────────────╮  │
   ─┼─────────┘  │                             └▶│                  │  │
    │            │  ╭──────────╮                 │ Browse catalogue │  │
    ├────────────┼─▶│ Checkout ├┄┄┄ include ┄┄┄┄▶│                  │  │
    │            │  │          │                 │                  │  │
   ╱ ╲           │  ╰──────────╯                 ╰──────────────────╯  │
Customer──────┐  │                                                     │
              │  │                                                     │
              │  └─────────────────────────────────────────────────────┘
              │  ┌─ Fulfilment ─────────┐
              │  │                      │
              │  │                      │
              │  │                      │
              │  │  ╭────────────────╮  │
     ○        └──┼─▶│                │  │
    ─┼─          │  │ Track delivery │  │
     └────────┐  │  │                │  │
    ╱ ╲       └──┼─▶│                │  │
  Support        │  ╰────────────────╯  │
                 │                      │
                 │                      │
                 └──────────────────────┘
```

<details><summary>Source</summary>

```mermaid
usecase-beta
direction LR
actor Customer
actor Support
systemBoundary Storefront
  Browse("Browse catalogue")
  Checkout("Checkout")
end
systemBoundary Fulfilment
  Track("Track delivery")
end
Customer --> Browse
Customer --> Checkout
Customer --> Track
Support --> Track
Checkout ..> : include Browse
```

</details>

## Venn

```text
            What makes a good feature

┌─ Desirable ─────────────────┐
│                             │
│                ┌────────────┼─ Feasible ──────┐
│                │            │                 │
│                │ Buildable  │                 │
│                │            │                 │
│  ┌─ Viable ────┼────────────┼──────────────┐  │
│  │             │            │              │  │
│  │ Marketable  │  Ship it   │ Sustainable  │  │
│  │             │            │              │  │
└──┼─────────────┼────────────┘              │  │
   │             │                           │  │
   │             └───────────────────────────┼──┘
   │                                         │
   └─────────────────────────────────────────┘
```

<details><summary>Source</summary>

```mermaid
venn-beta
  title What makes a good feature
  set Desirable
  set Feasible
  set Viable
  union Desirable,Feasible["Buildable"]
  union Feasible,Viable["Sustainable"]
  union Desirable,Viable["Marketable"]
  union Desirable,Feasible,Viable["Ship it"]
```

</details>

## Wardley map

```text
                                    Coordinate Examples

Visibility

│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆    User Need  ●
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆       ● Product   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                    ● Infrastructure        ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│                        ┆                   ┆                   ┆
│
└───────────────────────────────────────────────────────────────────────────────────────────
         Genesis             Custom Built          Product                Commodity

                                         Evolution
```

<details><summary>Source</summary>

```mermaid
wardley-beta
title Coordinate Examples

component Infrastructure [0.30, 0.20]        %% Low visibility, low evolution
component Product [0.70, 0.60]               %% High visibility, mid evolution
component User Need [0.90, 0.95]             %% High visibility, high evolution
```

</details>

## XY chart

```text
                                       Sales Revenue

Revenue (in $)


12000 ─┐                                           11000
       │                                    10500         10200
       │                             9500         ┌──●─┐
       │                                    ┌─●───┘ ███└──┐      9200
10000 ─┤                                 ┌──┘███    ███   └─●─┐         8500
       │                      8200   ┌─●─┘   ███    ███    ███└──┐
       │                            ┌┘███    ███    ███    ███   └─●───┐       7000
       │               7500       ┌─┘ ███    ███    ███    ███    ███  └──●─┐
 8000 ─┤                     ┌──●─┘   ███    ███    ███    ███    ███    ███└─┐
       │        6000   ┌─●───┘ ███    ███    ███    ███    ███    ███    ███  └┐      6000
       │              ┌┘███    ███    ███    ███    ███    ███    ███    ███   └─●─┐
       │ 5000       ┌─┘ ███    ███    ███    ███    ███    ███    ███    ███    ███└──┐
 6000 ─┤        ┌─●─┘   ███    ███    ███    ███    ███    ███    ███    ███    ███   └─●
       │     ┌──┘███    ███    ███    ███    ███    ███    ███    ███    ███    ███    ███
       │   ●─┘   ███    ███    ███    ███    ███    ███    ███    ███    ███    ███    ███
       │  ███    ███    ███    ███    ███    ███    ███    ███    ███    ███    ███    ███
 4000 ─┴───┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬───
          jan    feb    mar    apr    may    jun    jul    aug    sep    oct    nov    dec
```

<details><summary>Source</summary>

```mermaid
---
config:
    xyChart:
        width: 900
        height: 600
        showDataLabel: true
    themeVariables:
        xyChart:
            titleColor: "#ff0000"
---
xychart
    title "Sales Revenue"
    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]
    y-axis "Revenue (in $)" 4000 --> 11000
    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]
    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]
```

</details>
