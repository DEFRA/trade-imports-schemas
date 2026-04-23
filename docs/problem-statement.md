# Problem Statement

Import notifications must have an associated schema that describes its regulatory and operational data requirements. Schemas must be defined using UN/CEFACT, specifically the SPS Certificate definitions. 

The official SPS Certificate schema does define EUDP journeys specifically, the data collected are for UK internal regulatory requirements not INTRA EU documents, however, adoption of UNCEFACT-defined structures allows for a common structure and data interoperability within the Defra ecosystem. 

# Context

Sanitary and Phytosanitary (SPS) controls are the measures used by governments to protect human, animal, and plant health when goods move across borders. They apply to live animals, animal products, plants, and plant products.

While a member of the EU, the UK operated within a shared SPS framework governed by the Official Controls Regulation (EU 2017/625, commonly known as the OCR). The OCR is the primary EU legislation that defines how SPS controls are carried out, and it mandates the use of TRACES as the system of record for import notifications, border controls, and certification. The UK's SPS processes, systems, and enforcement practices were built around this framework.

When the UK left the EU single market on 31 December 2020, it needed to stand up its own SPS controls regime for the first time. For Rest of World imports, the UK immediately applied full controls. But for EU imports, the introduction of controls was delayed repeatedly over three years, citing supply chain disruption, trader readiness, and cost of living pressures.

The Border Target Operating Model (BTOM), published in August 2023, was the UK's plan to resolve this. It set out a phased introduction of SPS controls on EU imports. Since Brexit and the adoption of the BTOM the UK has required importers to raise Notifications as Common Health Entry Documents (CHEDS) using IPAFFS (Import of Products, Animals, Food and Feed System).

A fundamental shift came with the May 2025 UK-EU Common Understanding, which committed to removing certificates and controls for the vast majority of EU movements. This is the policy change that triggered EUDP.

EUDP will deliver a new set of SPS controls for EU imports, and replatform the existing CHED journeys. In the process, the definitions of the data will be restructured to align with UN/CEFACT.


# UN/CEFACT SPS Certificate

The UN/CEFACT Sanitary and Phytosanitary (SPS) Certificate, often referred to as e-Cert, is an international standard for exchanging electronic health certificates for animals, plants, and products. Based on the Buy-Ship-Pay (BSP) model, it enables government authorities to securely exchange data, reducing paper-based delays and improving biosecurity compliance

- https://github.com/uncefact/spec-JSONschema/blob/main/JSONschema2020-12/meta-library/BuyShipPay/D23B/UNECE-SPSCertificate.json
- https://service.unece.org/trade/uncefact/publication/SupplyChainMGMT/SCRDM/HTML/001.htm
- https://github.com/uncefact

# Data Structures

## IPAFFS and the Notification Schema

The CHED import control process follows three parts: Notification, Decision, and Follow-up (EU Regulation 2019/1715 - Article 40).

Both EU and RoW imports follow the same three parts. Both use the Notification Portal for Part 1 and a case management system for Parts 2 and 3. The difference between EU and RoW is in what happens at each part (the depth of checks, where the decision is made, and whether follow-up is triggered), not the systems used or whether the part exists.

The data captured for each of the different CHED types (CHED-A, CHED-D, CHED-P and CHED-PP) via the IPAFFS User Journeys are defined by the
[IPAFFS Notification Schema](https://github.com/DEFRA/ipaffs-imports-notification-schema/tree/master/notification-schema-core/resources). 

IPAFFS is being retired, and the journeys are moving to a a new Defra Platform (CDP). The strategic choice is to move away from the Notification Schema in favour of defining all import Notifications in UN/CEFACT. 

## EU Live Animals

The first journey to be migrated to the CDP is the EU Live Animals journey. 

Each journey will follow an architecturally similar pattern; raising events using a transactional outbox pattern onto a journey specific SNS Topic, interested consumers subscribe via SQS queues.

**Transactional outbox pattern:**
- Journey service writes Import Notification and the "outbox event" in a single transaction
- Embedded background worker (within the same service container) polls the outbox collection and publishes to SNS
- FIFO ordering guaranteed by: (1) MongoDB distributed locking in outbox worker, (2) SQS FIFO queues with MessageGroupId for gateway/adapter processing
- Remediation / failure recovery:
  - SQS ensures failed messages automatically reappear for retry
  - DLQ captures messages that fail repeatedly
  - DLQ enables manual investigation
  - DLQ redrive can replay failed events
  - Worker processes continuously retry unsent events from the outbox collection

Events emitted by the journey services have a common envelope. The data section of each event is a JSON object that conforms to a schema based on UN/CEFACT SPS Certificate schema. 