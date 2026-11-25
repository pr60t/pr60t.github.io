---
date: 20-11-26
title: Canaries in Multi-Tenant RAG
description: How Firedamp plants checksum-verified canary documents as one user and probes as another to surface cross-tenant data leakage.
tags: [sample]
draft: false
---

Multi-tenant RAG systems share vector indices, document stores, and retrieval pipelines across users. When authorization filters drift or fail to propagate, a query from Tenant B can pull chunks owned by Tenant A into the prompt context.

> [!NOTE]
> This is a sample post shipped with the initial repository scaffold. Delete `content/blog/20-11-26-canaries_in_multi_tenant_rag.md` when you publish your own writing.

## The four-step audit loop

Firedamp models cross-user leakage testing as a repeatable four-stage sequence:

1. **Plant**: Seed a checksum-verified canary document into Tenant A as User A.
2. **Probe**: Replay queries across an authorization matrix covering owner, intruder, ex-member, and anonymous roles.
3. **Detect**: Inspect answers, citations, and raw API responses for the deterministic canary signature.
4. **Report**: Emit SARIF output for GitHub code scanning and enforce a YAML policy gate in CI.

> [!LEAK]
> If a canary planted by Tenant A appears in a raw API response or citation for an intruder or ex-member session, the isolation boundary has failed even if the final answer text suppresses it.

## Similarity vs. authorization

In vector retrieval, top-$k$ selection ranks chunks by cosine similarity:

$$
\text{sim}(q, d) = \frac{q \cdot d}{\|q\| \|d\|}
$$

Without strict pre-filtering on tenant ownership, semantic proximity in embedding space can surface another tenant's document before an access check ever runs.
