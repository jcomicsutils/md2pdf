---
title: Q3 Performance Report
page:
  size: Letter
  marginMm:
    t: 24
    r: 22
    b: 24
    l: 22
numbering:
  pages: n
  headings: true
breaks:
  h1: true
  h2: false
headerText: "Example Corp · Q3 Performance Report"
footerText: "Confidential: internal use only"
type:
  body: Inter
  heading: Inter
  sizePt: 10.5
  leading: 1.5
toc:
  depth: 2
  style: boxed
  pageNumbers: true
  dots: true
---

**Q3 Performance Report**

Platform Engineering · Prepared for the leadership review

---

\tableofcontents

# Executive Summary

Throughput grew in every region this quarter while median latency fell for the third quarter in a row. Two items need a decision before the Q4 planning cycle: the database migration and the on-call rotation.[^method]

- Revenue is up **12%** quarter over quarter.
- Median API latency dropped from 182 ms to 141 ms.
- Availability held at **99.95%**, above the 99.9% target.
- One major incident (INC-418) lasted 47 minutes.

[^method]: All figures come from the internal metrics warehouse and cover 1 July to 30 September. Percentages are rounded to the nearest whole number unless stated otherwise.

# Results

## Revenue

Revenue grew in all four regions. The biggest contributor in absolute terms was North America; the fastest growth came from Asia-Pacific.

| Region | Q2 | Q3 | Change |
| :--- | ---: | ---: | ---: |
| North America | 41.2 | 45.0 | +9.2% |
| Europe | 28.7 | 32.1 | +11.8% |
| Asia-Pacific | 14.3 | 17.5 | +22.4% |
| Latin America | 6.1 | 6.8 | +11.5% |
| **Total** | **90.3** | **101.4** | **+12.3%** |

Table: Revenue by region, in USD millions.

## Latency

The p50 and p95 latencies improved after the cache rollout in week 5. The p99 tail is still above target and is the main item for Q4.

| Percentile | Target | Q2 | Q3 |
| :--- | ---: | ---: | ---: |
| p50 | 150 ms | 182 ms | 141 ms |
| p95 | 400 ms | 455 ms | 388 ms |
| p99 | 800 ms | 1,120 ms | 940 ms |

Table: Request latency by percentile.

## Incident review

> **INC-418, 14 August.** A misconfigured connection pool exhausted database connections during a traffic spike. Mitigation took 47 minutes because the runbook was out of date. The runbook has since been rewritten and tested.

# Risks and Next Steps

## Open risks

1. **Database migration.** The cut-over window overlaps with the holiday traffic peak.
2. **On-call load.** Two engineers carried 60% of the pages this quarter.
3. **p99 latency.** Still above target; the fix depends on the migration.

## Action items

- [x] Rewrite and test the connection-pool runbook
- [x] Roll out the cache layer to all regions
- [ ] Decide the migration window with the product team
- [ ] Rebalance the on-call rotation
- [ ] Add p99 alerting to the shared dashboard

## Sign-off

Reviewed by the Platform Engineering leads. Questions go to the team channel.
